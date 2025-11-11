import { BasePaginationDialect } from '~/dialect/base.js'

/**
 * A dialect for MySQL
 */
export class MysqlPaginationDialect extends BasePaginationDialect {
  meta = {
    supportsNullSortDirective: false,
    defaultNullsSortAsc: 'first' as const,
  }
}
