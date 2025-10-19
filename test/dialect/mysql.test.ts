import type { StartedMySqlContainer } from '@testcontainers/mysql'
import { MySqlContainer } from '@testcontainers/mysql'
import { Kysely, MysqlDialect, sql } from 'kysely'
import * as mysql from 'mysql2'
import { afterAll, beforeAll, describe } from 'vitest'

import { MysqlPaginationDialect } from '~/dialect/mysql.js'

import type { DatabaseConfig, TestDB } from './shared.js'
import { createTestData, createTestHelpers, runSharedTests } from './shared.js'

describe('MySQL pagination helper', () => {
  let mysqlC: StartedMySqlContainer
  let db: Kysely<TestDB>
  let pool: mysql.Pool

  const config: DatabaseConfig = {
    dialect: MysqlPaginationDialect,
    createTable: async (db) => {
      await sql`
        CREATE TABLE users (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          rating INT NULL,
          active TINYINT(1) NOT NULL DEFAULT 1
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
    mysqlC = await new MySqlContainer('mysql:8.4').start()

    pool = mysql.createPool({
      host: mysqlC.getHost(),
      port: mysqlC.getPort(),
      user: mysqlC.getUsername(),
      password: mysqlC.getUserPassword(),
      database: mysqlC.getDatabase(),
      // reasonable defaults
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: false,
      // Coerce TINYINT(1) to boolean so `active` is true/false
      typeCast: (field: any, next: () => unknown) => {
        if (field.type === 'TINY' && field.length === 1) {
          const val = field.string()
          return val === null ? null : val === '1'
        }
        return next()
      },
    })

    const dialect = new MysqlDialect({ pool })
    db = new Kysely<TestDB>({ dialect })

    await config.createTable(db)
    const testData = createTestData()
    await config.insertTestData(db, testData)
  }, 60_000)

  afterAll(async () => {
    await db?.destroy().catch(() => {})
    await new Promise<void>((resolve) => {
      // Close mysql2 pool
      if (pool) {
        pool.end(() => resolve())
      } else {
        resolve()
      }
    })
    await mysqlC?.stop().catch(() => {})
  })

  runSharedTests(() => createTestHelpers(db, config), 'mysql')
})
