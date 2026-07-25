import type { SelectQueryBuilder } from 'kysely'

import { BasePaginationDialect } from '~/dialect/base.js'

/**
 * A dialect for SQL Server
 */
export class MssqlPaginationDialect extends BasePaginationDialect {
  meta = {
    supportsNullSortDirective: false,
    defaultNullsSortAsc: 'first' as const,
    // No portable SQL row-value comparison on MSSQL.
    supportsRowValueCompare: false,
  }

  override applyLimit<DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    limit: number,
    cursorType?: 'next' | 'prev' | 'offset',
  ): SelectQueryBuilder<DB, TB, O> {
    return cursorType === 'offset' ? builder.fetch(limit) : builder.top(limit)
  }
}
