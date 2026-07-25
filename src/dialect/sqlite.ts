import { BasePaginationDialect } from '~/dialect/base.js'

/**
 * A dialect for SQLite
 */
export class SqlitePaginationDialect extends BasePaginationDialect {
  meta = {
    supportsNullSortDirective: true,
    defaultNullsSortAsc: 'first' as const,
    supportsRowValueCompare: true,
  }
}
