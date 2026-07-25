import type { Generated, Kysely, OrderByDirection, Selectable } from 'kysely'

import { base64UrlCodec } from '~/codec/base64Url.js'
import { codecPipe } from '~/codec/codec.js'
import { superJsonCodec } from '~/codec/superJson.js'
import { invertNulls, resolveCursor } from '~/cursor.js'
import type { PaginatedResult } from '~/index.js'
import { createPaginator } from '~/index.js'
import type { NullsDirection, SortSet } from '~/sorting.js'
import type { DialectMeta, PaginationDialect } from '~/types.js'

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

export const testDay = (days: number) => new Date(Date.UTC(2023, 0, 1 + days))

export const createTestData = () => {
  const rows: Omit<TestRow, 'id'>[] = [
    { name: 'Ava', created_at: testDay(0), rating: null, active: true },
    { name: 'Ben', created_at: testDay(0), rating: 5, active: false },
    { name: 'Chloé', created_at: testDay(1), rating: 3, active: true },
    { name: 'Drew', created_at: testDay(2), rating: null, active: true },
    { name: 'Eli', created_at: testDay(2), rating: 1, active: false },
    { name: 'Finn', created_at: testDay(3), rating: 10, active: true },
    { name: 'Gus', created_at: testDay(3), rating: null, active: true },
    { name: 'Hana', created_at: testDay(4), rating: 4, active: false },
    { name: 'Ivy', created_at: testDay(4), rating: 7, active: true },
    { name: 'Jude', created_at: testDay(5), rating: null, active: false },
    { name: 'Kai', created_at: testDay(6), rating: 2, active: true },
    { name: 'Luz', created_at: testDay(6), rating: 8, active: true },
    { name: 'Mia', created_at: testDay(7), rating: null, active: true },
    { name: 'Noah', created_at: testDay(8), rating: 9, active: true },
    { name: 'Oli', created_at: testDay(9), rating: 6, active: false },
  ]

  return rows
}

export interface DatabaseConfig {
  dialect: PaginationDialect
  createTable: (db: Kysely<TestDB>) => Promise<void>
  insertTestData: (db: Kysely<TestDB>, rows: Omit<TestRow, 'id'>[]) => Promise<void>
}

const stripTable = (col: string) => col.replace(/^users\./, '')

const effectiveNulls = (
  meta: DialectMeta,
  dir: 'asc' | 'desc',
  explicit: NullsDirection | undefined,
): NullsDirection => {
  if (explicit) return explicit
  return dir === 'asc' ? meta.defaultNullsSortAsc : invertNulls(meta.defaultNullsSortAsc)
}

const compareRows = (a: TestRow, b: TestRow, sorts: SortSet<TestDB, 'users', TestRow>, meta: DialectMeta): number => {
  for (const s of sorts) {
    const col = stripTable(s.col as string)
    const dir = (s.dir ?? 'asc') as 'asc' | 'desc'
    const an = (a as any)[col]
    const bn = (b as any)[col]
    const nulls = effectiveNulls(meta, dir, s.nulls)

    // null-handling first
    const aIsNull = an == null
    const bIsNull = bn == null
    if (aIsNull || bIsNull) {
      if (aIsNull && bIsNull) {
        // equal on this column, continue to next
      } else if (aIsNull) {
        return nulls === 'first' ? -1 : 1
      } else {
        return nulls === 'first' ? 1 : -1
      }
    } else {
      // both non-null: normal compare
      if (an < bn) return dir === 'asc' ? -1 : 1
      if (an > bn) return dir === 'asc' ? 1 : -1
    }
  }

  return 0
}

export const createTestHelpers = (db: Kysely<TestDB>, config: DatabaseConfig) => {
  const baseBuilder = () => db.selectFrom('users').select(['id', 'name', 'created_at', 'rating', 'active'])

  const fetchAllPlainSorted = async (sorts: SortSet<TestDB, 'users', TestRow>) => {
    const rows = await baseBuilder().execute()
    return [...rows].sort((a, b) => compareRows(a, b, sorts, config.dialect.meta))
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

  // mutation helpers for concurrency-stability tests. ids are always
  // auto-generated (mssql IDENTITY forbids explicit inserts) and temp rows are
  // addressed by their unique names, so the base fixture is never touched.
  const insertRow = async (row: Omit<TestRow, 'id'>) => {
    await config.insertTestData(db, [row])
  }

  const deleteRowsByName = async (names: string[]) => {
    await db.deleteFrom('users').where('name', 'in', names).execute()
  }

  return { baseBuilder, deleteRowsByName, fetchAllPlainSorted, insertRow, paginator, page }
}

export const resolveNextPageToken = async (items: TestRow[], sorts: SortSet<TestDB, 'users', TestRow>) => {
  const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec)
  if (items.length === 0) throw new Error('Cannot build next page token from empty items')
  const last = items[items.length - 1]!
  const payload = resolveCursor(last, sorts)
  return await cursorCodec.encode(payload)
}

