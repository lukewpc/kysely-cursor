// codecs
export { base64UrlCodec } from './codec/base64Url.js'
export type { Codec } from './codec/codec.js'
export { codecPipe } from './codec/codec.js'
export { createAesCodec } from './codec/encrypt.js'
export { stashCodec } from './codec/stash.js'
export { superJsonCodec } from './codec/superJson.js'

// dialects
export { BasePaginationDialect } from './dialect/base.js'
export { MssqlPaginationDialect } from './dialect/mssql.js'
export { MysqlPaginationDialect } from './dialect/mysql.js'
export { PostgresPaginationDialect } from './dialect/postgres.js'
export { SqlitePaginationDialect } from './dialect/sqlite.js'

// cursor
export { buildCursorPredicateRecursive, CursorIncoming, EdgeOutgoing } from './cursor.js'

// error
export { ErrorCode, PaginationError } from './error.js'

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
