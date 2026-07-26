import type { SelectQueryBuilder } from 'kysely'
import { sql } from 'kysely'

import type { EdgeOutgoing } from '~/cursor.js'
import { MssqlPaginationDialect } from '~/dialect/mssql.js'
import { PostgresPaginationDialect } from '~/dialect/postgres.js'
import type { SortSet } from '~/sorting.js'
import type { PaginatedResult, PaginatedResultWithEdges } from '~/types.js'

import { createPaginator } from '../src/index.js'

type UserRow = {
  id: number
  name: string | null
  created_at: Date
  is_active: boolean
  orders_count: bigint
  rating: number | null
}

type DB = {
  users: UserRow
}

/** Projected/joined result where nullability follows aliases, not table columns. */
type ProjectedRow = {
  display_name: string | null
  feed_at: Date
  id: number
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

const validSortsNullsDirective: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'asc', nulls: 'last' },
  { col: 'users.id', dir: 'asc' },
]

const validSortsWithBigint: SortSet<DB, 'users', UserRow> = [
  { col: 'users.orders_count', output: 'orders_count', dir: 'desc' },
  { col: 'users.id', output: 'id', dir: 'asc' },
]

const validSortsNotNullTrueOnNonNull: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: true },
  { col: 'users.id', dir: 'desc' },
]

const validSortsNotNullFalseOnNullable: SortSet<DB, 'users', UserRow> = [
  { col: 'users.name', dir: 'asc', notNull: false },
  { col: 'users.id', dir: 'desc' },
]

/** Explicit: omit on a nullable leading column is allowed (runtime → null-safe). */
const validSortsOmitOnNullable: SortSet<DB, 'users', UserRow> = [
  { col: 'users.name', dir: 'asc' },
  { col: 'users.id', dir: 'desc' },
]

/** Explicit: omit on a non-null leading column is allowed (runtime still null-safe until notNull: true). */
const validSortsOmitOnNonNull: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc' },
  { col: 'users.id', dir: 'desc' },
]

/** Unqualified col names (single-table style). */
const validSortsUnqualified: SortSet<DB, 'users', UserRow> = [
  { col: 'name', dir: 'asc', notNull: false },
  { col: 'created_at', dir: 'desc', notNull: true },
  { col: 'id', dir: 'desc' },
]

/** Multi-leading mix: non-null, nullable, non-null final — correct flags. */
const validSortsThreeKeyMix: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: true },
  { col: 'users.rating', dir: 'desc', notNull: false },
  { col: 'users.id', dir: 'desc' },
]

/** Final key may omit or set notNull: true (column is already required non-null). */
const validSortsFinalNotNullTrue: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: true },
  { col: 'users.id', dir: 'desc', notNull: true },
]

/** Expression col + output: nullability follows O[output]. */
const validSortsExpressionOutput: SortSet<DB, 'users', UserRow> = [
  { col: sql`lower(name)`, output: 'name', dir: 'asc', notNull: false },
  { col: sql`id`, output: 'id', dir: 'desc' },
]

/** Projected row: flags follow projected field types, not table columns. */
const validSortsProjected: SortSet<DB, 'users', ProjectedRow> = [
  { col: sql`users.name`, output: 'display_name', dir: 'asc', notNull: false },
  { col: sql`users.created_at`, output: 'feed_at', dir: 'desc', notNull: true },
  { col: sql`users.id`, output: 'id', dir: 'desc' },
]

// Concrete SortSets remain assignable into the erased runtime form used by helpers.
const _erasedRuntimeSorts: SortSet<any, any, any> = validSortsNotNullTrueOnNonNull
const _erasedRuntimeNullable: SortSet<any, any, any> = validSortsNotNullFalseOnNullable
const _erasedRuntimeThreeKey: SortSet<any, any, any> = validSortsThreeKeyMix

// @ts-expect-error - last sort must be non-nullable sortable
const _badLastNullable: SortSet<DB, 'users', UserRow> = [
  { col: 'users.id', output: 'id', dir: 'asc' },
  { col: 'users.name', output: 'name', dir: 'asc' },
]

