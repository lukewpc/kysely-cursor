import type { StartedMSSQLServerContainer } from '@testcontainers/mssqlserver'
import { MSSQLServerContainer } from '@testcontainers/mssqlserver'
import { Kysely, MssqlDialect, sql } from 'kysely'
import * as Tarn from 'tarn'
import * as Tedious from 'tedious'
import { afterAll, beforeAll, describe } from 'vitest'

import { MssqlPaginationDialect } from '~/dialect/mssql.js'

import type { DatabaseConfig, TestDB } from './shared.js'
import { createTestData, createTestHelpers, runSharedTests } from './shared.js'

describe('MSSQL pagination helper', () => {
  let mssql: StartedMSSQLServerContainer
  let db: Kysely<TestDB>

  const config: DatabaseConfig = {
    dialect: MssqlPaginationDialect,
    createTable: async (db) => {
      await sql`
        CREATE TABLE users (
          id int IDENTITY(1,1) PRIMARY KEY,
          name nvarchar(255) NOT NULL,
          created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
          rating int NULL,
          active bit NOT NULL DEFAULT 1
        )
      `.execute(db)
    },
    insertTestData: async (db, rows) => {
      await db.insertInto('users').values(rows).execute()
    },
    applySortToQuery: (query, sorts) => {
      for (const s of sorts) {
        const dir = s.dir ?? 'asc'
        // MSSQL's default NULLS behavior: NULLS FIRST for ASC, NULLS LAST for DESC
        query = query.orderBy(s.col as any, dir)
      }
      return query
    },
  }

  beforeAll(async () => {
    mssql = await new MSSQLServerContainer('mcr.microsoft.com/mssql/server:2022-latest').acceptLicense().start()

    const dialect = new MssqlDialect({
      tarn: {
        ...Tarn,
        options: {
          min: 0,
          max: 10,
        },
      },
      tedious: {
        ...Tedious,
        connectionFactory: () =>
          new Tedious.Connection({
            server: mssql.getHost(),
            options: {
              port: mssql.getFirstMappedPort(),
              database: mssql.getDatabase(),
              encrypt: false,
              trustServerCertificate: true,
              requestTimeout: 30_000,
              connectTimeout: 30_000,
            },
            authentication: {
              type: 'default',
              options: {
                userName: mssql.getUsername(),
                password: mssql.getPassword(),
              },
            },
          }),
      },
    })

    db = new Kysely<TestDB>({ dialect })

    await config.createTable(db)
    const testData = createTestData()
    await config.insertTestData(db, testData)
  }, 60_000)

  afterAll(async () => {
    await db?.destroy().catch(() => {})
    await mssql?.stop().catch(() => {})
  })

  runSharedTests(() => createTestHelpers(db, config), 'mssql')
})
