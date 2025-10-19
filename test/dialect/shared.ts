import type { Generated, Kysely, Selectable } from 'kysely'
import { expect, it } from 'vitest'

import { base64UrlCodec } from '~/codec/base64Url.js'
import { codecPipe } from '~/codec/codec.js'
import { superJsonCodec } from '~/codec/superJson.js'
import { resolveCursor } from '~/cursor.js'
import type { PaginatedResult } from '~/index.js'
import { createPaginator } from '~/index.js'
import type { SortSet } from '~/sorting.js'
import type { PaginationDialect } from '~/types.js'

export interface UsersTable {
  id: Generated<number>
  name: string
  created_at: Date
  rating: number | null
  active: boolean
}

export interface TestDB {
  users: UsersTable
}

export type TestRow = Selectable<UsersTable>

export const createTestData = () => {
  const base = new Date('2023-01-01T00:00:00.000Z')
  const mkDate = (days: number) => new Date(base.getTime() + days * 24 * 60 * 60 * 1000)

  const rows: Omit<TestRow, 'id'>[] = [
    { name: 'Ava', created_at: mkDate(0), rating: null, active: true },
    { name: 'Ben', created_at: mkDate(0), rating: 5, active: false },
    { name: 'Chloé', created_at: mkDate(1), rating: 3, active: true },
    { name: 'Drew', created_at: mkDate(2), rating: null, active: true },
    { name: 'Eli', created_at: mkDate(2), rating: 1, active: false },
    { name: 'Finn', created_at: mkDate(3), rating: 10, active: true },
    { name: 'Gus', created_at: mkDate(3), rating: null, active: true },
    { name: 'Hana', created_at: mkDate(4), rating: 4, active: false },
    { name: 'Ivy', created_at: mkDate(4), rating: 7, active: true },
    { name: 'Jude', created_at: mkDate(5), rating: null, active: false },
    { name: 'Kai', created_at: mkDate(6), rating: 2, active: true },
    { name: 'Luz', created_at: mkDate(6), rating: 8, active: true },
    { name: 'Mia', created_at: mkDate(7), rating: null, active: true },
    { name: 'Noah', created_at: mkDate(8), rating: 9, active: true },
    { name: 'Oli', created_at: mkDate(9), rating: 6, active: false },
  ]

  return rows
}

export interface DatabaseConfig {
  dialect: PaginationDialect
  createTable: (db: Kysely<TestDB>) => Promise<void>
  insertTestData: (db: Kysely<TestDB>, rows: Omit<TestRow, 'id'>[]) => Promise<void>
  applySortToQuery: (query: any, sorts: SortSet<TestDB, 'users', TestRow>) => any
}

export const createTestHelpers = (db: Kysely<TestDB>, config: DatabaseConfig) => {
  const baseBuilder = () => db.selectFrom('users').select(['id', 'name', 'created_at', 'rating', 'active'])

  const fetchAllPlainSorted = async (sorts: SortSet<TestDB, 'users', TestRow>) => {
    let q = baseBuilder()
    q = config.applySortToQuery(q, sorts)
    return await q.execute()
  }

  const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec)

  const paginator = createPaginator({
    dialect: config.dialect,
    cursorCodec,
  })

  const page = async (
    limit: number,
    sorts: SortSet<TestDB, 'users', TestRow>,
    token?: string,
  ): Promise<PaginatedResult<TestRow>> => {
    return await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: token ? { nextPage: token } : undefined,
    })
  }

  return { baseBuilder, fetchAllPlainSorted, paginator, page }
}

export const resolveNextPageToken = async (items: TestRow[], sorts: SortSet<TestDB, 'users', TestRow>) => {
  const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec)
  if (items.length === 0) throw new Error('Cannot build next page token from empty items')
  const last = items[items.length - 1]!
  const payload = resolveCursor(last, sorts)
  return await cursorCodec.encode(payload)
}

