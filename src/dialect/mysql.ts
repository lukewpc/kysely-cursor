import { BasePaginationDialect } from '~/dialect/base.js'

/**
 * A dialect for MySQL
 */
export class MysqlPaginationDialect extends BasePaginationDialect {
  meta = {
    supportsNullSortDirective: false,
    defaultNullsSortAsc: 'first' as const,
    // MySQL supports row-value comparison; auto uses it for non-null uniform sorts.
    // If benches show regressions vs plain OR, flip this to false so auto stays portable.
    supportsRowValueCompare: true,
  }
}
