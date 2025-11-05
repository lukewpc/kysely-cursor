import type { SelectQueryBuilder } from 'kysely'

import { base64UrlCodec } from '~/codec/base64Url.js'
import { codecPipe } from '~/codec/codec.js'
import { superJsonCodec } from '~/codec/superJson.js'
import * as cursorModule from '~/cursor.js'
import { decodeCursor, resolveCursor, sortSignature } from '~/cursor.js'
import { PaginationError } from '~/error.js'
import { paginate, paginateWithEdges } from '~/paginator.js'
import type { SortSet } from '~/sorting.js'
import type { PaginationDialect } from '~/types.js'

type UserRow = {
  id: number
  name: string | null
  created_at: Date
  is_active: boolean
  orders_count: bigint
}

type DB = {
  users: UserRow
}

function makeBuilder<DB, TB extends keyof DB, O>(rows: O[]): SelectQueryBuilder<DB, TB, O> {
  const self = {
    // postgres
    limit(_: number) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>
    },
    // mssql
    top(_: number) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>
    },
    orderBy(_: any, __?: any) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>
    },
    where(_: any) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>
    },
    execute() {
      return Promise.resolve(rows) as Promise<O[]>
    },
  }
  return self as unknown as SelectQueryBuilder<DB, TB, O>
}

const TestDialect: PaginationDialect = {
  applyLimit: (builder, limit) => ((builder as any).limit ? (builder as any).limit(limit) : builder),
  applyOffset: (builder) => builder,
  applySort: (builder, sorts) =>
    sorts.reduce((acc, s) => (acc as any).orderBy(s.col as any, s.dir ?? 'asc'), builder as any),
  applyCursor: (builder) => builder,
}

const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec)

const validSortsQualifiedOnly: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'asc' },
  { col: 'users.id', dir: 'asc' },
]

describe('paginate (runtime)', () => {
  it('encodes/decodes bigint values in nextPage tokens', async () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.orders_count', output: 'orders_count', dir: 'desc' },
      { col: 'users.id', output: 'id', dir: 'asc' },
    ]

    const item: UserRow = {
      id: 42,
      name: null,
      created_at: new Date('2023-01-01T00:00:00Z'),
      is_active: true,
      orders_count: BigInt('1234567890123456789'),
    }

    const payload = resolveCursor(item, sorts)
    const token = await cursorCodec.encode(payload)
    const decoded = await decodeCursor({ nextPage: token }, cursorCodec)
    expect(typeof (decoded as any).payload.k.orders_count).toBe('bigint')
    expect((decoded as any).payload.k.orders_count).toEqual(BigInt('1234567890123456789'))
  })

  it('handles empty result sets (no nextPage)', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([]) // no rows
    const res = await paginate({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 10,
      dialect: TestDialect,
    })
    expect(res.items).toEqual([])
    expect(res.nextPage).toBeUndefined()
  })

  it('throws on empty sorts at runtime', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    await expect(
      paginate({
        query: builder,
        sorts: [] as any,
        limit: 5,
        dialect: TestDialect,
      }),
    ).rejects.toThrow(/Cannot paginate without sorting/i)
  })

  it('throws on invalid cursor', async () => {
    await expect(decodeCursor({ invalid: 'invalid' } as any, cursorCodec)).rejects.toThrow(/Invalid cursor/i)
  })
})

describe('paginateWithEdges (runtime)', () => {
  it('handles empty result sets (no rows)', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([]) // no rows
    const res = await paginateWithEdges({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 10,
      dialect: TestDialect,
    })
    expect(res.edges).toEqual([])
    expect(res.nextPage).toBeUndefined()
  })

  it('emits one edge per item and edges preserve the node', async () => {
    const rows: UserRow[] = [
      {
        id: 1,
        name: 'Alpha',
        created_at: new Date('2023-01-01T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(1),
      },
      {
        id: 2,
        name: 'Beta',
        created_at: new Date('2023-01-02T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(2),
      },
      {
        id: 3,
        name: 'Gamma',
        created_at: new Date('2023-01-03T00:00:00Z'),
        is_active: false,
        orders_count: BigInt(3),
      },
    ]

    // builder returns all rows, paginate will slice to limit
    const builder = makeBuilder<DB, 'users', UserRow>(rows)

    const res = await paginateWithEdges({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 2,
      dialect: TestDialect,
      cursorCodec,
    })

    // paginate should have taken first 2
    expect(res.edges).toHaveLength(2)
    expect(res.edges.map((e) => e.node.id)).toEqual([rows[0]!.id, rows[1]!.id])

    // cursors should be decodable and match the sort signature + key values
    const sig = sortSignature(validSortsQualifiedOnly)

    for (let i = 0; i < res.edges.length; i++) {
      const edge = res.edges[i]!
      const decoded: any = await cursorCodec.decode(edge.cursor)
      expect(decoded.sig).toBe(sig)
      // sorts = [users.created_at, users.id], so keys must exist
      expect(decoded.k.created_at).toEqual(rows[i]!.created_at)
      expect(decoded.k.id).toEqual(rows[i]!.id)
    }
  })

  it('preserves pagination tokens from paginate()', async () => {
    const rows: UserRow[] = [
      {
        id: 1,
        name: 'Alpha',
        created_at: new Date('2023-01-01T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(1),
      },
      {
        id: 2,
        name: 'Beta',
        created_at: new Date('2023-01-02T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(2),
      },
      {
        id: 3,
        name: 'Gamma',
        created_at: new Date('2023-01-03T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(3),
      },
    ]

    const builder = makeBuilder<DB, 'users', UserRow>(rows)

    const { nextPage, prevPage } = await paginateWithEdges({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 2,
      dialect: TestDialect,
      cursorCodec,
    })

    // underlying paginate() should have seen "over-fetched" (3 > 2) and produced nextPage
    expect(nextPage).toBeTruthy()
    // prevPage should be undefined on the very first page
    expect(prevPage).toBeUndefined()
  })

  it('wraps edge generation errors in PaginationError', async () => {
    const rows: UserRow[] = [
      {
        id: 10,
        name: 'Alpha',
        created_at: new Date('2023-01-04T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(99),
      },
    ]

    const builder = makeBuilder<DB, 'users', UserRow>(rows)

    const innerError = new Error('cannot encode edge cursor')
    vi.spyOn(cursorModule, 'resolveEdges').mockImplementation(async () => {
      throw innerError
    })

    await expect(
      paginateWithEdges({
        query: builder,
        sorts: validSortsQualifiedOnly,
        limit: 10,
        dialect: TestDialect,
        cursorCodec,
      }),
    ).rejects.toThrow(
      new PaginationError({
        message: 'Failed to generate edges',
        code: 'UNEXPECTED_ERROR',
        cause: innerError,
      }),
    )
  })

  it('propagates PaginationError from edge generation unchanged', async () => {
    const rows: UserRow[] = [
      {
        id: 10,
        name: 'Boom',
        created_at: new Date('2023-01-04T00:00:00Z'),
        is_active: true,
        orders_count: BigInt(99),
      },
    ]

    const builder = makeBuilder<DB, 'users', UserRow>(rows)

    const paginationError = new PaginationError({ message: 'Error', code: 'UNEXPECTED_ERROR' })

    vi.spyOn(cursorModule, 'resolveEdges').mockImplementation(async () => {
      throw paginationError
    })

    await expect(
      paginateWithEdges({
        query: builder,
        sorts: validSortsQualifiedOnly,
        limit: 10,
        dialect: TestDialect,
        cursorCodec,
      }),
    ).rejects.toThrow(paginationError)
  })
})
