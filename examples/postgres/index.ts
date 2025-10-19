import { Generated, Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import { createPaginator, PostgresPaginationDialect } from 'kysely-cursor'

type User = {
  id: Generated<number>
  name: string
  created_at: Date
}

type DB = {
  users: User
}

async function main() {
  const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres'

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({connectionString}),
    }),
  })

  try {
    await db.schema
      .createTable('users')
      .ifNotExists()
      .addColumn('id', 'serial', (col) => col.primaryKey())
      .addColumn('name', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now
      ()`))
      .execute()

    const countRow = await db
      .selectFrom('users')
      .select(sql`count(0)::int`.as('count'))
      .executeTakeFirst()
    const rowCount = (countRow?.count ?? 0) as number

    if (rowCount < 10) {
      const now = Date.now()
      const rows = Array.from({length: 12}, (_, i) => ({
        name: `User ${String(i + 1).padStart(2, '0')}`,
        created_at: new Date(now - i * 60 * 60 * 1000), // 1h apart
      }))
      await db.insertInto('users').values(rows).execute()
    }

    const paginator = createPaginator({dialect: PostgresPaginationDialect})

    const sorts = [
      {col: 'created_at', dir: 'desc'},
      {col: 'id', dir: 'desc'}, // final non-nullable sort for deterministic ordering
    ] as const

    const query = db.selectFrom('users').select(['id', 'name', 'created_at'])

    // Page 1
    const page1 = await paginator.paginate({query, sorts, limit: 5})
    console.log('\nPage 1:')
    console.table(page1.items.map((r) => ({id: r.id, name: r.name, created_at: r.created_at})))
    console.log('nextPage:', page1.nextPage ? `${page1.nextPage.slice(0, 24)}…` : undefined)

    // Page 2 (forward)
    if (page1.nextPage) {
      const page2 = await paginator.paginate({
        query,
        sorts,
        limit: 5,
        cursor: {nextPage: page1.nextPage},
      })
      console.log('\nPage 2 (forward):')
      console.table(page2.items.map((r) => ({id: r.id, name: r.name, created_at: r.created_at})))
      console.log('prevPage:', page2.prevPage ? `${page2.prevPage.slice(0, 24)}…` : undefined)

      // Back to Page 1 (backward)
      if (page2.prevPage) {
        const backTo1 = await paginator.paginate({
          query,
          sorts,
          limit: 5,
          cursor: {prevPage: page2.prevPage},
        })
        console.log('\nBack to Page 1 (backward):')
        console.table(backTo1.items.map((r) => ({id: r.id, name: r.name, created_at: r.created_at})))
      }
    }
  } finally {
    await db.destroy()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
