import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createPaginator, PostgresPaginationDialect } from 'kysely-cursor'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'

import { seedPosts } from '../seed.js'
import type { BenchDB, DialectHandle } from '../types.js'
import type { DialectFactory } from './types.js'

export const postgresFactory: DialectFactory = {
  name: 'postgres',
  async setup({ rowCount, hotAuthorId }): Promise<DialectHandle> {
    let container: StartedPostgreSqlContainer | undefined
    let pool: Pool | undefined
    let db: Kysely<BenchDB> | undefined

    try {
      process.stdout.write('  starting postgres:17 container…\n')
      container = await new PostgreSqlContainer('postgres:17').start()
      pool = new Pool({
        connectionString: container.getConnectionUri(),
        max: 10,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
      })
      db = new Kysely<BenchDB>({ dialect: new PostgresDialect({ pool }) })

      await sql`
        CREATE TABLE posts (
          id          SERIAL PRIMARY KEY,
          author_id   INT NOT NULL,
          title       TEXT NOT NULL,
          body        TEXT NOT NULL,
          status      VARCHAR(16) NOT NULL,
          score       INT NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL
        )
      `.execute(db)

      // Indexes that real apps would have for these access patterns.
      await sql`CREATE INDEX posts_created_id_idx ON posts (created_at DESC, id DESC)`.execute(db)
      await sql`CREATE INDEX posts_status_created_id_idx ON posts (status, created_at DESC, id DESC)`.execute(db)
      await sql`CREATE INDEX posts_author_created_id_idx ON posts (author_id, created_at DESC, id DESC)`.execute(db)
      await sql`CREATE INDEX posts_score_id_idx ON posts (score DESC, id DESC)`.execute(db)

      process.stdout.write(`  seeding ${rowCount.toLocaleString()} rows…\n`)
      await seedPosts(db, rowCount, hotAuthorId, (done, total) => {
        if (done === total || done % 20_000 === 0) {
          process.stdout.write(`    ${done.toLocaleString()}/${total.toLocaleString()}\n`)
        }
      })

      // Encourage planner to use the indexes we just built.
      await sql`ANALYZE posts`.execute(db)

      const paginationDialect = new PostgresPaginationDialect()
      const paginator = createPaginator({ dialect: paginationDialect })

      const handle: DialectHandle = {
        name: 'postgres',
        db,
        paginationDialect,
        paginator,
        explain: async (querySql: string) => {
          const res = await sql<{ 'QUERY PLAN': string }>`${sql.raw(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${querySql}`,
          )}`.execute(db!)
          return res.rows.map((r) => r['QUERY PLAN']).join('\n')
        },
        dispose: async () => {
          await db?.destroy().catch(() => {})
          await pool?.end().catch(() => {})
          await container?.stop().catch(() => {})
        },
      }
      return handle
    } catch (err) {
      await db?.destroy().catch(() => {})
      await pool?.end().catch(() => {})
      await container?.stop().catch(() => {})
      throw err
    }
  },
}
