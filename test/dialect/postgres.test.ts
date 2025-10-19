import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe } from 'vitest'

import { PostgresPaginationDialect } from '~/dialect/postgres.js'

import type { DatabaseConfig, TestDB } from './shared.js'
import { createTestData, createTestHelpers, runSharedTests } from './shared.js'

describe('PostgreSQL pagination helper', () => {
  let pg: StartedPostgreSqlContainer
  let pool: Pool
  let db: Kysely<TestDB>

  const config: DatabaseConfig = {
    dialect: PostgresPaginationDialect,
    createTable: async (db) => {
      await db.schema
        .createTable('users')
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('name', 'varchar(255)', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('rating', 'integer')
        .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
        .execute()
    },
    insertTestData: async (db, rows) => {
      await db.insertInto('users').values(rows).execute()
    },
    applySortToQuery: (query, sorts) => {
      for (const s of sorts) {
        const dir = s.dir ?? 'asc'
        // Reproduce PostgresStrategy's NULLS behavior for parity with MSSQL
        query = query.orderBy(s.col, (o: any) => (dir === 'asc' ? o.asc().nullsFirst() : o.desc().nullsLast()))
      }
      return query
    },
  }

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:17').start()
    pool = new Pool({
      connectionString: pg.getConnectionUri(),
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
    })
    db = new Kysely<TestDB>({ dialect: new PostgresDialect({ pool }) })

    await config.createTable(db)
    const testData = createTestData()
    await config.insertTestData(db, testData)
  }, 60_000)

  afterAll(async () => {
    await db?.destroy().catch(() => {})
    await pool?.end().catch(() => {})
    await pg?.stop().catch(() => {})
  })

  runSharedTests(() => createTestHelpers(db, config), 'postgres')
})
