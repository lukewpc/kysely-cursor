import type { SelectQueryBuilder } from 'kysely'

import type { EdgeOutgoing } from '~/cursor.js'

import { MssqlPaginationDialect } from '../src/dialect/mssql.js'
import { PostgresPaginationDialect } from '../src/dialect/postgres.js'
import { createPaginator } from '../src/index.js'
import type { SortSet } from '../src/sorting.js'
import type { PaginatedResult, PaginatedResultWithEdges } from '../src/types.js'

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
    limit(_: number) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>
    },
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

const validSortsAscId: SortSet<DB, 'users', UserRow> = [
  { col: 'users.name', output: 'name', dir: 'asc' },
  { col: 'users.id', output: 'id', dir: 'desc' },
]

const validSortsQualifiedOnly: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'asc' },
  { col: 'users.id', dir: 'asc' },
]

const validSortsWithBigint: SortSet<DB, 'users', UserRow> = [
  { col: 'users.orders_count', output: 'orders_count', dir: 'desc' },
  { col: 'users.id', output: 'id', dir: 'asc' },
]

// @ts-expect-error - last sort must be non-nullable sortable
const _badLastNullable: SortSet<DB, 'users', UserRow> = [
  { col: 'users.id', output: 'id', dir: 'asc' },
  { col: 'users.name', output: 'name', dir: 'asc' },
]

// @ts-expect-error - "nope" is not a key of UserRow
const _badOutputKeyAlias: SortSet<DB, 'users', UserRow> = [
  { col: 'users.id', output: 'nope' },
  { col: 'users.created_at', output: 'created_at' },
]

// @ts-expect-error - empty sorts are disallowed
const _emptySortsDisallowed: SortSet<DB, 'users', UserRow> = []

describe('paginate (type-level)', () => {
  it('returns PaginatedResult<O> with correct item type', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: PostgresPaginationDialect })
    const res = await paginator.paginate<DB, 'users', UserRow, typeof validSortsAscId>({
      query: builder,
      sorts: validSortsAscId,
      limit: 10,
    })
    expectTypeOf(res).toEqualTypeOf<PaginatedResult<UserRow>>()
    expectTypeOf(res.items).toEqualTypeOf<UserRow[]>()
    expectTypeOf(res.nextPage).toEqualTypeOf<string | undefined>()
  })

  it('accepts both dialects and rejects unknown dialect strings at compile time', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const pgPaginator = createPaginator({ dialect: PostgresPaginationDialect })
    const msPaginator = createPaginator({ dialect: MssqlPaginationDialect })

    await pgPaginator.paginate<DB, 'users', UserRow, typeof validSortsQualifiedOnly>({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 5,
    })

    await msPaginator.paginate<DB, 'users', UserRow, typeof validSortsQualifiedOnly>({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 5,
    })

    // @ts-expect-error - only PaginationDialect objects allowed
    const _badPaginator = createPaginator({ dialect: 'sqlite' })
  })

  it('supports nullable leading sorts and enforces non-nullable final sort', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: PostgresPaginationDialect })
    await paginator.paginate<DB, 'users', UserRow, typeof validSortsAscId>({
      query: builder,
      sorts: validSortsAscId,
      limit: 20,
    })

    // @ts-expect-error - last item cannot be nullable ("name")
    const _badSortsLastNullable: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', output: 'created_at', dir: 'desc' },
      { col: 'users.name', output: 'name', dir: 'asc' },
    ]
  })

  it('accepts bigint and other supported sortable value domains', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: MssqlPaginationDialect })
    await paginator.paginate<DB, 'users', UserRow, typeof validSortsWithBigint>({
      query: builder,
      sorts: validSortsWithBigint,
      limit: 3,
    })
  })

  it('infers item type via ExtractPaginatedItem helper', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])

    const paginator = createPaginator({ dialect: PostgresPaginationDialect })
    const _run = () =>
      paginator.paginate<DB, 'users', UserRow, typeof validSortsAscId>({
        query: builder,
        sorts: validSortsAscId,
        limit: 1,
      })

    type Item = Awaited<ReturnType<typeof _run>>['items'][number]
    expectTypeOf<UserRow>().toEqualTypeOf<Item>()
  })

  it('supports using only qualified col to derive output key', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: PostgresPaginationDialect })
    await paginator.paginate<DB, 'users', UserRow, typeof validSortsQualifiedOnly>({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 10,
    })
  })

  it('rejects non-existent output keys and invalid shapes on sorts at compile time', () => {
    // @ts-expect-error - "nope" is not a key of UserRow
    const _badOutputKey: SortSet<DB, 'users', UserRow> = [
      { col: 'users.id', output: 'nope' },
      { col: 'users.created_at', output: 'created_at' },
    ]

    // @ts-expect-error - missing final non-nullable item
    const _onlyNullable: SortSet<DB, 'users', UserRow> = [{ col: 'users.name', output: 'name' }]
  })
})

describe('paginateWithEdges (type-level)', () => {
  it('returns PaginatedResultWithEdges<O> with correct item type', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: PostgresPaginationDialect })
    const res = await paginator.paginateWithEdges<DB, 'users', UserRow, typeof validSortsAscId>({
      query: builder,
      sorts: validSortsAscId,
      limit: 10,
    })
    expectTypeOf(res).toEqualTypeOf<PaginatedResultWithEdges<UserRow>>()
    expectTypeOf(res.edges).toEqualTypeOf<EdgeOutgoing<UserRow>[]>()
    expectTypeOf(res.nextPage).toEqualTypeOf<string | undefined>()
  })
})
