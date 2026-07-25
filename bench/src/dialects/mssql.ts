import { MSSQLServerContainer, type StartedMSSQLServerContainer } from '@testcontainers/mssqlserver'
import { createPaginator, MssqlPaginationDialect } from 'kysely-cursor'
import { Kysely, MssqlDialect, sql } from 'kysely'
import * as Tarn from 'tarn'
import * as Tedious from 'tedious'

import { MSSQL_SEED_BATCH, seedPosts } from '../seed.js'
import type { BenchDB, DialectHandle } from '../types.js'
import type { DialectFactory } from './types.js'

export const mssqlFactory: DialectFactory = {
  name: 'mssql',
  async setup({ rowCount, hotAuthorId }): Promise<DialectHandle> {
    let container: StartedMSSQLServerContainer | undefined
    let db: Kysely<BenchDB> | undefined

    try {
      process.stdout.write('  starting mssql:2022 container…\n')
      container = await new MSSQLServerContainer('mcr.microsoft.com/mssql/server:2022-latest').acceptLicense().start()

      const dialect = new MssqlDialect({
        tarn: {
          ...Tarn,
          options: { min: 0, max: 10 },
        },
        tedious: {
          ...Tedious,
          connectionFactory: () =>
            new Tedious.Connection({
              server: container!.getHost(),
              options: {
                port: container!.getFirstMappedPort(),
                database: container!.getDatabase(),
                encrypt: false,
                trustServerCertificate: true,
                requestTimeout: 120_000,
                connectTimeout: 30_000,
              },
              authentication: {
                type: 'default',
                options: {
                  userName: container!.getUsername(),
                  password: container!.getPassword(),
                },
              },
            }),
        },
      })

      db = new Kysely<BenchDB>({ dialect })

      await sql`
        CREATE TABLE posts (
          id          INT IDENTITY(1,1) PRIMARY KEY,
          author_id   INT NOT NULL,
          title       NVARCHAR(255) NOT NULL,
          body        NVARCHAR(MAX) NOT NULL,
          status      NVARCHAR(16) NOT NULL,
          score       INT NOT NULL,
          created_at  DATETIME2 NOT NULL
        )
      `.execute(db)

      await sql`CREATE INDEX posts_created_id_idx ON posts (created_at DESC, id DESC)`.execute(db)
      await sql`CREATE INDEX posts_status_created_id_idx ON posts (status, created_at DESC, id DESC)`.execute(db)
      await sql`CREATE INDEX posts_author_created_id_idx ON posts (author_id, created_at DESC, id DESC)`.execute(db)
      await sql`CREATE INDEX posts_score_id_idx ON posts (score DESC, id DESC)`.execute(db)

      process.stdout.write(`  seeding ${rowCount.toLocaleString()} rows…\n`)
      await seedPosts(
        db,
        rowCount,
        hotAuthorId,
        (done, total) => {
          if (done === total || done % 5_000 === 0) {
            process.stdout.write(`    ${done.toLocaleString()}/${total.toLocaleString()}\n`)
          }
        },
        MSSQL_SEED_BATCH,
      )

      await sql`UPDATE STATISTICS posts WITH FULLSCAN`.execute(db)

      const paginationDialect = new MssqlPaginationDialect()
      const paginator = createPaginator({ dialect: paginationDialect })

      return {
        name: 'mssql',
        db,
        paginationDialect,
        paginator,
        dispose: async () => {
          await db?.destroy().catch(() => {})
          await container?.stop().catch(() => {})
        },
      }
    } catch (err) {
      await db?.destroy().catch(() => {})
      await container?.stop().catch(() => {})
      throw err
    }
  },
}