const nullsForDir = (defaultNullsSortAsc: NullsDirection, dir: OrderByDirection) => {
  return dir === 'desc' ? invertNulls(defaultNullsSortAsc) : defaultNullsSortAsc
}

export const runSharedTests = (
  createHelpers: () => ReturnType<typeof createTestHelpers>,
  dialectName: string,
  meta: DialectMeta,
) => {
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

  it(`respects ${dialectName} NULLS behavior and paginates with NULLs`, async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const expected = await fetchAllPlainSorted(sorts)
    const first = await page(3, sorts)

    const ascNulls = nullsForDir(meta.defaultNullsSortAsc, 'asc')

    if (ascNulls === 'first') {
      // dialect puts NULLs first for ASC (mssql/mysql/sqlite)
      expect(first.items).toHaveLength(3)
      expect(first.items.every((r) => r.rating === null)).toBe(true)
    } else {
      // dialect puts NULLs last for ASC (postgres in the new impl)
      expect(first.items.some((r) => r.rating !== null)).toBe(true)
    }

    const all: TestRow[] = []
    let token: string | undefined = undefined
    do {
      const res = await page(3, sorts, token)
      all.push(...res.items)
      token = res.nextPage
    } while (token)

    expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it(`supports DESC ordering with dialect NULLS behavior (${dialectName}) and paginates properly`, async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'desc' },
      { col: 'users.id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    const first = await page(5, sorts)
    expect(first.items).toHaveLength(5)

    const descNulls = nullsForDir(meta.defaultNullsSortAsc, 'desc')
    if (descNulls === 'last') {
      // non-null ratings should come first
      expect(first.items[0]!.rating).not.toBeNull()
    } else {
      // NULLs FIRST for DESC
      expect(first.items[0]!.rating).toBeNull()
    }

    const all: TestRow[] = []
    let token: string | undefined
    do {
      const res = await page(5, sorts, token)
      all.push(...res.items)
      token = res.nextPage
    } while (token)
    expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  // NEW: make sure explicit nulls directive is either honored or rejected per dialect
  it('handles explicit NULLS directive according to dialect support', async () => {
    const { page, fetchAllPlainSorted } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'asc', nulls: 'last' }, // force opposite of most defaults
      { col: 'users.id', dir: 'asc' },
    ]

    if (meta.supportsNullSortDirective) {
      const expected = await fetchAllPlainSorted(sorts)
      const first = await page(3, sorts)
      // because we explicitly asked for NULLS LAST, the first page should start with non-NULLs
      expect(first.items.some((r) => r.rating !== null)).toBe(true)

      // and full pagination still matches db order
      const all: TestRow[] = []
      let token: string | undefined
      do {
        const res = await page(3, sorts, token)
        all.push(...res.items)
        token = res.nextPage
      } while (token)
      expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id))
    } else {
      // dialect should throw because the impl throws in BasePaginationDialect.applySort
      await expect(page(3, sorts)).rejects.toThrow(/does not support nulls first\/last/i)
    }
  })

  // regression: walking backward must replay forward pages even when a page boundary
  // falls inside (or next to) the NULL block
  it('walks backward across a NULL boundary with dialect-default null placement', async () => {
    const { baseBuilder, paginator, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const limit = 4
    const first = await page(limit, sorts)
    const second = await page(limit, sorts, first.nextPage)
    const third = await page(limit, sorts, second.nextPage)

    expect(third.prevPage).toBeTruthy()

    // step back twice: at least one of these hops crosses the NULL boundary
    // regardless of where this dialect places NULLs for ASC
    const backOne = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: third.prevPage! },
    })
    expect(backOne.items.map((r) => r.id)).toEqual(second.items.map((r) => r.id))

    expect(backOne.prevPage).toBeTruthy()
    const backTwo = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: backOne.prevPage! },
    })
    expect(backTwo.items.map((r) => r.id)).toEqual(first.items.map((r) => r.id))

    // and going forward again returns the same pages
    const forwardAgain = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { nextPage: backTwo.nextPage! },
    })
    expect(forwardAgain.items.map((r) => r.id)).toEqual(second.items.map((r) => r.id))
  })

  // same as above, but with an explicit nulls directive — the inverted (backward) query
  // must flip the directive too, otherwise the backward order is not the reverse of the
  // forward order and pages come back wrong across the NULL boundary
  const itSupportsNulls = meta.supportsNullSortDirective ? it : it.skip
  itSupportsNulls('walks backward across a NULL boundary with an explicit nulls directive', async () => {
    const { baseBuilder, paginator, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'asc', nulls: 'last' },
      { col: 'users.id', dir: 'asc' },
    ]

    // with NULLS LAST the final page starts inside the NULL block, so stepping back
    // from it must cross the NULL → non-NULL boundary
    const limit = 4
    const first = await page(limit, sorts)
    const second = await page(limit, sorts, first.nextPage)
    const third = await page(limit, sorts, second.nextPage)
    const fourth = await page(limit, sorts, third.nextPage)

    expect(fourth.items.length).toBeGreaterThan(0)
    expect(fourth.items[0]!.rating).toBeNull()

    const backOne = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: fourth.prevPage! },
    })
    expect(backOne.items.map((r) => r.id)).toEqual(third.items.map((r) => r.id))

    const backTwo = await paginator.paginate({
      query: baseBuilder(),
      sorts,
      limit,
      cursor: { prevPage: backOne.prevPage! },
    })
    expect(backTwo.items.map((r) => r.id)).toEqual(second.items.map((r) => r.id))
  })

  // property: for any sort set and page size, paginating all the way forward and then
  // all the way back must replay the exact same pages in reverse order
  it('round-trips: forward then backward pagination replays identical pages', async () => {
    const { baseBuilder, fetchAllPlainSorted, paginator } = createHelpers()

    const sortVariants: SortSet<TestDB, 'users', TestRow>[] = [
      // non-nullable baseline
      [
        { col: 'users.created_at', dir: 'asc' },
        { col: 'users.id', dir: 'asc' },
      ],
      // nullable leading sort, dialect-default placement
      [
        { col: 'users.rating', dir: 'asc' },
        { col: 'users.id', dir: 'asc' },
      ],
      [
        { col: 'users.rating', dir: 'desc' },
        { col: 'users.id', dir: 'asc' },
      ],
      // three-key sorts: the cursor predicate is recursive, and nested
      // tie-breakers / NULL handling below the top level only get exercised
      // from depth 2 down
      [
        { col: 'users.created_at', dir: 'asc' },
        { col: 'users.rating', dir: 'desc' }, // nullable middle key
        { col: 'users.id', dir: 'asc' },
      ],
      [
        { col: 'users.rating', dir: 'asc' }, // nullable leading key with a deeper tie chain
        { col: 'users.created_at', dir: 'desc' },
        { col: 'users.id', dir: 'asc' },
      ],
    ]

    if (meta.supportsNullSortDirective) {
      sortVariants.push(
        [
          { col: 'users.rating', dir: 'asc', nulls: 'first' },
          { col: 'users.id', dir: 'asc' },
        ],
        [
          { col: 'users.rating', dir: 'asc', nulls: 'last' },
          { col: 'users.id', dir: 'desc' },
        ],
        [
          { col: 'users.rating', dir: 'desc', nulls: 'first' },
          { col: 'users.id', dir: 'asc' },
        ],
      )
    }

    const ids = (pages: TestRow[][]) => pages.map((p) => p.map((r) => r.id))

    for (const sorts of sortVariants) {
      const expected = await fetchAllPlainSorted(sorts)
      for (const limit of [1, 2, 3, 5]) {
        // walk forward through every page
        const forwardPages: TestRow[][] = []
        let nextToken: string | undefined
        let lastPrevToken: string | undefined
        do {
          const res = await paginator.paginate({
            query: baseBuilder(),
            sorts,
            limit,
            cursor: nextToken ? { nextPage: nextToken } : undefined,
          })
          forwardPages.push(res.items)
          nextToken = res.nextPage
          lastPrevToken = res.prevPage
        } while (nextToken)

        // the forward walk reproduces the dialect's total order exactly
        expect(forwardPages.flat().map((r) => r.id)).toEqual(expected.map((r) => r.id))

        // walk all the way back from the last page
        const backwardPages: TestRow[][] = []
        let prevToken = lastPrevToken
        while (prevToken) {
          const res = await paginator.paginate({
            query: baseBuilder(),
            sorts,
            limit,
            cursor: { prevPage: prevToken },
          })
          backwardPages.push(res.items)
          prevToken = res.prevPage
        }

        // the backward walk replays every forward page except the one we started from, in reverse
        expect(ids(backwardPages)).toEqual(ids(forwardPages.slice(0, -1).reverse()))
      }
    }
  })

  // the base fixture has no full ties on two leading keys, so a predicate that
  // silently drops the deepest tie-breaker would still look correct there —
  // manufacture a 3-way tie that only the final key can order
  it('paginates 3-key sorts where the deepest tie-breaker decides order', async () => {
    const { baseBuilder, deleteRowsByName, fetchAllPlainSorted, insertRow, paginator } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.rating', dir: 'desc' }, // nullable middle key
      { col: 'users.id', dir: 'asc' },
    ]

    // tie with the existing row id 3 (Chloé: day 1, rating 3)
    await insertRow({ name: 'TieTestA', created_at: testDay(1), rating: 3, active: true })
    await insertRow({ name: 'TieTestB', created_at: testDay(1), rating: 3, active: false })

    try {
      const expected = await fetchAllPlainSorted(sorts)

      const tieIds = expected.filter((r) => ['Chloé', 'TieTestA', 'TieTestB'].includes(r.name)).map((r) => r.id)
      expect(tieIds).toHaveLength(3)
      // sanity: within the tie the oracle orders by id alone
      expect(tieIds).toEqual([...tieIds].sort((a, b) => a - b))

      // limit 2 splits the 3-row tie across two pages
      const limit = 2
      const forwardPages: TestRow[][] = []
      let nextToken: string | undefined
      let lastPrevToken: string | undefined
      do {
        const res = await paginator.paginate({
          query: baseBuilder(),
          sorts,
          limit,
          cursor: nextToken ? { nextPage: nextToken } : undefined,
        })
        forwardPages.push(res.items)
        nextToken = res.nextPage
        lastPrevToken = res.prevPage
      } while (nextToken)

      expect(forwardPages.flat().map((r) => r.id)).toEqual(expected.map((r) => r.id))

      // and walking back from the end replays the same pages in reverse
      const backwardPages: TestRow[][] = []
      let prevToken = lastPrevToken
      while (prevToken) {
        const res = await paginator.paginate({
          query: baseBuilder(),
          sorts,
          limit,
          cursor: { prevPage: prevToken },
        })
        backwardPages.push(res.items)
        prevToken = res.prevPage
      }

      const ids = (pages: TestRow[][]) => pages.map((p) => p.map((r) => r.id))
      expect(ids(backwardPages)).toEqual(ids(forwardPages.slice(0, -1).reverse()))
    } finally {
      await deleteRowsByName(['TieTestA', 'TieTestB'])
    }
  })

  // keyset's core promise vs OFFSET: a row inserted *before* the cursor position
  // mid-walk must not shift, duplicate, or skip anything
  it('is stable when a row is inserted before the cursor mid-walk', async () => {
    const { deleteRowsByName, fetchAllPlainSorted, insertRow, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const expected = await fetchAllPlainSorted(sorts) // 15 rows, before the insert
    const limit = 4

    const first = await page(limit, sorts)
    expect(first.items.map((r) => r.id)).toEqual(expected.slice(0, limit).map((r) => r.id))
    expect(first.nextPage).toBeTruthy()

    // sorts before the cursor row (id 4, day 2), but only after page 1 was read
    await insertRow({ name: 'MutationInsert', created_at: testDay(0), rating: 9, active: true })

    try {
      const walked: TestRow[] = []
      let token = first.nextPage
      while (token) {
        const res = await page(limit, sorts, token)
        walked.push(...res.items)
        token = res.nextPage
      }

      // exactly the remaining original rows — no dupes, no skips, no sign of the insert
      expect(walked.map((r) => r.id)).toEqual(expected.slice(limit).map((r) => r.id))
    } finally {
      await deleteRowsByName(['MutationInsert'])
    }
  })

  // the row a token points at can disappear between requests (concurrent delete) —
  // the walk must continue from the token's sort position regardless
  it('continues cleanly when the row behind the cursor token is deleted mid-walk', async () => {
    const { deleteRowsByName, fetchAllPlainSorted, insertRow, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    await insertRow({ name: 'MutationDelete', created_at: testDay(0), rating: 7, active: true })

    try {
      const expected = await fetchAllPlainSorted(sorts) // 16 rows, incl. the temp row
      const tempId = expected.find((r) => r.name === 'MutationDelete')!.id
      const limit = 3

      // land the cursor exactly on the temp row, then delete it
      const first = await page(limit, sorts)
      expect(first.items.at(-1)!.id).toBe(tempId)
      expect(first.nextPage).toBeTruthy()

      await deleteRowsByName(['MutationDelete'])

      const walked: TestRow[] = []
      let token = first.nextPage
      while (token) {
        const res = await page(limit, sorts, token)
        walked.push(...res.items)
        token = res.nextPage
      }

      // the temp row sat inside page 1, so the continuation is unaffected by its absence
      expect(walked.map((r) => r.id)).toEqual(expected.slice(limit).map((r) => r.id))
    } finally {
      await deleteRowsByName(['MutationDelete'])
    }
  })

  it('throws on malformed page tokens', async () => {
    const { page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]
    await expect(page(5, sorts, 'this-is-not-a-valid-token')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      message: 'Invalid page token',
    })
  })

  it('throws when page token does not match the provided sort signature', async () => {
    const { page } = createHelpers()
    const sortsA: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]
    const sortsB: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'desc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const first = await page(3, sortsA)
    expect(first.nextPage).toBeTruthy()

    await expect(page(3, sortsB, first.nextPage)).rejects.toThrowError(/Page token does not match sort order/i)
  })

  it('throws when page token is missing required cursor key(s)', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.created_at', dir: 'asc' },
      { col: 'users.id', dir: 'asc' },
    ]

    const expected = await fetchAllPlainSorted(sorts)
    const first = expected[0]!

    const payload = resolveCursor(first, sorts)
    delete (payload as any).k.id

    const codec = codecPipe(superJsonCodec, base64UrlCodec)
    const malformedToken = await codec.encode(payload)

    await expect(page(5, sorts, malformedToken)).rejects.toThrowError(/Missing pagination cursor value for "id"/i)
  })

  it('can paginate with a boolean sort and a secondary tie-breaker', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.active', dir: 'desc' },
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
    expect(all.find((r) => r.active === false)).toBeTruthy()
  })

  // make this dialect-aware, not "DESC with trailing NULLs"
  it('paginates DESC across page boundaries without rewinds/dupes around NULLs', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'users.rating', dir: 'desc' },
      { col: 'users.id', dir: 'asc' },
    ]
    const expected = await fetchAllPlainSorted(sorts)

    const limit = 2
    const seen: TestRow[] = []
    let token: string | undefined
    for (let i = 0; i < 8; i++) {
      const res = await page(limit, sorts, token)
      seen.push(...res.items)
      if (!res.nextPage) break
      token = res.nextPage
    }

    expect(seen.map((r) => r.id)).toEqual(expected.map((r) => r.id))
  })

  it('paginates ASC across page boundaries (incl. possible leading NULLs) with no gaps', async () => {
    const { fetchAllPlainSorted, page } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [
      { col: 'rating', dir: 'asc' },
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

  it('paginates DESC when a nullable key is not first without gaps', async () => {
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

  it('validates limit, offset and sorts (rejects bad input with 400-class codes)', async () => {
    const { baseBuilder, page, paginator } = createHelpers()
    const sorts: SortSet<TestDB, 'users', TestRow> = [{ col: 'users.id', dir: 'asc' }]

    await expect(page(0, sorts)).rejects.toThrowError(/Invalid page size limit/i)
    for (const limit of [-1, 1.5]) {
      await expect(paginator.paginate({ query: baseBuilder(), sorts, limit })).rejects.toMatchObject({
        code: 'INVALID_LIMIT',
      })
    }

    for (const offset of [-1, 2.5]) {
      await expect(
        paginator.paginate({ query: baseBuilder(), sorts, limit: 5, cursor: { offset } }),
      ).rejects.toMatchObject({ code: 'INVALID_TOKEN', message: 'Invalid pagination offset' })
    }
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
