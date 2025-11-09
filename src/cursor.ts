import { createHash } from 'crypto'
import type { ExpressionBuilder, ExpressionWrapper, ReferenceExpression, SqlBool } from 'kysely'
import { z } from 'zod'

import type { Codec } from './codec/codec.js'
import { PaginationError } from './error.js'
import type { NullsDirection, SortItem, SortSet } from './sorting.js'
import { applyDefaultDirection } from './sorting.js'
import { DialectMeta } from '~/types.js'

const CursorPayloadSchema = z.object({
  sig: z.string(),
  k: z.record(z.string(), z.any()),
})
export type CursorPayload = z.output<typeof CursorPayloadSchema>

export type CursorIncoming = { nextPage: string } | { prevPage: string } | { offset: number }

export type DecodedCursorNextPrev = {
  type: 'next' | 'prev'
  payload: CursorPayload
}

export type DecodedOffset = {
  type: 'offset'
  offset: number
}

export type DecodedCursor = DecodedCursorNextPrev | DecodedOffset

export type CursorOutgoing = {
  startCursor?: string
  endCursor?: string
  nextPage?: string
  prevPage?: string
}

export const decodeCursor = async (cursor: CursorIncoming, keysetCodec: Codec<any, string>): Promise<DecodedCursor> => {
  if ('nextPage' in cursor)
    return {
      type: 'next',
      payload: await decodeCursorPayload(cursor.nextPage, keysetCodec),
    }
  if ('prevPage' in cursor)
    return {
      type: 'prev',
      payload: await decodeCursorPayload(cursor.prevPage, keysetCodec),
    }
  if ('offset' in cursor) return {type: 'offset', offset: cursor.offset}

  throw new PaginationError({message: 'Invalid cursor', code: 'INVALID_TOKEN'})
}

const decodeCursorPayload = async (token: string, keysetCodec: Codec<any, string>) => {
  const decoded = await keysetCodec.decode(token)
  return CursorPayloadSchema.parse(decoded)
}

export const resolvePageTokens = async (
  rows: object[],
  sorts: SortSet<any, any, any>,
  cursorCodec: Codec<any, string>,
  decodedCursor: DecodedCursor | null,
  overFetched: boolean,
): Promise<CursorOutgoing> => {
  // if no rows, we return no tokens
  if (rows.length === 0) return {}

  const inverted = decodedCursor?.type === 'prev'
  const isFirst = !decodedCursor || (decodedCursor.type === 'offset' && decodedCursor.offset === 0)

  const first = rows.at(0)
  const last = rows.at(-1)

  const startCursor = first ? await cursorCodec.encode(resolveCursor(first, sorts)) : undefined
  const endCursor = last ? await cursorCodec.encode(resolveCursor(last, sorts)) : undefined

  return {
    startCursor,
    endCursor,
    prevPage: (!inverted || overFetched) && !isFirst ? startCursor : undefined,
    nextPage: inverted || overFetched ? endCursor : undefined,
  }
}

export type EdgeOutgoing<T> = {
  node: T
  cursor: string
}

export const resolveEdges = async <O>(
  rows: O[],
  sorts: SortSet<any, any, any>,
  cursorCodec: Codec<any, string>,
): Promise<EdgeOutgoing<O>[]> => {
  // if no rows, return no edges
  if (rows.length === 0) return []

  return await Promise.all(
    rows.map(async (row) => {
      const cursor = await cursorCodec.encode(resolveCursor(row, sorts))
      return {node: row, cursor}
    }),
  )
}

export const getSortOutput = (sort: SortItem<any, any, any, any>) =>
  'output' in sort ? sort.output : sort.col.split('.').at(-1)!

export const sortSignature = (sorts: SortSet<any, any, any>) => {
  const sig = sorts.map((s) => `${'output' in s ? s.output : s.col}:${s.dir ?? 'asc'}:${s.nulls}`).join('|')
  return createHash('sha256').update(sig).digest('hex').slice(0, 8)
}

export const resolveCursor = (item: any, sorts: SortSet<any, any, any>) => {
  const sig = sortSignature(sorts)

  const k = Object.fromEntries(
    sorts.map((s) => {
      const key = getSortOutput(s)
      return [key, item[key]]
    }),
  )

  return {sig, k}
}

