import { OrderByExpression, SelectQueryBuilder } from 'kysely'
import { DialectMeta, PaginationDialect } from '../types.js'
import { SortSet } from '../sorting.js'
import { buildCursorPredicateRecursive, DecodedCursorNextPrev } from '../cursor.js'
import { PaginationError } from '~/error.js'

export abstract class BasePaginationDialect implements PaginationDialect {
  abstract meta: DialectMeta

  applyLimit<DB, TB extends keyof DB, O>(builder: SelectQueryBuilder<DB, TB, O>, limit: number): SelectQueryBuilder<DB, TB, O> {
    return builder.limit(limit)
  }

  applyOffset<DB, TB extends keyof DB, O>(builder: SelectQueryBuilder<DB, TB, O>, offset: number): SelectQueryBuilder<DB, TB, O> {
    return builder.offset(offset)
  }

  applySort<DB, TB extends keyof DB, O>(builder: SelectQueryBuilder<DB, TB, O>, sorts: SortSet<DB, TB, O>): SelectQueryBuilder<DB, TB, O> {
    for (const s of sorts) {
      const dir = s.dir ?? 'asc'

      builder = builder.orderBy(s.col as OrderByExpression<DB, TB, O>, (a) => {
        const sort = dir === 'desc' ? a.desc() : a.asc()

        if (!s.nulls) return sort

        if (!this.meta.supportsNullSortDirective) throw new PaginationError({
          code: 'INVALID_SORT',
          message: 'This dialect does not support nulls first/last',
        })

        switch (s.nulls) {
          case 'first':
            return sort.nullsFirst()
          case 'last':
            return sort.nullsLast()
          default:
            throw new PaginationError({
              message: 'Unsupported nulls first/last', code: 'INVALID_SORT'
            })
        }
      })
    }

    return builder as SelectQueryBuilder<DB, TB, O>
  }

  applyCursor<DB, TB extends keyof DB, O>(query: SelectQueryBuilder<DB, TB, O>, sorts: SortSet<DB, TB, O>, cursor: DecodedCursorNextPrev): SelectQueryBuilder<DB, TB, O> {
    return query.where((eb) => buildCursorPredicateRecursive(eb, sorts, cursor.payload, this.meta))
  }
}
