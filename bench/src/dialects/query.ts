import type { SelectQueryBuilder } from 'kysely'

import type { DialectName } from '../config.js'

/**
 * Apply LIMIT/OFFSET in a dialect-safe way.
 * MSSQL rejects `LIMIT` — use TOP for offset-free pages and OFFSET/FETCH otherwise.
 */
export const applyPageWindow = <DB, TB extends keyof DB, O>(
  dialect: DialectName,
  builder: SelectQueryBuilder<DB, TB, O>,
  limit: number,
  offset = 0,
): SelectQueryBuilder<DB, TB, O> => {
  if (dialect === 'mssql') {
    if (offset > 0) {
      return builder.offset(offset).fetch(limit)
    }
    return builder.top(limit)
  }

  if (offset > 0) {
    return builder.offset(offset).limit(limit)
  }
  return builder.limit(limit)
}
