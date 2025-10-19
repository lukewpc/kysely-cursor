import type { OrderByExpression, SelectQueryBuilder } from 'kysely'

import { baseApplyCursor } from '../cursor.js'
import type { SortSet } from '../sorting.js'
import type { PaginationDialect } from '../types.js'

/**
 * A dialect for SQL Server
 */
export const MssqlPaginationDialect: PaginationDialect = {
  applyLimit: (builder, limit, cursorType) => (cursorType === 'offset' ? builder.fetch(limit) : builder.top(limit)),

  applyOffset: (builder, offset) => builder.offset(offset),

  applySort: <DB, TB extends keyof DB, O>(builder: SelectQueryBuilder<DB, TB, O>, sorts: SortSet<DB, TB, O>) => {
    for (const s of sorts) {
      const dir = s.dir ?? 'asc'

      builder = builder.orderBy(s.col as OrderByExpression<DB, TB, O>, dir)
    }

    return builder
  },

  applyCursor: baseApplyCursor,
}
