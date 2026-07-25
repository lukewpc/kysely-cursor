import { CURSOR_VERSION, sortSignature } from '~/cursor.js'
import {
  buildPlainOrPredicate,
  buildRowComparePredicate,
  classifyKeyset,
  emitKeysetPredicate,
  type EmitKind,
  type KeysetClass,
  selectKeysetStrategy,
} from '~/keyset.js'
import type { SortSet } from '~/sorting.js'
import type { DialectMeta, KeysetStrategy } from '~/types.js'

type UserRow = {
  id: number
  name: string | null
  created_at: Date
}

type DB = {
  users: UserRow
}

const pgMeta: DialectMeta = {
  supportsNullSortDirective: true,
  defaultNullsSortAsc: 'last',
  supportsRowValueCompare: true,
}

const mssqlMeta: DialectMeta = {
  supportsNullSortDirective: false,
  defaultNullsSortAsc: 'first',
  supportsRowValueCompare: false,
  supportsPlainOrKeyset: true,
}

const mysqlMeta: DialectMeta = {
  supportsNullSortDirective: false,
  defaultNullsSortAsc: 'first',
  supportsRowValueCompare: false,
  supportsPlainOrKeyset: false,
}

const makeEb = () => {
  const eb: any = (col: any, op: any, value: any) => ({ type: 'cmp', col, op, value })
  eb.and = (parts: any[]) => ({ type: 'and', parts })
  eb.or = (parts: any[]) => ({ type: 'or', parts })
  return eb
}

const payloadFor = (sorts: SortSet<DB, 'users', UserRow>, k: Record<string, unknown>) => ({
  v: CURSOR_VERSION,
  sig: sortSignature(sorts),
  k,
})

describe('classifyKeyset', () => {
  it('defaults leading sorts to null_safe when nullable is omitted', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc' },
      { col: 'users.id', dir: 'desc' },
    ]
    const payload = payloadFor(sorts, {
      created_at: new Date('2023-01-01'),
      id: 10,
    })

    expect(classifyKeyset(sorts, payload)).toEqual({ kind: 'null_safe' })
  })

  it('classifies simple_non_null when all non-final sorts set nullable: false', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const payload = payloadFor(sorts, {
      created_at: new Date('2023-01-01'),
      id: 10,
    })

    expect(classifyKeyset(sorts, payload)).toEqual({
      kind: 'simple_non_null',
      uniformDir: 'desc',
    })
  })

  it('detects uniform ASC and mixed directions', () => {
    const asc: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'asc', nullable: false },
      { col: 'users.id', dir: 'asc' },
    ]
    const mixed: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'asc' },
    ]
    const k = { created_at: new Date('2023-01-01'), id: 1 }

    expect(classifyKeyset(asc, payloadFor(asc, k))).toEqual({
      kind: 'simple_non_null',
      uniformDir: 'asc',
    })
    expect(classifyKeyset(mixed, payloadFor(mixed, k))).toEqual({
      kind: 'simple_non_null',
      uniformDir: 'mixed',
    })
  })

  it('forces null_safe when any sort has explicit nulls, even with nullable: false', () => {
    // Intentional misconfig vs row types: name is string | null, but runtime may still
    // see nullable: false + nulls and must force the null-safe path.
    const sorts = [
      { col: 'users.name', dir: 'asc', nullable: false, nulls: 'last' },
      { col: 'users.id', dir: 'asc' },
    ] as unknown as SortSet<DB, 'users', UserRow>
    const payload = payloadFor(sorts, { name: 'A', id: 1 })

    expect(classifyKeyset(sorts, payload)).toEqual({ kind: 'null_safe' })
  })

  it('forces null_safe when a non-final cursor value is null', () => {
    // Intentional misconfig: nullable: false on a nullable-typed column with a null cursor value.
    const sorts = [
      { col: 'users.name', dir: 'asc', nullable: false },
      { col: 'users.id', dir: 'asc' },
    ] as unknown as SortSet<DB, 'users', UserRow>
    const payload = payloadFor(sorts, { name: null, id: 1 })

    expect(classifyKeyset(sorts, payload)).toEqual({ kind: 'null_safe' })
  })

  it('rejects a null final cursor value as INVALID_TOKEN', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const payload = payloadFor(sorts, {
      created_at: new Date('2023-01-01'),
      id: null,
    })

    expect(() => classifyKeyset(sorts, payload)).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }))
  })

  it('rejects a missing cursor key as INVALID_TOKEN', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const payload = payloadFor(sorts, { created_at: new Date('2023-01-01') })

    expect(() => classifyKeyset(sorts, payload)).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }))
  })
})

