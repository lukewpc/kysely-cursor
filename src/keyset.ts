import type { ExpressionBuilder, ExpressionWrapper, ReferenceExpression, SqlBool } from 'kysely'
import { sql } from 'kysely'

import type { CursorPayload } from './cursor.js'
import { buildCursorPredicateRecursive, getSortOutput } from './cursor.js'
import { PaginationError } from './error.js'
import type { SortSet } from './sorting.js'
import { applyDefaultDirection } from './sorting.js'
import type { DialectMeta, KeysetStrategy } from './types.js'

export type KeysetClass =
  | { kind: 'null_safe' }
  | {
      kind: 'simple_non_null'
      uniformDir: 'asc' | 'desc' | 'mixed'
    }

export type EmitKind = 'null_safe_or' | 'plain_or' | 'row_compare'

/**
 * Classify applied sorts + cursor payload for keyset emission.
 * Run only on **applied** sorts (after prev-page inversion).
 */
export const classifyKeyset = (sorts: SortSet<any, any, any>, payload: CursorPayload): KeysetClass => {
  for (let i = 0; i < sorts.length; i++) {
    const sort = sorts[i]!
    const isLast = i === sorts.length - 1
    const key = getSortOutput(sort)

    if (!(key in payload.k))
      throw new PaginationError({
        message: `Missing pagination cursor value for "${key}"`,
        code: 'INVALID_TOKEN',
      })

    const value = payload.k[key]

    // Final key must be non-null (unique tie-breaker). Fail loudly.
    if (isLast && value === null)
      throw new PaginationError({
        message: `Pagination cursor has null value for final sort "${key}"`,
        code: 'INVALID_TOKEN',
      })

    // Explicit null placement always forces the null-safe path.
    if (sort.nulls === 'first' || sort.nulls === 'last') return { kind: 'null_safe' }

    // Non-final keys default to nullable unless the caller opts out.
    if (!isLast) {
      if (sort.nullable !== false) return { kind: 'null_safe' }
      // Defensive: a null in the token on a "non-null" leading key falls back
      // to the null-safe path rather than emitting non-null SQL.
      if (value === null) return { kind: 'null_safe' }
    }
  }

  let uniformDir: 'asc' | 'desc' | 'mixed' | undefined
  for (const sort of sorts) {
    const dir = applyDefaultDirection(sort.dir)
    if (uniformDir === undefined) {
      uniformDir = dir
    } else if (uniformDir !== dir) {
      uniformDir = 'mixed'
      break
    }
  }

  return { kind: 'simple_non_null', uniformDir: uniformDir ?? 'asc' }
}

/**
 * Select emission strategy from classification + dialect capability + option.
 */
export const selectKeysetStrategy = (
  class_: KeysetClass,
  meta: DialectMeta,
  opt: KeysetStrategy = 'auto',
): EmitKind => {
  if (class_.kind === 'null_safe') return 'null_safe_or'

  // `portable` never uses row compare; `auto` prefers it when class + dialect allow.
  const allowRow = opt !== 'portable' && meta.supportsRowValueCompare && class_.uniformDir !== 'mixed'

  if (allowRow) return 'row_compare'

  // Some engines (MySQL) seek null-safe OR better than classic plain OR at depth.
  if (meta.supportsPlainOrKeyset === false) return 'null_safe_or'

  return 'plain_or'
}

/**
 * Emit a keyset WHERE predicate for the given applied sorts + cursor payload.
 */
export const emitKeysetPredicate = <DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  sorts: SortSet<any, any, any>,
  payload: CursorPayload,
  meta: DialectMeta,
  keysetStrategy: KeysetStrategy = 'auto',
): ExpressionWrapper<DB, TB, SqlBool> => {
  const class_ = classifyKeyset(sorts, payload)
  const kind = selectKeysetStrategy(class_, meta, keysetStrategy)

  switch (kind) {
    case 'null_safe_or':
      return buildCursorPredicateRecursive(eb, sorts, payload, meta)
    case 'plain_or':
      return buildPlainOrPredicate(eb, sorts, payload)
    case 'row_compare':
      // uniformDir is always asc|desc when row_compare is selected
      return buildRowComparePredicate(
        eb,
        sorts,
        payload,
        (class_ as { kind: 'simple_non_null'; uniformDir: 'asc' | 'desc' }).uniformDir,
      )
  }
}

