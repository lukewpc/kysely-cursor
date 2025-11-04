import type { SelectQueryBuilder } from 'kysely'

import type { Codec } from './codec/codec.js'
import type { CursorIncoming, CursorOutgoing, DecodedCursorNextPrev, EdgeOutgoing } from './cursor.js'
import type { SortSet } from './sorting.js'

export type PaginationDialect = {
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
  ) => SelectQueryBuilder<DB, TB, O>
}

export type PaginatorOptions = {
  dialect: PaginationDialect
  /**
   * Defaults to superJson & base64Url
   */
  cursorCodec?: Codec<any, string>
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
