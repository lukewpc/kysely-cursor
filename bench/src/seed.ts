import type { Kysely } from 'kysely'

import { makePost } from './schema.js'
import type { BenchDB } from './types.js'

/** Default multi-row insert size. MSSQL caps at 2100 params (~6 cols → max ~350 rows). */
export const DEFAULT_SEED_BATCH = 2_000
export const MSSQL_SEED_BATCH = 300

/**
 * Insert `rowCount` deterministic posts in batches.
 * Assumes the table is empty; callers are responsible for schema setup.
 */
export const seedPosts = async (
  db: Kysely<BenchDB>,
  rowCount: number,
  hotAuthorId: number,
  onProgress?: (done: number, total: number) => void,
  batchSize: number = DEFAULT_SEED_BATCH,
): Promise<void> => {
  for (let start = 0; start < rowCount; start += batchSize) {
    const end = Math.min(start + batchSize, rowCount)
    const rows = []
    for (let i = start; i < end; i++) {
      rows.push(makePost(i, hotAuthorId))
    }
    await db.insertInto('posts').values(rows).execute()
    onProgress?.(end, rowCount)
  }
}

export const countPosts = async (db: Kysely<BenchDB>): Promise<number> => {
  const row = await db
    .selectFrom('posts')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()
  return Number(row.count)
}