// @ts-expect-error - notNull: true is not allowed on a nullable column (name)
const _badNotNullTrueOnNullableCol: SortSet<DB, 'users', UserRow> = [
  { col: 'users.name', dir: 'asc', notNull: true },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - notNull: true is not allowed on a nullable column (via output)
const _badNotNullTrueOnNullableOutput: SortSet<DB, 'users', UserRow> = [
  { col: 'users.name', output: 'name', notNull: true },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - notNull: false is not allowed on a non-null column (created_at)
const _badNotNullFalseOnNonNullCol: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: false },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - notNull: false is not allowed on a non-null column (via output)
const _badNotNullFalseOnNonNullOutput: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', output: 'created_at', notNull: false },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - unqualified: notNull: true on nullable name
const _badUnqualifiedNotNullTrue: SortSet<DB, 'users', UserRow> = [
  { col: 'name', dir: 'asc', notNull: true },
  { col: 'id', dir: 'desc' },
]

// @ts-expect-error - unqualified: notNull: false on non-null created_at
const _badUnqualifiedNotNullFalse: SortSet<DB, 'users', UserRow> = [
  { col: 'created_at', dir: 'desc', notNull: false },
  { col: 'id', dir: 'desc' },
]

// @ts-expect-error - three-key mix: wrong flag only on middle nullable key
const _badThreeKeyMiddleFalse: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: true },
  { col: 'users.rating', dir: 'desc', notNull: true },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - three-key mix: wrong flag only on leading non-null key
const _badThreeKeyLeadingTrue: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: false },
  { col: 'users.rating', dir: 'desc', notNull: false },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - final key is non-null; notNull: false is not allowed
const _badFinalNotNullFalse: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: true },
  { col: 'users.id', dir: 'desc', notNull: false },
]

// @ts-expect-error - expression+output: notNull: true on nullable O[output]
const _badExpressionOutputNotNullTrue: SortSet<DB, 'users', UserRow> = [
  { col: sql`lower(name)`, output: 'name', dir: 'asc', notNull: true },
  { col: sql`id`, output: 'id', dir: 'desc' },
]

// @ts-expect-error - expression+output: notNull: false on non-null O[output]
const _badExpressionOutputNotNullFalse: SortSet<DB, 'users', UserRow> = [
  { col: sql`created_at`, output: 'created_at', dir: 'desc', notNull: false },
  { col: sql`id`, output: 'id', dir: 'desc' },
]

// @ts-expect-error - projected O: notNull: true on nullable display_name
const _badProjectedNotNullTrue: SortSet<DB, 'users', ProjectedRow> = [
  { col: sql`users.name`, output: 'display_name', notNull: true },
  { col: sql`users.id`, output: 'id' },
]

// @ts-expect-error - projected O: notNull: false on non-null feed_at
const _badProjectedNotNullFalse: SortSet<DB, 'users', ProjectedRow> = [
  { col: sql`users.created_at`, output: 'feed_at', notNull: false },
  { col: sql`users.id`, output: 'id' },
]

// Widened `boolean` (not a true/false literal) is rejected once constrained to true|false.
// Use `declare` so the binding is not narrowed by a literal initializer.
declare const _widenedNotNull: boolean
// @ts-expect-error - boolean is not assignable to literal true on non-null column
const _badWidenedBooleanOnNonNull: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'desc', notNull: _widenedNotNull },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - boolean is not assignable to literal false on nullable column
const _badWidenedBooleanOnNullable: SortSet<DB, 'users', UserRow> = [
  { col: 'users.name', dir: 'asc', notNull: _widenedNotNull },
  { col: 'users.id', dir: 'desc' },
]

// @ts-expect-error - "nope" is not a key of UserRow
const _badOutputKeyAlias: SortSet<DB, 'users', UserRow> = [
  { col: 'users.id', output: 'nope' },
  { col: 'users.created_at', output: 'created_at' },
]

// @ts-expect-error - empty sorts are disallowed
const _emptySortsDisallowed: SortSet<DB, 'users', UserRow> = []

// @ts-expect-error - no null final sort
const _badNullsDirectiveFinalSort: SortSet<DB, 'users', UserRow> = [
  { col: 'users.created_at', dir: 'asc', nulls: 'last' },
  { col: 'users.id', dir: 'asc', nulls: 'first' },
]