describe('selectKeysetStrategy', () => {
  const simpleDesc: KeysetClass = { kind: 'simple_non_null', uniformDir: 'desc' }
  const simpleMixed: KeysetClass = { kind: 'simple_non_null', uniformDir: 'mixed' }
  const nullSafe: KeysetClass = { kind: 'null_safe' }

  const cases: Array<{
    name: string
    class_: KeysetClass
    meta: DialectMeta
    opt?: KeysetStrategy
    expected: EmitKind
  }> = [
    { name: 'null_safe always → null_safe_or', class_: nullSafe, meta: pgMeta, expected: 'null_safe_or' },
    {
      name: 'auto + pg + uniform → row_compare',
      class_: simpleDesc,
      meta: pgMeta,
      opt: 'auto',
      expected: 'row_compare',
    },
    {
      name: 'portable never row_compare',
      class_: simpleDesc,
      meta: pgMeta,
      opt: 'portable',
      expected: 'plain_or',
    },
    {
      name: 'mixed dir never row_compare',
      class_: simpleMixed,
      meta: pgMeta,
      expected: 'plain_or',
    },
    {
      name: 'mssql never row_compare',
      class_: simpleDesc,
      meta: mssqlMeta,
      expected: 'plain_or',
    },
    {
      name: 'mysql stays on null_safe_or even for simple_non_null',
      class_: simpleDesc,
      meta: mysqlMeta,
      opt: 'auto',
      expected: 'null_safe_or',
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      expect(selectKeysetStrategy(c.class_, c.meta, c.opt)).toBe(c.expected)
    })
  }
})

describe('buildPlainOrPredicate', () => {
  it('emits classic multi-column OR without null guards (DESC)', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const createdAt = new Date('2023-01-01')
    const payload = payloadFor(sorts, { created_at: createdAt, id: 42 })
    const eb = makeEb()

    const predicate = buildPlainOrPredicate(eb, sorts, payload)

    expect(predicate).toMatchObject({
      type: 'or',
      parts: [
        { type: 'cmp', col: 'users.created_at', op: '<', value: createdAt },
        {
          type: 'and',
          parts: [
            { type: 'cmp', col: 'users.created_at', op: '=', value: createdAt },
            { type: 'cmp', col: 'users.id', op: '<', value: 42 },
          ],
        },
      ],
    })
  })

  it('emits classic multi-column OR without null guards (ASC)', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'asc', nullable: false },
      { col: 'users.id', dir: 'asc' },
    ]
    const createdAt = new Date('2023-01-01')
    const payload = payloadFor(sorts, { created_at: createdAt, id: 42 })
    const eb = makeEb()

    const predicate = buildPlainOrPredicate(eb, sorts, payload)

    expect(predicate).toMatchObject({
      type: 'or',
      parts: [
        { type: 'cmp', col: 'users.created_at', op: '>', value: createdAt },
        {
          type: 'and',
          parts: [
            { type: 'cmp', col: 'users.created_at', op: '=', value: createdAt },
            { type: 'cmp', col: 'users.id', op: '>', value: 42 },
          ],
        },
      ],
    })
  })

  it('single-column degenerates to a plain comparison', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [{ col: 'users.id', dir: 'desc' }]
    const payload = payloadFor(sorts, { id: 7 })
    const eb = makeEb()

    expect(buildPlainOrPredicate(eb, sorts, payload)).toMatchObject({
      type: 'cmp',
      col: 'users.id',
      op: '<',
      value: 7,
    })
  })
})

