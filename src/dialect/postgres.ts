import { BasePaginationDialect } from '~/dialect/base.js'

/**
 * A dialect for PostgreSQL
 */
export class PostgresPaginationDialect extends BasePaginationDialect {
  meta = {
    supportsNullSortDirective: true,
    defaultNullsSortAsc: 'last' as const,
    supportsRowValueCompare: true,
  }
}