describe('paginate (type-level)', () => {
  it('returns PaginatedResult<O> with correct item type', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })
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
    const pgPaginator = createPaginator({ dialect: new PostgresPaginationDialect() })
    const msPaginator = createPaginator({ dialect: new MssqlPaginationDialect() })

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
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })
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
    const paginator = createPaginator({ dialect: new MssqlPaginationDialect() })
    await paginator.paginate<DB, 'users', UserRow, typeof validSortsWithBigint>({
      query: builder,
      sorts: validSortsWithBigint,
      limit: 3,
    })
  })

  it('infers item type via ExtractPaginatedItem helper', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })
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
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })
    await paginator.paginate<DB, 'users', UserRow, typeof validSortsQualifiedOnly>({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 10,
    })
  })

  it('supports nulls directive on non-final sorts', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })
    await paginator.paginate<DB, 'users', UserRow, typeof validSortsNullsDirective>({
      query: builder,
      sorts: validSortsNullsDirective,
      limit: 10,
    })
  })

  it('accepts matching notNull flags (omit, true, false) across SortSet shapes', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsNotNullTrueOnNonNull>({
      query: builder,
      sorts: validSortsNotNullTrueOnNonNull,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsNotNullFalseOnNullable>({
      query: builder,
      sorts: validSortsNotNullFalseOnNullable,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsOmitOnNullable>({
      query: builder,
      sorts: validSortsOmitOnNullable,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsOmitOnNonNull>({
      query: builder,
      sorts: validSortsOmitOnNonNull,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsUnqualified>({
      query: builder,
      sorts: validSortsUnqualified,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsThreeKeyMix>({
      query: builder,
      sorts: validSortsThreeKeyMix,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsFinalNotNullTrue>({
      query: builder,
      sorts: validSortsFinalNotNullTrue,
      limit: 10,
    })

    await paginator.paginate<DB, 'users', UserRow, typeof validSortsExpressionOutput>({
      query: builder,
      sorts: validSortsExpressionOutput,
      limit: 10,
    })

    const projectedBuilder = makeBuilder<DB, 'users', ProjectedRow>([])
    await paginator.paginate<DB, 'users', ProjectedRow, typeof validSortsProjected>({
      query: projectedBuilder,
      sorts: validSortsProjected,
      limit: 10,
    })
  })

  it('rejects notNull mismatches on inline paginate sorts (user DX path)', async () => {
    const builder = makeBuilder<DB, 'users', UserRow>([])
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })

    // Inline omit on non-null — valid (no cast needed when S is inferred from the literal).
    await paginator.paginate({
      query: builder,
      sorts: [
        { col: 'users.created_at', dir: 'desc' },
        { col: 'users.id', dir: 'desc' },
      ],
      limit: 10,
    })

    // Inline omit on nullable — valid.
    await paginator.paginate({
      query: builder,
      sorts: [
        { col: 'users.name', dir: 'asc' },
        { col: 'users.id', dir: 'desc' },
      ],
      limit: 10,
    })

    // Inline matching flags — valid.
    await paginator.paginate({
      query: builder,
      sorts: [
        { col: 'users.created_at', dir: 'desc', notNull: true },
        { col: 'users.name', dir: 'asc', notNull: false },
        { col: 'users.id', dir: 'desc' },
      ],
      limit: 10,
    })

    await paginator.paginate({
      query: builder,
      // @ts-expect-error - inline: notNull: true on nullable name
      sorts: [
        { col: 'users.name', dir: 'asc', notNull: true },
        { col: 'users.id', dir: 'desc' },
      ],
      limit: 10,
    })

    await paginator.paginate({
      query: builder,
      // @ts-expect-error - inline: notNull: false on non-null created_at
      sorts: [
        { col: 'users.created_at', dir: 'desc', notNull: false },
        { col: 'users.id', dir: 'desc' },
      ],
      limit: 10,
    })

    await paginator.paginate({
      query: builder,
      // @ts-expect-error - inline: wrong flag on middle key of a three-key sort
      sorts: [
        { col: 'users.created_at', dir: 'desc', notNull: true },
        { col: 'users.rating', dir: 'desc', notNull: true },
        { col: 'users.id', dir: 'desc' },
      ],
      limit: 10,
    })

    await paginator.paginateWithEdges({
      query: builder,
      // @ts-expect-error - inline edges path: notNull: true on nullable name
      sorts: [
        { col: 'users.name', dir: 'asc', notNull: true },
        { col: 'users.id', dir: 'desc' },
      ],
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
    const paginator = createPaginator({ dialect: new PostgresPaginationDialect() })
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