describe('buildRowComparePredicate', () => {
  it('single-column degenerates to a plain comparison', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [{ col: 'users.id', dir: 'desc' }]
    const payload = payloadFor(sorts, { id: 7 })
    const eb = makeEb()

    expect(buildRowComparePredicate(eb, sorts, payload, 'desc')).toMatchObject({
      type: 'cmp',
      col: 'users.id',
      op: '<',
      value: 7,
    })
    expect(buildRowComparePredicate(eb, sorts, payload, 'asc')).toMatchObject({
      type: 'cmp',
      col: 'users.id',
      op: '>',
      value: 7,
    })
  })

  it('rejects null final and missing keys', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const eb = makeEb()

    expect(() =>
      buildRowComparePredicate(eb, sorts, payloadFor(sorts, { created_at: new Date(), id: null }), 'desc'),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }))

    expect(() =>
      buildRowComparePredicate(eb, sorts, payloadFor(sorts, { created_at: new Date() }), 'desc'),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }))
  })

  it('returns a SQL fragment for multi-column uniform sorts', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const payload = payloadFor(sorts, { created_at: new Date('2023-01-01'), id: 42 })
    const eb = makeEb()

    // Multi-column path uses kysely `sql` (not the mock eb tree).
    const predicate = buildRowComparePredicate(eb, sorts, payload, 'desc')
    expect(predicate).toBeTruthy()
    expect(typeof (predicate as any).toOperationNode).toBe('function')
  })
})

describe('emitKeysetPredicate', () => {
  it('uses null_safe path by default (unmarked leading sort)', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc' },
      { col: 'users.id', dir: 'desc' },
    ]
    const createdAt = new Date('2023-01-01')
    const payload = payloadFor(sorts, { created_at: createdAt, id: 42 })
    const eb = makeEb()

    const predicate = emitKeysetPredicate(eb, sorts, payload, pgMeta, 'auto')

    // null-safe form includes IS NOT NULL guards on the leading advance branch
    expect(predicate).toMatchObject({ type: 'or' })
    const json = JSON.stringify(predicate)
    expect(json).toContain('"is not"')
    expect(json).toContain('"users.created_at"')
  })

  it('uses plain_or when portable + nullable: false', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const createdAt = new Date('2023-01-01')
    const payload = payloadFor(sorts, { created_at: createdAt, id: 42 })
    const eb = makeEb()

    const predicate = emitKeysetPredicate(eb, sorts, payload, pgMeta, 'portable')

    expect(predicate).toEqual(buildPlainOrPredicate(eb, sorts, payload))
    // no IS NOT NULL in the plain path
    const json = JSON.stringify(predicate)
    expect(json).not.toContain('"is not"')
    expect(json).not.toContain('"is"')
  })

  it('uses plain_or for mixed directions even when dialect supports row compare', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'asc' },
    ]
    const createdAt = new Date('2023-01-01')
    const payload = payloadFor(sorts, { created_at: createdAt, id: 42 })
    const eb = makeEb()

    const predicate = emitKeysetPredicate(eb, sorts, payload, pgMeta, 'auto')

    expect(predicate).toMatchObject({
      type: 'or',
      parts: [
        { type: 'cmp', col: 'users.created_at', op: '<', value: createdAt },
        {
          type: 'and',
          parts: [
            { type: 'cmp', col: 'users.created_at', op: '=', value: createdAt },
            { type: 'cmp', col: 'users.id', op: '>', value: 42 },
          ],
        },
      ],
    })
  })

  it('selects row_compare for auto + supporting dialect + uniform non-null sorts', () => {
    const sorts: SortSet<DB, 'users', UserRow> = [
      { col: 'users.created_at', dir: 'desc', nullable: false },
      { col: 'users.id', dir: 'desc' },
    ]
    const payload = payloadFor(sorts, { created_at: new Date('2023-01-01'), id: 42 })
    const eb = makeEb()

    const predicate = emitKeysetPredicate(eb, sorts, payload, pgMeta, 'auto')
    // row compare is a RawBuilder, not the mock OR tree
    expect(typeof (predicate as any).toOperationNode).toBe('function')
  })
})
