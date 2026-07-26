# kysely-cursor

[![NPM Version](https://img.shields.io/npm/v/kysely-cursor?style=flat&label=latest)](https://www.npmjs.com/package/kysely-cursor)
[![Tests](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml/badge.svg)](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/lukewpc/kysely-cursor?style=flat)](./LICENSE)
[![Coverage](https://codecov.io/gh/lukewpc/kysely-cursor/branch/main/graph/badge.svg)](https://codecov.io/gh/lukewpc/kysely-cursor)

Cursor-based (keyset) pagination for [Kysely](https://github.com/kysely-org/kysely).

- Fast, stable next/prev via keyset predicates
- Dialects: PostgreSQL, MySQL, MSSQL, SQLite
- Explicit null ordering (`nulls: 'first' | 'last'`) where the engine supports it
- Pluggable codecs (opaque, encryptable, or stashed tokens)
- Connection-style edges via `paginateWithEdges`

---

## Why keyset?

`OFFSET … LIMIT` is simple but deep pages get slower and concurrent writes can skip/duplicate rows. **Keyset pagination** seeks from the boundary row’s sort keys (e.g. `(created_at, id)`) so the engine can use an index range instead of skipping rows.

Offset is still available as `cursor: { offset }` for legacy numeric pages.

---

## Install

```bash
pnpm add kysely-cursor   # or: npm i / yarn add
```

Kysely ≥ 0.28.6 (peer)

> Page tokens are versioned but **not stable across library upgrades**. Discard outstanding tokens after upgrading.

---

## Quick start

```ts
import { Kysely } from 'kysely'
import { createPaginator, PostgresPaginationDialect } from 'kysely-cursor'

type DB = { posts: { id: number; title: string; created_at: Date } }

const db = new Kysely<DB>({/* … */})

// Default codec: SuperJSON → Base64 URL-safe
const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
})

// Final sort must be unique & non-nullable. notNull: true unlocks faster seeks.
const sorts = [
  { col: 'posts.created_at', dir: 'desc', notNull: true },
  { col: 'posts.id', dir: 'desc' },
] as const

const query = db.selectFrom('posts').select(['id', 'title', 'created_at'])

const page1 = await paginator.paginate({ query, sorts, limit: 25 })

const page2 = await paginator.paginate({
  query,
  sorts,
  limit: 25,
  cursor: { nextPage: page1.nextPage! },
})

// prev: cursor: { prevPage: page2.prevPage! }  // sorts inverted internally
```

Same pattern with `MysqlPaginationDialect`, `MssqlPaginationDialect`, or `SqlitePaginationDialect`.

---

## Sorts

```ts
const sorts = [
  { col: 'posts.created_at', dir: 'desc', notNull: true },
  { col: 'posts.id', dir: 'desc' }, // unique tie-breaker
] as const
```

| Field     | Notes                                                              |
| --------- | ------------------------------------------------------------------ |
| `col`     | Column/expression; may be qualified                                |
| `dir`     | `'asc'` (default) or `'desc'`                                      |
| `output`  | Result field name; defaults to last segment of `col`               |
| `notNull` | Leading keys only. Opt-in for seek-friendly SQL (see below)        |
| `nulls`   | `'first'` \| `'last'` on Postgres/SQLite; throws on MySQL/MSSQL    |

- **`notNull`:** omit (default) stays null-safe even if TS says non-null. Set `notNull: true` to unlock plain OR / row compare. `notNull: false` only allowed on nullable columns.
- Leading sorts may be nullable; the **final** sort must be non-null and unique.
- Prefer a composite index matching the sort, e.g. `(created_at DESC, id DESC)`.
- Use the **same** `sorts` on every request for a screen; tokens include a sort signature.

---

## Keyset SQL

One semantic model; emission varies by sort flags and dialect:

| Situation                                       | Shape (DESC)                                     |
| ----------------------------------------------- | ------------------------------------------------ |
| Default / explicit `nulls`                      | Null-safe OR                                     |
| All non-final keys `notNull: true`, uniform dir | Plain OR — or **row compare** on Postgres/SQLite |
| Same on MSSQL                                   | Plain OR                                         |
| Same on MySQL                                   | Stays null-safe OR (optimizer-friendly)          |

`keysetStrategy`: `'auto'` (default — prefer row compare when allowed) or `'portable'` (never row compare).

**Deep-page checklist:** matching composite index · `notNull: true` on every non-null leading key · uniform directions · leave `keysetStrategy` at `auto`.

---

## Dialects & nulls

| Dialect    | Class                       | Row compare | `nulls`    | Default NULLs (ASC) |
| ---------- | --------------------------- | ----------- | ---------- | ------------------- |
| PostgreSQL | `PostgresPaginationDialect` | ✅          | ✅         | last                |
| MySQL      | `MysqlPaginationDialect`    | —           | ❌         | first               |
| SQL Server | `MssqlPaginationDialect`    | —           | ❌         | first               |
| SQLite     | `SqlitePaginationDialect`   | ✅          | ✅ (3.30+) | first               |

Construct with `new`. Custom engines: extend `BasePaginationDialect` and set `meta`.

Omit `nulls` → dialect-native defaults. `prev` inverts direction and explicit `nulls` so the total order stays consistent.

---

## Codecs

Default: `codecPipe(superJsonCodec, base64UrlCodec)`.

| Export                   | Role                            |
| ------------------------ | ------------------------------- |
| `superJsonCodec`         | Dates, BigInts, …               |
| `base64UrlCodec`         | URL-safe string                 |
| `createAesCodec(secret)` | AES-256-GCM                     |
| `stashCodec(stash)`      | External store → UUID token     |
| `codecPipe(…)`           | Compose left-to-right on encode |

```ts
// Encrypt tokens
cursorCodec: codecPipe(superJsonCodec, createAesCodec(process.env.PAGINATION_SECRET!), base64UrlCodec)

// Or stash server-side (e.g. Redis TTL) so tokens are short UUIDs
cursorCodec: stashCodec({ get: (k) => redis.get(k)!, set: (k, v) => redis.set(k, v) })
```

Tokens still carry sort-key **values**. Encrypt/stash if that data is sensitive; tokens are page handles, not auth.

---

## API

```ts
createPaginator({
  dialect,                              // e.g. new PostgresPaginationDialect()
  cursorCodec?,                         // default SuperJSON → Base64URL
  keysetStrategy?: 'auto' | 'portable', // default 'auto'
}): Paginator  // { paginate, paginateWithEdges }
```

```ts
// also: paginate / paginateWithEdges with the same fields inline
await paginator.paginate({
  query,   // SelectQueryBuilder
  sorts,
  limit,   // positive integer
  cursor?, // { nextPage } | { prevPage } | { offset }
})
```

**`paginate` result**

```ts
{
  items: T[]
  hasNextPage: boolean
  hasPrevPage: boolean
  nextPage?: string
  prevPage?: string
  startCursor?: string
  endCursor?: string
}
```

`paginateWithEdges` swaps `items` for `edges: { node: T; cursor: string }[]`.

**Filters** stay on the Kysely query; the paginator only applies order, limit, and the keyset predicate.

### Errors

`PaginationError` with `code`:

| Code               | Typical cause                                          |
| ------------------ | ------------------------------------------------------ |
| `INVALID_TOKEN`    | Bad/old token, sort signature mismatch, invalid offset |
| `INVALID_SORT`     | Empty sorts, unsupported `nulls`                       |
| `INVALID_LIMIT`    | Non-positive limit                                     |
| `UNEXPECTED_ERROR` | Internal / codec failure (`cause`)                     |

Map client mistakes to **400**; `UNEXPECTED_ERROR` to **500**.

---

## Examples & benchmarks

```bash
pnpm example:postgres   # Compose + demos: next/prev, filters, nulls, edges, offset, full walk
pnpm bench:quick        # smoke
pnpm bench              # CI profile (all dialects)
pnpm bench:compare      # vs bench/baseline/
```

Details: [`examples/postgres`](./examples/postgres) · [`bench/README.md`](./bench/README.md).

CI runs lint, a Kysely version matrix, and per-dialect benches with regression checks vs `bench/baseline/`.

---

## FAQ

**Why do tokens break when I change sorts?**  
Tokens hash the sort spec (columns, directions, null placement). A mismatch throws so screens cannot share tokens. Treat decode failures as “start over at page 1.”

**Deep page still slow on Postgres?**  
You’re likely still on the null-safe path. Set `notNull: true` on non-null leading keys, match a composite index, keep `keysetStrategy: 'auto'`. See the checklist above and `pnpm bench:postgres`.

**Do I need `output`?**  
Only when the select alias differs from the last segment of `col`.

**First page `prevPage`?**  
Usually no. The library over-fetches `limit + 1` for `hasNextPage`. `prevPage` appears after you move forward.

**Force SQL without row-value compare?**  
`keysetStrategy: 'portable'`.

---

## Development

```bash
pnpm install && pnpm build && pnpm test
pnpm fix                              # lint + format
./scripts/test-kysely-versions.sh     # full Kysely peer matrix (optional)
```

MIT © Luke Wood — built on [Kysely](https://github.com/kysely-org/kysely).