/**
 * Classic multi-column keyset without IS NULL / IS NOT NULL guards.
 * Equivalent to null-safe OR for non-null data with matching ORDER BY.
 */
export const buildPlainOrPredicate = <DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  sorts: SortSet<any, any, any>,
  payload: CursorPayload,
  idx = 0,
): ExpressionWrapper<DB, TB, SqlBool> => {
  const sort = sorts[idx]
  if (!sort) throw new PaginationError({ message: 'Sort index out of bounds', code: 'UNEXPECTED_ERROR' })

  const dir = applyDefaultDirection(sort.dir)
  const col = sort.col as ReferenceExpression<DB, TB>
  const key = getSortOutput(sort)
  if (!(key in payload.k))
    throw new PaginationError({
      message: `Missing pagination cursor value for "${key}"`,
      code: 'INVALID_TOKEN',
    })

  const value = payload.k[key]
  const isLast = idx === sorts.length - 1
  const cmp = dir === 'desc' ? '<' : '>'

  if (isLast && value === null)
    throw new PaginationError({
      message: `Pagination cursor has null value for final sort "${key}"`,
      code: 'INVALID_TOKEN',
    })

  if (isLast) return eb(col, cmp, value)

  const next = buildPlainOrPredicate(eb, sorts, payload, idx + 1)
  return eb.or([eb(col, cmp, value), eb.and([eb(col, '=', value), next])])
}

/**
 * Row-value comparison: `(c1, c2, …) < ($1, $2, …)` (DESC) or `>` (ASC).
 * Only valid for uniform direction; caller must gate mixed dirs.
 */
export const buildRowComparePredicate = <DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  sorts: SortSet<any, any, any>,
  payload: CursorPayload,
  uniformDir: 'asc' | 'desc',
): ExpressionWrapper<DB, TB, SqlBool> => {
  // Validate keys / final non-null up front (same errors as other emitters).
  for (let i = 0; i < sorts.length; i++) {
    const sort = sorts[i]!
    const key = getSortOutput(sort)
    if (!(key in payload.k))
      throw new PaginationError({
        message: `Missing pagination cursor value for "${key}"`,
        code: 'INVALID_TOKEN',
      })
    if (i === sorts.length - 1 && payload.k[key] === null)
      throw new PaginationError({
        message: `Pagination cursor has null value for final sort "${key}"`,
        code: 'INVALID_TOKEN',
      })
  }

  // Single-column: row compare degenerates to a plain comparison (no tuple).
  if (sorts.length === 1) {
    const sort = sorts[0]!
    const col = sort.col as ReferenceExpression<DB, TB>
    const key = getSortOutput(sort)
    const cmp = uniformDir === 'desc' ? '<' : '>'
    return eb(col, cmp, payload.k[key])
  }

  const colExprs = sorts.map((s) => {
    const col = s.col
    return typeof col === 'string' ? sql.ref(col) : (col as any)
  })
  const valExprs = sorts.map((s) => sql.val(payload.k[getSortOutput(s)]))
  const op = uniformDir === 'desc' ? '<' : '>'

  // Bound parameters only — no string-concatenated literals.
  // Cast through ExpressionWrapper so the return type matches other emitters;
  // RawBuilder is accepted by Kysely's where() the same way.
  return sql<SqlBool>`(${sql.join(colExprs)}) ${sql.raw(op)} (${sql.join(valExprs)})` as unknown as ExpressionWrapper<
    DB,
    TB,
    SqlBool
  >
}
