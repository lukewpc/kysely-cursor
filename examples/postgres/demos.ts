import type { Kysely } from 'kysely'
import type { Paginator } from 'kysely-cursor'

import type { Database, PostRow } from './db.js'

const PAGE_SIZE = 5

/** Chronological feed — non-null keys unlock Postgres row-compare seeks. */
export const feedSorts = [
  {
    col: 'posts.created_at' as const,
    dir: 'desc' as const,
    output: 'created_at' as const,
    /** Assert no NULLs so the dialect may emit `(created_at, id) < ($1, $2)`. */
    nullable: false as const,
  },
  // Final sort must be unique + non-nullable (tie-breaker). Prefer a primary key.
  { col: 'posts.id' as const, dir: 'desc' as const, output: 'id' as const },
] as const

/** Ranking by score. */
export const scoreSorts = [
  {
    col: 'posts.score' as const,
    dir: 'desc' as const,
    output: 'score' as const,
    nullable: false as const,
  },
  { col: 'posts.id' as const, dir: 'desc' as const, output: 'id' as const },
] as const

/**
 * Nullable `published_at` with explicit NULLS LAST (Postgres supports the directive).
 * Do **not** set `nullable: false` here — drafts are NULL and need the null-safe path.
 */
export const publishedSorts = [
  {
    col: 'posts.published_at' as const,
    dir: 'desc' as const,
    output: 'published_at' as const,
    nulls: 'last' as const,
  },
  { col: 'posts.id' as const, dir: 'desc' as const, output: 'id' as const },
] as const

function postsQuery(db: Kysely<Database>) {
  return db.selectFrom('posts').select(['id', 'title', 'author', 'score', 'published_at', 'created_at'])
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

function printRows(rows: PostRow[], extra?: (r: PostRow) => Record<string, unknown>) {
  console.table(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      score: r.score,
      published_at: fmtDate(r.published_at),
      created_at: fmtDate(r.created_at),
      ...extra?.(r),
    })),
  )
}

function printPageMeta(page: {
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage?: string
  nextPage?: string
  startCursor?: string
  endCursor?: string
}) {
  const clip = (t?: string) => (t ? `${t.slice(0, 28)}…` : undefined)
  console.log('  hasPrevPage:', page.hasPrevPage, ' hasNextPage:', page.hasNextPage)
  console.log('  prevPage:   ', clip(page.prevPage))
  console.log('  nextPage:   ', clip(page.nextPage))
  console.log('  startCursor:', clip(page.startCursor))
  console.log('  endCursor:  ', clip(page.endCursor))
}

function heading(title: string, blurb: string) {
  console.log('\n' + '─'.repeat(72))
  console.log(` ${title}`)
  console.log('─'.repeat(72))
  console.log(` ${blurb}\n`)
}

/** Demo 1 — first page, next page, then walk back with prevPage. */
export async function demoForwardAndBack(db: Kysely<Database>, paginator: Paginator) {
  heading(
    '1. Forward / back keyset pagination',
    'Tokens are opaque; sorts must stay identical between requests (signature check).',
  )

  const query = postsQuery(db)

  const page1 = await paginator.paginate({
    query,
    sorts: feedSorts,
    limit: PAGE_SIZE,
  })

  console.log('Page 1 (newest first):')
  printRows(page1.items)
  printPageMeta(page1)

  if (!page1.nextPage) {
    console.log('No next page — seed more rows if you expected one.')
    return
  }

  const page2 = await paginator.paginate({
    query,
    sorts: feedSorts,
    limit: PAGE_SIZE,
    cursor: { nextPage: page1.nextPage },
  })

  console.log('\nPage 2 (forward via nextPage):')
  printRows(page2.items)
  printPageMeta(page2)

  if (!page2.prevPage) return

  const back = await paginator.paginate({
    query,
    sorts: feedSorts,
    limit: PAGE_SIZE,
    cursor: { prevPage: page2.prevPage },
  })

  console.log('\nBack to page 1 (via prevPage — library inverts sorts internally):')
  printRows(back.items)
  printPageMeta(back)

  const sameIds =
    page1.items.length === back.items.length && page1.items.every((r, i) => r.id === back.items[i]?.id)
  console.log(sameIds ? '\n✓ Backward page matches page 1 item ids.' : '\n✗ Unexpected mismatch walking back.')
}

