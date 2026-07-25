import BetterSqlite3 from 'better-sqlite3'
import { createPaginator, SqlitePaginationDialect } from 'kysely-cursor'
import { Kysely, sql, SqliteDialect } from 'kysely'

import { makePost } from '../schema.js'
import type { BenchDB, DialectHandle } from '../types.js'
import type { DialectFactory } from './types.js'

const BATCH = 2_000

export const sqliteFactory: DialectFactory = {
  name: 'sqlite',
  async setup({ rowCount, hotAuthorId }): Promise<DialectHandle> {
    const sqlite = new BetterSqlite3(':memory:')
    sqlite.pragma('journal_mode = MEMORY')
    sqlite.pragma('synchronous = OFF')
    sqlite.pragma('temp_store = MEMORY')
    sqlite.pragma('cache_size = -64000') // ~64MB

    const db = new Kysely<BenchDB>({
      dialect: new SqliteDialect({ database: sqlite }),
    })

    await sql`
      CREATE TABLE posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        author_id   INTEGER NOT NULL,
        title       TEXT NOT NULL,
        body        TEXT NOT NULL,
        status      TEXT NOT NULL,
        score       INTEGER NOT NULL,
        created_at  TEXT NOT NULL
      )
    `.execute(db)

    await sql`CREATE INDEX posts_created_id_idx ON posts (created_at DESC, id DESC)`.execute(db)
    await sql`CREATE INDEX posts_status_created_id_idx ON posts (status, created_at DESC, id DESC)`.execute(db)
    await sql`CREATE INDEX posts_author_created_id_idx ON posts (author_id, created_at DESC, id DESC)`.execute(db)
    await sql`CREATE INDEX posts_score_id_idx ON posts (score DESC, id DESC)`.execute(db)

    process.stdout.write(`  seeding ${rowCount.toLocaleString()} rows…\n`)

    // SQLite: store ISO strings; wrap in a transaction for throughput.
    await sql`BEGIN`.execute(db)
    try {
      for (let start = 0; start < rowCount; start += BATCH) {
        const end = Math.min(start + BATCH, rowCount)
        const rows = []
        for (let i = start; i < end; i++) {
          const p = makePost(i, hotAuthorId)
          rows.push({
            ...p,
            created_at: p.created_at.toISOString() as unknown as Date,
          })
        }
        await db.insertInto('posts').values(rows).execute()
        if (end === rowCount || end % 20_000 === 0) {
          process.stdout.write(`    ${end.toLocaleString()}/${rowCount.toLocaleString()}\n`)
        }
      }
      await sql`COMMIT`.execute(db)
    } catch (err) {
      await sql`ROLLBACK`.execute(db).catch(() => {})
      throw err
    }

    await sql`ANALYZE posts`.execute(db)

    const paginationDialect = new SqlitePaginationDialect()
    const paginator = createPaginator({ dialect: paginationDialect })

    return {
      name: 'sqlite',
      db,
      paginationDialect,
      paginator,
      dispose: async () => {
        await db.destroy().catch(() => {})
      },
    }
  },
}