const invertNulls = (nulls: NullsDirection) => {
  return nulls === 'first' ? 'last' : 'first'
}

export const buildCursorPredicateRecursive = <DB, TB extends keyof DB, S extends SortSet<any, any, any>>(
  eb: ExpressionBuilder<DB, TB>,
  sorts: S,
  decoded: CursorPayload,
  meta: DialectMeta,
  idx = 0,
): ExpressionWrapper<DB, TB, SqlBool> => {
  const sort = sorts[idx]
  if (!sort) throw new PaginationError({message: 'Sort index out of bounds', code: 'UNEXPECTED_ERROR'})

  const dir = applyDefaultDirection(sort.dir)
  const col = sort.col as ReferenceExpression<DB, TB>
  const key = getSortOutput(sort)
  if (!(key in decoded.k))
    throw new PaginationError({
      message: `Missing pagination cursor value for "${key}"`,
      code: 'INVALID_TOKEN',
    })

  // Determine the effective NULLS placement for this column given the direction.
  // If caller didn't specify, take dialect defaults (ASC default provided by meta, DESC gets the inverted one).
  const defaultAscNulls = meta.defaultNullsSortAsc // 'first' | 'last'
  const nulls: NullsDirection =
    sort.nulls ?? (dir === 'asc' ? defaultAscNulls : invertNulls(defaultAscNulls))

  const value = decoded.k[key]
  const isLast = idx === sorts.length - 1
  const cmp = dir === 'desc' ? '<' : '>'

  // If there are more sort keys, build the recursive predicate for ties.
  const next = !isLast
    ? buildCursorPredicateRecursive(eb, sorts, decoded, meta, idx + 1)
    : undefined

  // Helper to express an always-false condition in SQL without relying on literals.
  // (col IS NULL AND col IS NOT NULL) is guaranteed false and keeps us inside the builder API.
  const alwaysFalse = eb.and([eb(col, 'is', null), eb(col, 'is not', null)])

  // ──────────────────────────────────────────────────────────────────────────────
  // Cases where the cursor's current value is NULL
  // ──────────────────────────────────────────────────────────────────────────────
  if (value === null) {
    if (nulls === 'first') {
      // Order: NULLs block first, then non-NULLs.
      // After a NULL cursor:
      //   • Remaining NULLs that come after the cursor within the NULLs block (tie goes to `next`)
      //   • All non-NULLs (they come after the NULL block)
      if (isLast) {
        // No `next` to break ties among NULLs. The only way to be "after" is to leave the NULL block.
        return eb(col, 'is not', null)
      }
      return eb.or([eb.and([eb(col, 'is', null), next!]), eb(col, 'is not', null)])
    } else {
      // nulls === 'last'
      // Order: non-NULLs first, then NULLs block.
      // After a NULL cursor inside the trailing NULL block:
      //   • Only remaining NULLs after this row (tie → `next`). There are no non-NULLs after.
      if (isLast) {
        // With no tie-breaker, there is nothing strictly after this NULL within the NULL block.
        return alwaysFalse
      }
      return eb.and([eb(col, 'is', null), next!])
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Cursor value is NON-NULL
  // ──────────────────────────────────────────────────────────────────────────────

  // Base comparisons apply only to non-NULL candidates.
  // (We add NULL candidates depending on null placement.)
  const nonNullGreater = eb.and([eb(col, 'is not', null), eb(col, cmp, value)])
  const nonNullTieThenNext = !isLast
    ? eb.and([eb(col, 'is not', null), eb(col, '=', value), next!])
    : undefined

  if (isLast) {
    // Last sort key: no recursion available.
    // After a non-NULL value:
    //   • non-NULL rows strictly greater (per dir)
    //   • plus NULLs if and only if NULLs are placed after non-NULLs at this position
    return eb.or([
      nonNullGreater,
      ...(nulls === 'last' ? [eb(col, 'is', null)] : []),
    ])
  }

  // Not last: include the tie → next, and include NULLs when they are placed after non-NULLs.
  return eb.or([
    nonNullGreater, // advance on current column
    nonNullTieThenNext!, // tie → look at the next column
    ...(nulls === 'last' ? [eb(col, 'is', null)] : []), // when NULLs are after, they are also "after" the cursor
  ])
}
