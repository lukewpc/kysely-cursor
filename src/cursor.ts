import { createHash } from 'crypto'
import type { ExpressionBuilder, ExpressionWrapper, ReferenceExpression, SqlBool } from 'kysely'
import { z } from 'zod'

import type { DialectMeta } from '~/types.js'

import type { Codec } from './codec/codec.js'
import { PaginationError } from './error.js'
import type { NullsDirection, SortItem, SortSet } from './sorting.js'
import { applyDefaultDirection } from './sorting.js'

/**
 * Version of the cursor payload format.
 * Bump this (and the schema literal) whenever the payload shape changes in a
 * backwards-incompatible way, so old tokens fail loudly instead of silently
 * mis-paginating.
 */
export const CURSOR_VERSION = 1 as const

const CursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
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
  if ('offset' in cursor) {
    if (!Number.isInteger(cursor.offset) || cursor.offset < 0)
      throw new PaginationError({ message: 'Invalid pagination offset', code: 'INVALID_TOKEN' })
    return { type: 'offset', offset: cursor.offset }
  }

  throw new PaginationError({ message: 'Invalid cursor', code: 'INVALID_TOKEN' })
}

const decodeCursorPayload = async (token: string, keysetCodec: Codec<any, string>) => {
  let decoded: unknown
  try {
    decoded = await keysetCodec.decode(token)
  } catch (error) {
    throw new PaginationError({ message: 'Invalid page token', code: 'INVALID_TOKEN', cause: error as Error })
  }

  const parsed = CursorPayloadSchema.safeParse(decoded)
  if (!parsed.success) {
    const version = (decoded as { v?: unknown } | null)?.v
    const message =
      typeof version === 'number' && version !== CURSOR_VERSION
        ? `Unsupported cursor version: ${version}`
        : 'Invalid page token'
    throw new PaginationError({ message, code: 'INVALID_TOKEN', cause: parsed.error })
  }

  return parsed.data
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
      return { node: row, cursor }
    }),
  )
}

export const getSortOutput = (sort: SortItem<any, any, any, any>) =>
  'output' in sort ? sort.output : sort.col.split('.').at(-1)!

/** Preimage fragment for omitted `nulls` — part of the cursor contract; do not change without bumping {@link CURSOR_VERSION}. */
const NULLS_SIG_OMITTED = '-'

export const sortSignature = (sorts: SortSet<any, any, any>) => {
  const sig = sorts
    .map((s) => `${'output' in s ? s.output : s.col}:${s.dir ?? 'asc'}:${s.nulls ?? NULLS_SIG_OMITTED}`)
    .join('|')
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

  return { v: CURSOR_VERSION, sig, k }
}

export const invertNulls = (nulls: NullsDirection) => {
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
  if (!sort) throw new PaginationError({ message: 'Sort index out of bounds', code: 'UNEXPECTED_ERROR' })

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
  const nulls: NullsDirection = sort.nulls ?? (dir === 'asc' ? defaultAscNulls : invertNulls(defaultAscNulls))

  const value = decoded.k[key]
  const isLast = idx === sorts.length - 1
  const cmp = dir === 'desc' ? '<' : '>'

  // Final sort is non-nullable; null here means a malformed token.
  if (isLast && value === null)
    throw new PaginationError({
      message: `Pagination cursor has null value for final sort "${key}"`,
      code: 'INVALID_TOKEN',
    })

  // If there are more sort keys, build the recursive predicate for ties.
  const next = !isLast ? buildCursorPredicateRecursive(eb, sorts, decoded, meta, idx + 1) : undefined

  // NULL cursor value (never the last sort key — rejected above).
  if (value === null) {
    if (nulls === 'first') {
      // Remaining NULLs in the leading NULL block (tie → next), then all non-NULLs.
      return eb.or([eb.and([eb(col, 'is', null), next!]), eb(col, 'is not', null)])
    }
    // nulls === 'last': only remaining NULLs after this row (tie → next).
    return eb.and([eb(col, 'is', null), next!])
  }

  // Non-NULL cursor value.
  const nonNullGreater = eb.and([eb(col, 'is not', null), eb(col, cmp, value)])
  const nonNullTieThenNext = !isLast ? eb.and([eb(col, 'is not', null), eb(col, '=', value), next!]) : undefined

  if (isLast) {
    // Strictly greater non-NULLs; include NULLs only when they sort after non-NULLs.
    return eb.or([nonNullGreater, ...(nulls === 'last' ? [eb(col, 'is', null)] : [])])
  }

  return eb.or([nonNullGreater, nonNullTieThenNext!, ...(nulls === 'last' ? [eb(col, 'is', null)] : [])])
}
