import { type Generated, Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'

/**
 * Tiny blog schema used by the demos.
 *
 * Indexes match the common keyset sort shapes so Postgres can seek instead of
 * scanning — the same composite indexes you want in production.
 */
export type Post = {
  id: Generated<number>
  title: string
  author: string
  /** Higher is better — used by the scoreboard demo. */
  score: number
  /** Null means draft / not yet published. */
  published_at: Date | null
  created_at: Date
}

export type Database = {
  posts: Post
}

export type PostRow = {
  id: number
  title: string
  author: string
  score: number
  published_at: Date | null
  created_at: Date
}

const AUTHORS = ['ada', 'grace', 'linus', 'barbara'] as const

export function createDb(connectionString: string): Kysely<Database> {
  const pool = new Pool({ connectionString })
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  })
}

export async function migrate(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('posts')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('author', 'text', (col) => col.notNull())
    .addColumn('score', 'integer', (col) => col.notNull())
    .addColumn('published_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Feed: (created_at DESC, id DESC) — matches nullable:false seek path on Postgres.
  await sql`
    create index if not exists posts_created_at_id_desc
    on posts (created_at desc, id desc)
  `.execute(db)

  // Author timeline: equality on author + same keyset tail.
  await sql`
    create index if not exists posts_author_created_at_id_desc
    on posts (author, created_at desc, id desc)
  `.execute(db)

  // Scoreboard.
  await sql`
    create index if not exists posts_score_id_desc
    on posts (score desc, id desc)
  `.execute(db)

  // Published feed with drafts (null published_at) ordered last.
  await sql`
    create index if not exists posts_published_at_id_desc
    on posts (published_at desc nulls last, id desc)
  `.execute(db)
}

/** Deterministic seed so re-runs are stable and demos print the same shape. */
export async function seed(db: Kysely<Database>, count = 24): Promise<void> {
  const existing = await db
    .selectFrom('posts')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow()

  if (Number(existing.count) >= count) return

  await db.deleteFrom('posts').execute()

  const base = Date.UTC(2024, 0, 1, 12, 0, 0)
  const rows = Array.from({ length: count }, (_, i) => {
    const n = i + 1
    const isDraft = n % 5 === 0
    return {
      title: `Post ${String(n).padStart(2, '0')}`,
      author: AUTHORS[i % AUTHORS.length]!,
      score: (n * 17) % 100,
      // Every 5th post is a draft (null published_at).
      published_at: isDraft ? null : new Date(base + i * 3_600_000),
      created_at: new Date(base + i * 3_600_000),
    }
  })

  await db.insertInto('posts').values(rows).execute()
}

/** Kysely owns the pool lifecycle when the dialect was given that pool. */
export async function destroy(db: Kysely<Database>): Promise<void> {
  await db.destroy()
}