export const runSharedTests = (createHelpers: () => ReturnType<typeof createTestHelpers>, dialect: string) => {
  it('paginates deterministically by created_at ASC, id ASC (with continuity across pages)', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()

    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const expected = await fetchAllPlainSorted(sorts)
    const limit = 5

    const seen: TestRow[] = []
    let pageToken: string | undefined

    // Pull three pages; we have 15 rows total
    for (let i = 0; i < 3; i++) {
      const res = await page(limit, sorts, pageToken)
      expect(res.items).toHaveLength(i < 2 ? 5 : 5) // 5,5,5

      // Check ordering within the page mirrors the full expected ordering
      const startIdx = i * limit
      const expectedSlice = expected.slice(startIdx, startIdx + limit)
      expect(res.items.map((r) => r.id)).toEqual(expectedSlice.map((r) => r.id))

      // Accumulate
      seen.push(...res.items)
      pageToken = res.nextPage
    }

    // We should have seen all rows once, no overlap, no gaps
    expect(seen.map((r) => r.id)).toEqual(expected.map((r) => r.id))

    expect(pageToken).toBeUndefined()
  })

  it('returns a nextPage token when more rows exist, and omits it on the last page', async () => {
    const { page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]
    const first = await page(4, sorts)
    expect(first.items).toHaveLength(4)
    expect(first.nextPage).toBeTruthy()

    const second = await page(4, sorts, first.nextPage)
    expect(second.items).toHaveLength(4)
    expect(second.nextPage).toBeTruthy()

    // Jump to the end by fabricating a token from the last item we got:
    const lastItem = second.items[second.items.length - 1]!
    const token = await resolveNextPageToken([lastItem], sorts)
    const nearEnd = await page(100, sorts, token)
    // Should fetch everything after that last item; since we used a big limit,
    // nextPage should be undefined.
    expect(nearEnd.nextPage).toBeUndefined()
  })

  it(`respects ${dialect} NULLS behavior and paginates with NULLs`, async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'asc' }, // NULLS behavior varies by dialect
      { col: 'users.id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    // First page should start with the NULL ratings (both dialects have NULLS FIRST for ASC)
    const first = await page(3, sorts)
    expect(first.items).toHaveLength(3)
    expect(first.items.every((r) => r.rating === null)).toBe(true)

    // Continue paging and compare to expected
    const all: TestRow[] = []
    let token: string | undefined = undefined
    do {
      const res = await page(3, sorts, token)
      all.push(...res.items)
      token = res.nextPage
    } while (token)

    expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it(`supports DESC ordering with NULLS LAST (${dialect} default) and paginates properly`, async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'desc' }, // NULLS LAST (default for DESC)
      { col: 'users.id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    const first = await page(5, sorts)
    expect(first.items).toHaveLength(5)
    // The first page should not start with null ratings here (NULLS LAST for DESC)
    expect(first.items.some((r) => r.rating !== null)).toBe(true)
    expect(first.items[0]!.rating).not.toBeNull()

    // Collect everything and compare to expected
    const all: TestRow[] = []
    let token: string | undefined
    do {
      const res = await page(5, sorts, token)
      all.push(...res.items)
      token = res.nextPage
    } while (token)
    expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it('throws on malformed page tokens', async () => {
    const { page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]
    await expect(page(5, sorts, 'this-is-not-a-valid-token')).rejects.toThrowError(/Failed to paginate/i)
  })

  it('throws when page token does not match the provided sort signature', async () => {
    const { page } = createHelpers()
    const sortsA: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]
    const sortsB: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'desc' }, // different direction => different signature
      { col: 'users.id', dir: 'asc' },
    ]

    const first = await page(3, sortsA)
    expect(first.nextPage).toBeTruthy()

    await expect(page(3, sortsB, first.nextPage)).rejects.toThrowError(/Page token does not match sort order/i)
  })

  it('can paginate with a boolean sort and a secondary tie-breaker', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.active', dir: 'desc' }, // true first
      { col: 'users.id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    const all: TestRow[] = []
    let token: string | undefined
    do {
      const res = await page(4, sorts, token)
      all.push(...res.items)
      token = res.nextPage
    } while (token)

    expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id))
    // First chunk should be all active users until they run out (desc => true first)
    expect(all.find((r) => r.active === false)).toBeTruthy()
  })

  it('paginates DESC with trailing NULLs across page boundaries (no rewinds/dupes)', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'desc' }, // NULLS LAST
      { col: 'users.id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    // Small limit to force a boundary inside the NULL block.
    const limit = 2

    const seen: TestRow[] = []
    let token: string | undefined
    for (let i = 0; i < 8; i++) {
      // enough iterations to pass through the NULL tail
      const res = await page(limit, sorts, token)
      seen.push(...res.items)
      if (!res.nextPage) break
      token = res.nextPage
    }

    expect(seen.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it('paginates ASC with leading NULLs across page boundaries (no gaps)', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'rating', dir: 'asc' }, // NULLS FIRST
      { col: 'id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    const limit = 2 // force boundary inside the NULLs head
    const seen: TestRow[] = []
    let token: string | undefined
    do {
      const res = await page(limit, sorts, token)
      seen.push(...res.items)
      token = res.nextPage
    } while (token)

    expect(seen.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it('paginates DESC when a nullable key is not first (NULLS LAST) without gaps', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' }, // non-null
      { col: 'users.rating', dir: 'desc' }, // NULLS LAST, nullable and NOT first
      { col: 'users.id', dir: 'asc' }, // tie-breaker
    ]
    const expected = await fetchAllPlainSorted(sorts)
    const seen: TestRow[] = []
    let token: string | undefined
    do {
      const res = await page(3, sorts, token)
      seen.push(...res.items)
      token = res.nextPage
    } while (token)
    expect(seen.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it('orders boolean DESC with a clean true-prefix before falses', async () => {
    const { page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.active', dir: 'desc' },
      { col: 'users.id', dir: 'asc' },
    ]
    const first = await page(100, sorts)
    const firstFalseIdx = first.items.findIndex((r) => r.active === false)
    expect(firstFalseIdx).toBeGreaterThanOrEqual(0)
    // everything before first false must be true
    expect(first.items.slice(0, firstFalseIdx).every((r) => r.active === true)).toBe(true)
    // everything after must be false (since we fetched all)
    expect(first.items.slice(firstFalseIdx).every((r) => r.active === false)).toBe(true)
  })

  it('validates limit and sorts (throws on invalid limit)', async () => {
    const { page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [{ col: 'users.id', dir: 'asc' }]
    // Invalid: limit <= 0
    await expect(page(0, sorts)).rejects.toThrowError(/Invalid page size limit/i)
  })

  it('supports prevPage navigation (backward) and preserves item order', async () => {
    const { baseBuilder, paginator, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const limit = 5
    const first = await page(limit, sorts)
    const second = await page(limit, sorts, first.nextPage)

    expect(second.prevPage).toBeTruthy()

    // Go back using prevPage from the second page
    const back = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: second.prevPage! },
    })

    // Should equal the first page items, in the same order
    expect(back.items.map((r) => r.id)).toEqual(first.items.map((r) => r.id))

    // And moving forward again with the provided nextPage returns the second page
    expect(back.nextPage).toBeTruthy()
    const forwardAgain = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { nextPage: back.nextPage! },
    })
    expect(forwardAgain.items.map((r) => r.id)).toEqual(second.items.map((r) => r.id))
  })

  it('supports offset/limit pagination across multiple pages', async () => {
    const { baseBuilder, fetchAllPlainSorted, paginator } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const expected = await fetchAllPlainSorted(sorts)
    const limit = 5

    for (const offset of [0, 5, 10]) {
      const res = await paginator.paginate({
        query: baseBuilder(),
        sorts,
        limit,
        cursor: { offset },
      })

      const expectedSlice = expected.slice(offset, offset + limit)
      expect(res.items.map((r) => r.id)).toEqual(expectedSlice.map((r) => r.id))

      // hasPrev/hasNext should reflect offset window
      expect(res.hasPrevPage).toBe(offset > 0)
      expect(res.hasNextPage).toBe(offset + limit < expected.length)

      if (offset > 0) {
        expect(res.prevPage).toBeTruthy()
      } else {
        expect(res.prevPage).toBeUndefined()
      }

      if (offset + limit < expected.length) {
        expect(res.nextPage).toBeTruthy()
      } else {
        expect(res.nextPage).toBeUndefined()
      }

      // cursors should be emitted when items exist
      expect(res.startCursor).toBeTruthy()
      expect(res.endCursor).toBeTruthy()
    }
  })

  it('emits correct startCursor/endCursor for forward paging', async () => {
    const { page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const first = await page(5, sorts)
    const codec = codecPipe(superJsonCodec, base64UrlCodec)
    const expectedFirstStart = await codec.encode(resolveCursor(first.items[0]!, sorts))
    const expectedFirstEnd = await codec.encode(resolveCursor(first.items[first.items.length - 1]!, sorts))
    expect(first.startCursor).toEqual(expectedFirstStart)
    expect(first.endCursor).toEqual(expectedFirstEnd)

    // next page should also reflect its own first/last items
    const second = await page(5, sorts, first.nextPage)
    const expectedSecondStart = await codec.encode(resolveCursor(second.items[0]!, sorts))
    const expectedSecondEnd = await codec.encode(resolveCursor(second.items[second.items.length - 1]!, sorts))
    expect(second.startCursor).toEqual(expectedSecondStart)
    expect(second.endCursor).toEqual(expectedSecondEnd)
  })

  it('emits correct start/end cursors when navigating with prevPage', async () => {
    const { baseBuilder, paginator, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const limit = 5
    const first = await page(limit, sorts)
    const second = await page(limit, sorts, first.nextPage)

    const back = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: second.prevPage! },
    })

    const codec = codecPipe(superJsonCodec, base64UrlCodec)
    const expectedBackStart = await codec.encode(resolveCursor(back.items[0]!, sorts))
    const expectedBackEnd = await codec.encode(resolveCursor(back.items[back.items.length - 1]!, sorts))
    expect(back.startCursor).toEqual(expectedBackStart)
    expect(back.endCursor).toEqual(expectedBackEnd)
  })

  it('emits correct start/end cursors for offset pages and none for empty pages', async () => {
    const { baseBuilder, paginator } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const limit = 5

    // Offset within range
    const mid = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { offset: 5 },
    })
    const codec = codecPipe(superJsonCodec, base64UrlCodec)
    const expectedMidStart = await codec.encode(resolveCursor(mid.items[0]!, sorts))
    const expectedMidEnd = await codec.encode(resolveCursor(mid.items[mid.items.length - 1]!, sorts))
    expect(mid.startCursor).toEqual(expectedMidStart)
    expect(mid.endCursor).toEqual(expectedMidEnd)

    // Offset beyond dataset => empty items, no cursors
    const empty = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { offset: 999 },
    })
    expect(empty.items).toHaveLength(0)
    expect(empty.startCursor).toBeUndefined()
    expect(empty.endCursor).toBeUndefined()
  })

  it('starts mid-way with offset, then continues using cursor tokens', async () => {
    const { baseBuilder, fetchAllPlainSorted, paginator } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const expected = await fetchAllPlainSorted(sorts)
    const limit = 5

    // Start from the middle using an offset page
    const mid = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { offset: 5 },
    })

    expect(mid.items.map((r) => r.id)).toEqual(expected.slice(5, 10).map((r) => r.id))
    expect(mid.hasPrevPage).toBe(true)
    expect(mid.prevPage).toBeTruthy()
    expect(mid.nextPage).toBeTruthy()

    // Continue forward using cursor-based nextPage tokens
    const seenForward: TestRow[] = [...mid.items]
    let next = mid.nextPage
    while (next) {
      const res = await paginator.paginate({
        query: baseBuilder(),
        sorts,
        limit,
        cursor: { nextPage: next },
      })
      seenForward.push(...res.items)
      next = res.nextPage
    }

    expect(seenForward.map((r) => r.id)).toEqual(expected.slice(5).map((r) => r.id))

    // And we can go backward one page from the mid offset using the prevPage cursor
    const back = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: mid.prevPage! },
    })
    expect(back.items.map((r) => r.id)).toEqual(expected.slice(0, 5).map((r) => r.id))
  })
}
