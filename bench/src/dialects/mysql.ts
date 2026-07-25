import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql'
import { createPaginator, MysqlPaginationDialect } from 'kysely-cursor'
import { Kysely, MysqlDialect, sql } from 'kysely'
import * as mysql from 'mysql2'

import { seedPosts } from '../seed.js'
import type { BenchDB, DialectHandle } from '../types.js'
import type { DialectFactory } from './types.js'

export const mysqlFactory: DialectFactory = {
  name: 'mysql',
  async setup({ rowCount, hotAuthorId }): Promise<DialectHandle> {
    let container: StartedMySqlContainer | undefined
    let pool: mysql.Pool | undefined
    let db: Kysely<BenchDB> | undefined

    try {
      process.stdout.write('  starting mysql:8.4 container…\n')
      container = await new MySqlContainer('mysql:8.4').start()

      pool = mysql.createPool({
        host: container.getHost(),
        port: container.getPort(),
        user: container.getUsername(),
        password: container.getUserPassword(),
        database: container.getDatabase(),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        dateStrings: false,
      })

      db = new Kysely<BenchDB>({ dialect: new MysqlDialect({ pool }) })

      await sql`
        CREATE TABLE posts (
          id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          author_id   INT NOT NULL,
          title       VARCHAR(255) NOT NULL,
          body        TEXT NOT NULL,
          status      VARCHAR(16) NOT NULL,
          score       INT NOT NULL,
          created_at  DATETIME(3) NOT NULL,
          INDEX posts_created_id_idx (created_at, id),
          INDEX posts_status_created_id_idx (status, created_at, id),
          INDEX posts_author_created_id_idx (author_id, created_at, id),
          INDEX posts_score_id_idx (score, id)
        ) ENGINE=InnoDB
      `.execute(db)

      process.stdout.write(`  seeding ${rowCount.toLocaleString()} rows…\n`)
      await seedPosts(db, rowCount, hotAuthorId, (done, total) => {
        if (done === total || done % 20_000 === 0) {
          process.stdout.write(`    ${done.toLocaleString()}/${total.toLocaleString()}\n`)
        }
      })

      await sql`ANALYZE TABLE posts`.execute(db)

      const paginationDialect = new MysqlPaginationDialect()
      const paginator = createPaginator({ dialect: paginationDialect })

      return {
        name: 'mysql',
        db,
        paginationDialect,
        paginator,
        dispose: async () => {
          await db?.destroy().catch(() => {})
          await new Promise<void>((resolve) => {
            if (pool) pool.end(() => resolve())
            else resolve()
          })
          await container?.stop().catch(() => {})
        },
      }
    } catch (err) {
      await db?.destroy().catch(() => {})
      if (pool) await new Promise<void>((resolve) => pool!.end(() => resolve()))
      await container?.stop().catch(() => {})
      throw err
    }
  },
}
