import { BasePaginationDialect } from '~/dialect/base.js'

/**
 * A dialect for MySQL
 */
export class MysqlPaginationDialect extends BasePaginationDialect {
  meta = {
    supportsNullSortDirective: false,
    defaultNullsSortAsc: 'first' as const,
    // Benches: null-safe OR seeks well; both plain OR and row compare regress badly
    // at depth when notNull: true opts out of the null-safe tree. Stay on null_safe_or.
    supportsRowValueCompare: false,
    supportsPlainOrKeyset: false,
  }
}
