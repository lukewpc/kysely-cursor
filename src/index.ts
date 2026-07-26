// codecs
export { base64UrlCodec } from './codec/base64Url.js'
export type { Codec } from './codec/codec.js'
export { codecPipe } from './codec/codec.js'
export { createAesCodec } from './codec/encrypt.js'
export type { Stash } from './codec/stash.js'
export { stashCodec } from './codec/stash.js'
export { superJsonCodec } from './codec/superJson.js'

// dialects
export { BasePaginationDialect } from './dialect/base.js'
export { MssqlPaginationDialect } from './dialect/mssql.js'
export { MysqlPaginationDialect } from './dialect/mysql.js'
export { PostgresPaginationDialect } from './dialect/postgres.js'
export { SqlitePaginationDialect } from './dialect/sqlite.js'

// cursor
export type { CursorIncoming, CursorPayload, EdgeOutgoing } from './cursor.js'
export { buildCursorPredicateRecursive, CURSOR_VERSION } from './cursor.js'

// error
export type { ErrorCode } from './error.js'
export { PaginationError } from './error.js'

// keyset
export { emitKeysetPredicate } from './keyset.js'

// sorting
export type { NullsDirection, SortItem, SortSet } from './sorting.js'

// paginator
export { createPaginator, paginate, paginateWithEdges } from './paginator.js'
export type {
  DialectMeta,
  KeysetStrategy,
  PaginateArgs,
  PaginatedResult,
  PaginatedResultWithEdges,
  PaginationDialect,
  Paginator,
  PaginatorOptions,
} from './types.js'
