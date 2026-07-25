import type { SelectQueryBuilder } from 'kysely'

import type { Codec } from './codec/codec.js'
import type { CursorIncoming, CursorOutgoing, DecodedCursorNextPrev, EdgeOutgoing } from './cursor.js'
import type { NullsDirection, SortSet } from './sorting.js'

export type DialectMeta = {
  supportsNullSortDirective: boolean
  defaultNullsSortAsc: NullsDirection
  /** SQL row-value comparison: (a, b) < ($1, $2) */
  supportsRowValueCompare: boolean
  /**
   * When false, `simple_non_null` sorts stay on the null-safe OR tree instead of
   * classic plain OR. MySQL's optimizer seeks the null-safe form well but often
   * walks plain OR / row compare at depth (benches). Defaults to true.
   */
  supportsPlainOrKeyset?: boolean
}

/**
 * How the library chooses keyset WHERE emission for non-null uniform sorts.
 *
 * - `auto` (default): row compare when the dialect supports it and sorts allow;
 *   otherwise plain multi-column OR. Nullable / null-ordered sorts stay null-safe.
 * - `portable`: never emit row compare (only null-safe OR / plain OR).
 * - `seek`: prefer row compare when class + dialect allow; same fallbacks as `auto`.
 */
export type KeysetStrategy = 'auto' | 'portable' | 'seek'

export type PaginationDialect = {
  meta: DialectMeta

  applyLimit: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    limit: number,
    cursorType?: 'next' | 'prev' | 'offset',
  ) => SelectQueryBuilder<DB, TB, O>

  applyOffset: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    offset: number,
  ) => SelectQueryBuilder<DB, TB, O>

  applySort: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    sorts: SortSet<DB, TB, O>,
  ) => SelectQueryBuilder<DB, TB, O>

  applyCursor: <DB, TB extends keyof DB, O>(
    query: SelectQueryBuilder<DB, TB, O>,
    sorts: SortSet<DB, TB, O>,
    cursor: DecodedCursorNextPrev,
    keysetStrategy?: KeysetStrategy,
  ) => SelectQueryBuilder<DB, TB, O>
}

export type PaginatorOptions = {
  dialect: PaginationDialect
  /**
   * Defaults to superJson & base64Url
   */
  cursorCodec?: Codec<any, string>
  /**
   * Keyset WHERE emission preference. Defaults to `auto`.
   * See {@link KeysetStrategy}.
   */
  keysetStrategy?: KeysetStrategy
}

export type PaginateArgs<DB, TB extends keyof DB, O, S extends SortSet<DB, TB, O>> = {
  query: SelectQueryBuilder<DB, TB, O>
  sorts: S
  limit: number
  cursor?: CursorIncoming
}

export type PaginatedResult<T> = {
  items: T[]
  hasNextPage: boolean
  hasPrevPage: boolean
} & CursorOutgoing

export type PaginatedResultWithEdges<T> = Omit<PaginatedResult<T>, 'items'> & {
  edges: EdgeOutgoing<T>[]
}

export type Paginator = {
  paginate: <DB, TB extends keyof DB, O, S extends SortSet<DB, TB, O>>(
    args: PaginateArgs<DB, TB, O, S>,
  ) => Promise<PaginatedResult<O>>
  paginateWithEdges: <DB, TB extends keyof DB, O, S extends SortSet<DB, TB, O>>(
    args: PaginateArgs<DB, TB, O, S>,
  ) => Promise<PaginatedResultWithEdges<O>>
}
