import BetterSqlite3 from 'better-sqlite3'
import { Kysely, sql, SqliteDialect } from 'kysely'

import { SqlitePaginationDialect } from '~/dialect/sqlite.js'

import type { DatabaseConfig, TestDB } from './shared.js'
import { createTestData, createTestHelpers, runSharedTests } from './shared.js'

describe('SQLite pagination helper', () => {
  let db: Kysely<TestDB>

  const config: DatabaseConfig = {
    dialect: SqlitePaginationDialect,
    createTable: async (db) => {
      await sql`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          rating INTEGER NULL,
          active INTEGER NOT NULL DEFAULT 1
        )
      `.execute(db)
    },
    insertTestData: async (db, rows) => {
      await db
        .insertInto('users')
        .values(
          rows.map(
            (r) =>
              ({
                ...r,
                created_at: (r.created_at as unknown as Date).toISOString(),
                active: r.active ? 1 : 0,
              }) as any,
          ),
        )
        .execute()
    },
    applySortToQuery: (query, sorts) => {
      for (const s of sorts) {
        const dir = s.dir ?? 'asc'
        query = query.orderBy(s.col, dir)
      }
      return query
    },
  }

  beforeAll(async () => {
    const sqlite = new BetterSqlite3(':memory:')
    const dialect = new SqliteDialect({ database: sqlite })
    db = new Kysely<TestDB>({ dialect })

    await config.createTable(db)
    const testData = createTestData()
    await config.insertTestData(db, testData)
  })

  afterAll(async () => {
    await db?.destroy().catch(() => {})
  })

  const createCoercingHelpers = () => {
    const base = createTestHelpers(db, config)
    const coerce = (r: any) => ({ ...r, active: r.active === 1 || r.active === true })
    return {
      ...base,
      fetchAllPlainSorted: async (sorts: any) => {
        const res = await base.fetchAllPlainSorted(sorts)
        return res.map(coerce)
      },
      page: async (limit: number, sorts: any, token?: string) => {
        const res = await base.page(limit, sorts, token)
        return { ...res, items: res.items.map(coerce) }
      },
    }
  }

  runSharedTests(createCoercingHelpers, 'sqlite')
})