/** Demo 2 — same paginator + sorts, different filtered query (author timeline). */
export async function demoFilteredFeed(db: Kysely<Database>, paginator: Paginator) {
  heading(
    '2. Filtered feed (author timeline)',
    'Keyset works with WHERE filters — keep an index that starts with the filter columns.',
  )

  const author = 'ada'
  const query = postsQuery(db).where('author', '=', author)

  const page = await paginator.paginate({
    query,
    sorts: feedSorts,
    limit: PAGE_SIZE,
  })

  console.log(`First page for author="${author}":`)
  printRows(page.items)
  printPageMeta(page)
}

/** Demo 3 — nullable sort key + explicit nulls: 'last' (Postgres NULLS LAST). */
export async function demoNullablePublishedAt(db: Kysely<Database>, paginator: Paginator) {
  heading(
    '3. Nullable sort + nulls: \'last\'',
    'Drafts (published_at IS NULL) sort after published posts. Uses null-safe keyset SQL.',
  )

  const page = await paginator.paginate({
    query: postsQuery(db),
    sorts: publishedSorts,
    limit: PAGE_SIZE,
  })

  console.log('First page (published first; drafts last overall):')
  printRows(page.items)
  printPageMeta(page)
}

/** Demo 4 — GraphQL-style edges with a per-item cursor. */
export async function demoWithEdges(db: Kysely<Database>, paginator: Paginator) {
  heading(
    '4. paginateWithEdges',
    'Same as paginate, plus edges[] of { node, cursor } for connection-style APIs.',
  )

  const result = await paginator.paginateWithEdges({
    query: postsQuery(db),
    sorts: scoreSorts,
    limit: 3,
  })

  console.log('Scoreboard (top scores) as edges:')
  console.table(
    result.edges.map((e, i) => ({
      i,
      cursor: `${e.cursor.slice(0, 24)}…`,
      id: e.node.id,
      title: e.node.title,
      score: e.node.score,
    })),
  )
  printPageMeta(result)
}

/** Demo 5 — numeric offset when you must (legacy UI page numbers). Prefer keyset. */
export async function demoOffsetFallback(db: Kysely<Database>, paginator: Paginator) {
  heading(
    '5. Offset fallback',
    'cursor: { offset } skips N rows. Fine for small N / admin tools; avoid deep pages.',
  )

  const page = await paginator.paginate({
    query: postsQuery(db),
    sorts: feedSorts,
    limit: PAGE_SIZE,
    // Skip first page (5 rows) → roughly “page 2” of a 1-based UI.
    cursor: { offset: PAGE_SIZE },
  })

  console.log(`After offset=${PAGE_SIZE}:`)
  printRows(page.items)
  printPageMeta(page)
}

/**
 * Demo 6 — walk the whole feed with nextPage until exhausted.
 * Useful pattern for exports / background jobs.
 */
export async function demoWalkAll(db: Kysely<Database>, paginator: Paginator) {
  heading(
    '6. Walk entire result set',
    'Loop on nextPage until hasNextPage is false — stable under concurrent inserts at the head.',
  )

  const query = postsQuery(db)
  let cursor: { nextPage: string } | undefined
  let pageNo = 0
  let total = 0

  for (;;) {
    const page = await paginator.paginate({
      query,
      sorts: feedSorts,
      limit: PAGE_SIZE,
      cursor,
    })
    pageNo += 1
    total += page.items.length
    const ids = page.items.map((r) => r.id).join(', ')
    console.log(`  page ${pageNo}: ${page.items.length} rows  ids=[${ids}]`)

    if (!page.hasNextPage || !page.nextPage) break
    cursor = { nextPage: page.nextPage }
  }

  console.log(`\nWalked ${total} rows across ${pageNo} page(s).`)
}
