/**
 * kysely-cursor — PostgreSQL example
 *
 * Walks through the main library features against a small `posts` table:
 *   1. Forward / back keyset pagination
 *   2. Filtered feeds (same sorts, different query)
 *   3. Nullable sorts with `nulls: 'last'`
 *   4. `paginateWithEdges` (connection-style)
 *   5. Offset fallback
 *   6. Walking an entire result set
 *
 * Scripts (from this directory, or `pnpm example:postgres` from repo root):
 *   pnpm start     # start Postgres + run demos
 *   pnpm db:up     # start Postgres only
 *   pnpm db:down   # stop Postgres
 *   pnpm dev       # demos only (DB must already be up, or set DATABASE_URL)
 */

import { createDb, destroy, migrate, seed } from './db.js'
import {
  demoFilteredFeed,
  demoForwardAndBack,
  demoNullablePublishedAt,
  demoOffsetFallback,
  demoWalkAll,
  demoWithEdges,
} from './demos.js'
import { createAppPaginator } from './paginator.js'

/** Matches docker-compose.yml (host port 54329 → container 5432). */
export const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:54329/kysely_cursor_example'

async function main() {
  const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL

  console.log('kysely-cursor · PostgreSQL example')
  console.log(`connecting: ${connectionString.replace(/:[^:@/]+@/, ':***@')}`)

  const db = createDb(connectionString)

  try {
    await migrate(db)
    await seed(db)

    // Optional: set PAGINATION_SECRET to encrypt page tokens (AES-GCM).
    const paginator = createAppPaginator({
      secret: process.env.PAGINATION_SECRET,
      keysetStrategy: 'auto',
    })

    if (process.env.PAGINATION_SECRET) {
      console.log('cursor codec: SuperJSON → AES-GCM → Base64URL (PAGINATION_SECRET set)')
    } else {
      console.log('cursor codec: SuperJSON → Base64URL (library default)')
      console.log('tip: export PAGINATION_SECRET=… to demo encrypted tokens')
    }

    await demoForwardAndBack(db, paginator)
    await demoFilteredFeed(db, paginator)
    await demoNullablePublishedAt(db, paginator)
    await demoWithEdges(db, paginator)
    await demoOffsetFallback(db, paginator)
    await demoWalkAll(db, paginator)

    console.log('\n' + '─'.repeat(72))
    console.log(' Done. See README.md in this folder for what each demo shows.')
    console.log('─'.repeat(72) + '\n')
  } finally {
    await destroy(db)
  }
}

try {
  await main()
} catch (err) {
  console.error('\nExample failed:', err)
  console.error(`
Is the example Postgres up?

  pnpm start      # from examples/postgres — starts Compose DB + runs demos
  pnpm db:up      # start DB only, then pnpm dev
  pnpm db:down    # stop when finished

Or set DATABASE_URL to any reachable Postgres instance.
`)
  process.exitCode = 1
}
