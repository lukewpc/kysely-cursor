# Kysely Cursor

[![NPM Version](https://img.shields.io/npm/v/kysely-cursor?style=flat&label=latest)](https://github.com/lukewpc/kysely-cursor/releases/latest)
[![Tests](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml/badge.svg)](https://github.com/lukewpc/kysely-cursor)
[![License](https://img.shields.io/github/license/lukewpc/kysely-cursor?style=flat)](https://github.com/lukewpc/kysely-cursor/blob/master/LICENSE)
[![Coverage](https://codecov.io/gh/lukewpc/kysely-cursor/branch/main/graph/badge.svg)](https://codecov.io/gh/lukewpc/kysely-cursor)

Cursor‑based (keyset) pagination utilities for [Kysely](https://github.com/kysely-org/kysely).

- Fast, stable page navigation using keyset predicates
- Built‑in dialects: PostgreSQL, MySQL, MSSQL, SQLite
- Explicit **null ordering** (`nulls: 'first' | 'last'`) with dialect-aware defaults
- Optional **seek-friendly** SQL via `nullable: false` + dialect-aware emission
- Pluggable **codecs** for opaque, portable, and optionally encrypted page tokens

---

## Table of contents

- [Why keyset pagination?](#why-keyset-pagination)
- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Upgrading](#upgrading)
- [Concepts](#concepts)
  - [Sorts](#sorts)
  - [Keyset predicates](#keyset-predicates)
  - [Dialects](#dialects)
  - [Codecs](#codecs)
  - [Null sorting behavior](#null-sorting-behavior)
- [API](#api)
- [Examples](#examples)
- [Benchmarks](#benchmarks)
- [Error handling](#error-handling)
- [Security notes](#security-notes)
- [FAQ](#faq)
- [Acknowledgements](#acknowledgements)

---

## Why keyset pagination?

Offset/limit pagination (`OFFSET … LIMIT …`) is simple but can be slow and unstable on large tables: later pages get
progressively slower; concurrent writes can skip/duplicate rows; offsets leak collection size.

**Keyset pagination** derives a cursor from your boundary row’s sort keys (e.g., `(created_at DESC, id DESC)`),
yielding:

- **Fast** — index range scans instead of large skips
- **Stable** — resilient to inserts/deletes between requests
- **Compact** — opaque, portable tokens instead of raw offsets

---

## Features

- **Next/previous** page navigation with automatic sort inversion for `prev` (including null placement).
- **Offset fallback** via `cursor: { offset: number }` when you must use numeric offsets.
- **Explicit null ordering** (`nulls: 'first' | 'last'`) on dialects that support it; dialect defaults otherwise.
- **Seek-friendly keyset SQL** when leading keys are marked `nullable: false` (plain OR / row-value compare).
- **`keysetStrategy`** (`auto` | `portable`) to prefer or forbid row-value comparison.
- **Pluggable codecs** for page tokens: SuperJSON, Base64 URL, AES‑GCM encryption, and external stash storage.
- **Composable codecs** (`codecPipe`) to build pipelines like `superjson → encrypt → base64url`.
- **Typed** end‑to‑end with Kysely generics; `nullable` / `nulls` constrained against selected column types.
- **Helpful errors** (`PaginationError`) for bad input and misconfigurations.
- **Class-based dialects** with `BasePaginationDialect` for custom engines.

---

## Install

```bash
# pnpm
pnpm add kysely-cursor

# npm
npm i kysely-cursor

# yarn
yarn add kysely-cursor
```

**Peer / runtime requirements**

- **Node.js >= 24**
- **Kysely >= 0.28.6**

---

## Quick start

> **Token compatibility:** this project is early; cursor payloads are versioned and tokens are **not** stable across
> library upgrades or sort-spec changes. Discard outstanding tokens after upgrading (see [Upgrading](#upgrading)).

```ts
import { Kysely } from 'kysely'
import {
  createPaginator,
  PostgresPaginationDialect,
  codecPipe,
  superJsonCodec,
  base64UrlCodec,
} from 'kysely-cursor'

type DB = { users: { id: string; created_at: Date; email: string } }

const db = new Kysely<DB>({/* ... */})

// Build a cursor codec: SuperJSON → Base64 URL (opaque & URL‑safe)
const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec)

const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
  cursorCodec,
})

const sorts = [
  // mark non-null leading keys for seek-friendly SQL (optional; default stays null-safe)
  { col: 'users.created_at', dir: 'desc', output: 'created_at', nullable: false },
  { col: 'users.id', dir: 'desc', output: 'id' }, // final must be unique & non‑nullable
] as const

const page1 = await paginator.paginate({
  query: db.selectFrom('users').select(['id', 'email', 'created_at']),
  sorts,
  limit: 25,
})

const page2 = await paginator.paginate({
  query: db.selectFrom('users').select(['id', 'email', 'created_at']),
  sorts,
  limit: 25,
  cursor: { nextPage: page1.nextPage! },
})
```

---

## Upgrading

Breaking / behavioral changes relative to the previous mainline API:

### 1. Instantiate dialects with `new`

Dialects are **classes**, not singleton objects.

```ts
// before
createPaginator({ dialect: PostgresPaginationDialect })

// after
createPaginator({ dialect: new PostgresPaginationDialect() })
```

Same for `MysqlPaginationDialect`, `MssqlPaginationDialect`, and `SqlitePaginationDialect`.

### 2. Postgres null order is dialect-native

Previously the library forced Postgres to `ASC NULLS FIRST` / `DESC NULLS LAST` so all engines matched MySQL-style
defaults. That normalization is **gone**.

Postgres now follows its engine defaults when you omit `nulls`:

| Direction | Previous library behavior | Current (native Postgres) |
| --------- | ------------------------- | ------------------------- |
| ASC       | NULLS FIRST               | NULLS LAST                |
| DESC      | NULLS LAST                | NULLS FIRST               |

Order and keyset predicates stay consistent with each other; only the default placement changed. To restore the old
library-normalized order on Postgres (or lock a placement for portability):

```ts
const sorts = [
  { col: 'users.created_at', dir: 'asc', nulls: 'first', output: 'created_at' },
  { col: 'users.id', dir: 'asc', output: 'id' },
] as const
```

MySQL / MSSQL / SQLite defaults were already “NULLS first on ASC”; they are unchanged when `nulls` is omitted.

### 3. Cursor tokens from older builds are invalid

Payloads include a format version and a short hash of the sort signature (column, direction, and null placement). After
this upgrade:

- Tokens minted by older package versions fail decode (`INVALID_TOKEN`).
- Changing `dir`, `nulls`, `output`/column identity, or sort order invalidates outstanding tokens for that screen.

Clients should treat decode failures as “start over at page 1.”

### 4. New sort / paginator options

| Option | Where | Purpose |
| ------ | ----- | ------- |
| `nullable: false` | leading sort items | Assert no NULLs → unlock plain OR / row compare (see [Keyset predicates](#keyset-predicates)) |
| `nulls: 'first' \| 'last'` | sort items (nullable columns) | Explicit null placement on Postgres / SQLite |
| `keysetStrategy: 'auto' \| 'portable'` | `createPaginator` | Prefer row compare (`auto`) or never use it (`portable`) |

### 5. Custom dialects: extend `BasePaginationDialect`

`baseApplyCursor` is no longer exported. Prefer:

```ts
import { BasePaginationDialect, type DialectMeta } from 'kysely-cursor'

export class MyDialect extends BasePaginationDialect {
  meta: DialectMeta = {
    supportsNullSortDirective: false,
    defaultNullsSortAsc: 'first',
    supportsRowValueCompare: false,
    // supportsPlainOrKeyset: true, // default; set false to force null-safe OR (MySQL-style)
  }
}
```

Override `applyLimit` / `applyOffset` / `applySort` / `applyCursor` only when you need different SQL than the base.

### 6. Node.js engine

`engines.node` is **`>=24.0.0`**. Upgrade the runtime before deploying.

---

## Concepts

### Sorts

Provide an ordered **sort set** that uniquely identifies rows:

```ts
const sorts = [
  { col: 'users.created_at', dir: 'desc', output: 'created_at', nullable: false },
  { col: 'users.id', dir: 'desc', output: 'id' }, // final non‑nullable & unique key
] as const
```

- Leading sorts take precedence over later sorts.
- Leading sorts may be nullable; the **final sort must be non-nullable & unique**.
- Use a primary key or a unique index for the final sort — this acts as a tie-breaker.
- Prefer a composite index that matches the sort, e.g. `(created_at DESC, id DESC)`.
- `dir` is the sort direction. Defaults to `asc`.
- `col` is the field to sort by, optionally qualified.
- `output` is the field name in your outputted rows. Defaults to `col`, without the qualifying prefix. Set it when
  `col` is aliased in the select list.
- `nullable` opts a **leading** key into faster keyset SQL when you assert it has no NULLs (see
  [Keyset predicates](#keyset-predicates)). Defaults to treating leading keys as nullable at **runtime** even if the
  TypeScript type is non-null — you must set `nullable: false` to unlock the fast path.
- `nulls` is an optional per-sort null ordering hint (only when the selected column type allows null):

  ```ts
  { col: 'users.deleted_at', dir: 'asc', nulls: 'last' }
  ```

  - `'first'` → place all `NULL`s before non-NULLs for that sort
  - `'last'` → place all `NULL`s after non-NULLs for that sort
  - If omitted, the dialect’s defaults are used (see [Null sorting behavior](#null-sorting-behavior)).
  - On dialects that **don’t** support `NULLS FIRST / LAST` (MySQL, MSSQL), providing `nulls` throws
    `PaginationError` with `code: 'INVALID_SORT'`.
  - Explicit `nulls` always uses the null-safe predicate path (even if `nullable: false`).

**TypeScript constraints** (when your select/result type is accurate):

- `nullable: false` is rejected on columns typed `| null`.
- `nullable: true` is rejected on non-null columns.
- `nulls` is only allowed when the column type includes `null`.

Emission still reads only the **runtime** `nullable` / `nulls` flags — types do not rewrite SQL. If the column can
actually contain NULLs despite the types, pages can still be wrong.

### Keyset predicates

The library keeps **one semantic model** of keyset pagination and varies only the **SQL emission** by sort class and
dialect capability.

| Situation                                              | Emitted shape (DESC example)                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Default leading sorts (nullable) or explicit `nulls:`  | Null-safe OR: `(created_at IS NOT NULL AND created_at < $1) OR (… = $1 AND id …)` |
| All non-final sorts set `nullable: false`, uniform dir | **Plain OR** on all engines: `created_at < $1 OR (created_at = $1 AND id < $2)`   |
| Same + dialect supports row compare (Postgres, SQLite) | **Row compare**: `(created_at, id) < ($1, $2)` — Index Cond seek on Postgres      |
| Same on MSSQL (`nullable: false`)                      | **Plain OR** (no portable tuple compare)                                          |
| Same on MySQL (`nullable: false`)                      | Stays **null-safe OR** (benches: plain OR / row compare regress at depth)         |
| Mixed sort directions                                  | Plain OR only where allowed; never row compare                                    |

**Defaults stay null-safe.** Mark non-null feed columns with `nullable: false` when you want the seek-friendly path.

Optional `keysetStrategy` on the paginator:

| Value            | Behavior                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `auto` (default) | Prefer row compare when class + dialect allow; else plain OR / null-safe |
| `portable`       | Never emit row compare                                                   |

```ts
const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
  keysetStrategy: 'portable', // force plain OR even on Postgres
})
```

**Perf checklist for deep pages**

1. Composite index matching sort order (and filters).
2. `nullable: false` on every non-final key that cannot be NULL.
3. Uniform direction across the sort set (mixed dirs block row compare).
4. Leave `keysetStrategy` at `auto` unless you need portable SQL without tuple compare.

See [`bench/`](./bench) for latency comparisons. CI runs the suite on every PR (sticky comment + regression check vs
`bench/baseline/`) and refreshes the committed baseline only on **successful** pushes to `main`.

### Dialects

Built‑ins (imported from `kysely-cursor`) — **construct with `new`**:

| Class                         | Notes |
| ----------------------------- | ----- |
| `PostgresPaginationDialect`   | Native null defaults; supports `nulls` + row-value compare |
| `MysqlPaginationDialect`      | No `nulls` directive; keeps null-safe OR for non-null sorts (optimizer) |
| `MssqlPaginationDialect`      | No `nulls` directive; plain OR when `nullable: false` |
| `SqlitePaginationDialect`     | Supports `nulls` (SQLite ≥ 3.30) + row-value compare |

```ts
import {
  createPaginator,
  PostgresPaginationDialect,
  MysqlPaginationDialect,
  MssqlPaginationDialect,
  SqlitePaginationDialect,
} from 'kysely-cursor'

createPaginator({ dialect: new PostgresPaginationDialect() })
createPaginator({ dialect: new MysqlPaginationDialect() })
createPaginator({ dialect: new MssqlPaginationDialect() })
createPaginator({ dialect: new SqlitePaginationDialect() })
```

Custom engines: extend [`BasePaginationDialect`](#upgrading) and implement `meta` (and overrides as needed).

### Codecs

Codecs encode and decode the cursor to an opaque string. You can compose multiple codecs into a pipeline.

Provided:

- `superJsonCodec` — preserves Dates, BigInts, etc.
- `base64UrlCodec` — UTF‑8 ⇄ Base64 **URL‑safe** strings.
- `createAesCodec(secret)` — AES‑256‑GCM with scrypt‑derived key and versioned payload (see
  [Security notes](#security-notes)).
- `stashCodec(stash)` — stores the raw payload in external storage, returning a random UUID key.
- `codecPipe(...codecs)` — compose multiple codecs into one.

The default cursor codec is `codecPipe(superJsonCodec, base64UrlCodec)`.

### Null sorting behavior

Handling of `NULL` values during sorting differs between database engines. This library supports **explicit** null
ordering on each sort key (`nulls: 'first' | 'last'`) and falls back to **dialect-native** defaults when it’s not
provided. ORDER BY and the keyset WHERE predicate always use the same effective placement.

| Database System                  | Default NULLs (ASC) | Default NULLs (DESC) | Supports `NULLS FIRST / LAST`? |
| -------------------------------- | ------------------- | -------------------- | ------------------------------ |
| **MySQL**                        | NULLs **first**     | NULLs **last**       | ❌ Not supported               |
| **PostgreSQL**                   | NULLs **last**      | NULLs **first**      | ✅ Fully supported             |
| **Microsoft SQL Server (MSSQL)** | NULLs **first**     | NULLs **last**       | ❌ Not supported               |
| **SQLite**                       | NULLs **first**     | NULLs **last**       | ✅ Supported since 3.30.0      |

#### How effective placement is chosen

1. **You set `nulls` yourself** (nullable columns only) — on Postgres / SQLite this is emitted on `ORDER BY` and
   mirrored in the predicate. On MySQL / MSSQL the library throws `INVALID_SORT`.

2. **You omit `nulls`** — each dialect declares its default ascending NULL placement; DESC uses the inverse. Plain
   `ORDER BY col ASC|DESC` is emitted (engine defaults apply).

3. **`prev` pages** — sorts (including explicit `nulls`) are inverted so walking backward preserves the same total order.

If you need the same page order on every engine, set `nulls` explicitly on every nullable sort key (and only on
dialects that support it), or avoid nullable sort keys.

---

## API

### `createPaginator`

```ts
import { createPaginator, type PaginatorOptions, type Paginator } from 'kysely-cursor'

const paginator: Paginator = createPaginator({
  dialect, // PaginationDialect instance (e.g. new PostgresPaginationDialect())
  cursorCodec, // optional: Codec<any, string>; defaults to SuperJSON+Base64URL
  keysetStrategy, // optional: 'auto' | 'portable'; defaults to 'auto'
})
```

Returns an object with `paginate` and `paginateWithEdges` methods that inject your defaults.

---

### `paginate` (low-level)

```ts
import { paginate } from 'kysely-cursor'

const result = await paginate({
  query, // Kysely SelectQueryBuilder
  sorts, // SortSet<DB, TB, O>
  limit, // positive integer
  cursor, // { nextPage } | { prevPage } | { offset }
  dialect, // PaginationDialect
  cursorCodec, // optional
  keysetStrategy, // optional
})
```

**Return value**

```ts
export type PaginatedResult<T> = {
  items: T[]
  startCursor?: string
  endCursor?: string
  nextPage?: string
  prevPage?: string
  hasNextPage: boolean
  hasPrevPage: boolean
}
```

---

### `paginateWithEdges` (low-level)

Identical to above, except it returns an array of `edges` that contain every item with a correlated `cursor`.

```ts
import { paginateWithEdges } from 'kysely-cursor'

const result = await paginateWithEdges({
  query, // Kysely SelectQueryBuilder
  sorts, // SortSet<DB, TB, O>
  limit, // positive integer
  cursor, // { nextPage } | { prevPage } | { offset }
  dialect, // PaginationDialect
  cursorCodec, // optional
  keysetStrategy, // optional
})
```

**Return value**

```ts
export type PaginatedResultWithEdges<T> = {
  edges: {
    node: T
    cursor: string
  }[]
  startCursor?: string
  endCursor?: string
  nextPage?: string
  prevPage?: string
  hasNextPage: boolean
  hasPrevPage: boolean
}
```

---

## Examples

Runnable end-to-end walkthrough (Postgres; starts Docker Compose for you):

```bash
pnpm example:postgres
```

See [`examples/postgres`](./examples/postgres) for schema, indexes, codecs, filtered feeds, `paginateWithEdges`, offset
fallback, and full-result walks. DB lifecycle: `pnpm db:up` / `db:down` / `start` in that folder.

### Forward/back pagination

```ts
const sorts = [
  { col: 'posts.published_at', dir: 'desc', nulls: 'last', output: 'published_at' },
  { col: 'posts.id', dir: 'desc', output: 'id' },
] as const

const page1 = await paginator.paginate({ query: postsQ, sorts, limit: 20 })

// forward
const page2 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: { nextPage: page1.nextPage! },
})

// backward (internally inverts sorts + nulls to walk back)
const backToPage1 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: { prevPage: page2.prevPage! },
})
```

### Offset fallback

Useful for legacy routes or when you truly need numeric offsets:

```ts
const page3 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: { offset: 40 }, // skip first 40 rows (page index * limit)
})
```

### Custom codec pipelines

Make tokens opaque and short:

```ts
import { codecPipe, superJsonCodec, base64UrlCodec, createAesCodec } from 'kysely-cursor'

const cursorCodec = codecPipe(
  superJsonCodec, // stable serialization (Date, BigInt, etc.)
  createAesCodec(process.env.PAGINATION_SECRET!), // encrypt
  base64UrlCodec, // URL‑safe string
)
```

Or stash payload externally:

```ts
import { stashCodec } from 'kysely-cursor'

const stash = {
  get: async (key: string) => redis.get(`cursor:${key}`)!,
  set: async (key: string, val: string) => {
    await redis.set(`cursor:${key}`, val, { EX: 3600 })
  },
}

const cursorCodec = stashCodec(stash)
// Returned tokens look like random UUIDs; payload is stored in Redis.
```

---

## Benchmarks

Multi-dialect cursor vs offset suite lives in [`bench/`](./bench) (Testcontainers for Postgres / MySQL / MSSQL; local
SQLite).

```bash
pnpm bench:quick          # smaller dataset
pnpm bench                # full suite
pnpm bench:compare        # vs committed bench/baseline/
pnpm bench:update-baseline
```

CI runs each dialect in parallel (matrix), posts a sticky PR comparison comment, and fails on cursor-mean regressions
(≥ 1.5× baseline). Successful pushes to `main` (all dialects green) refresh `bench/baseline/` (`[skip ci]` bot commit).
Failed / regressed main runs **do not** overwrite the baseline.

---

## Error handling

All operational errors are thrown as a `PaginationError` with a consistent structure:

```ts
{
  message: string
  code: ErrorCode // 'INVALID_TOKEN' | 'INVALID_SORT' | 'INVALID_LIMIT' | 'UNEXPECTED_ERROR'
  cause?: Error
}
```

Treat these as **400 Bad Request** unless the `code` indicates an internal failure (`UNEXPECTED_ERROR`).

Common cases:

| Code             | Typical cause |
| ---------------- | ------------- |
| `INVALID_TOKEN`  | Bad / expired / version-mismatched token; sort signature mismatch; null final key |
| `INVALID_SORT`   | Unsupported `nulls` on dialect; invalid sort configuration |
| `INVALID_LIMIT`  | Non-positive limit |
| `UNEXPECTED_ERROR` | Codec / internal failures |

---

## Security notes

- Prefer opaque tokens (`superJson` + `base64Url`, and encryption in production).
- `createAesCodec(secret)` uses scrypt (N=2¹⁵, r=8, p=1) to derive a 256-bit key from `secret` + a random 16-byte salt,
  AES-256-GCM with a random 12-byte IV, and a versioned binary payload. Wrong secret or tampering fails decode.
- Rotate `secret` carefully — existing encrypted tokens become undecodable.
- Tokens still encode sort key **values** from the boundary row. Do not put secrets in sort columns; treat tokens as
  bearer handles for a page position, not as authorization alone.
- `stashCodec` keeps payloads server-side (e.g. Redis with TTL) when you want short random tokens.

---

## FAQ

**Why do tokens break if I change the sort order?**  
Tokens include a signature of the sort spec (outputs/columns, directions, and null placement). If it doesn’t match,
decoding fails so you cannot mix tokens across screens or after a schema/sort change.

**Do I have to include `output`?**  
No. If omitted, the last path segment of `col` is used (e.g. `users.created_at` → `created_at`). Use `output` when the
selected column alias differs from the DB column.

**Can the first page expose `prevPage`?**  
The library over‑fetches by `limit+1` to determine if there’s another page. You’ll get `prevPage` once you’ve moved
forward; an empty result returns no tokens.

**How are NULLs handled?**  
Per sort via `nulls: 'first' | 'last'` on dialects that support it. If omitted, each dialect’s native defaults apply
(Postgres: ASC NULLS LAST; MySQL/MSSQL/SQLite: ASC NULLS FIRST). See [Null sorting behavior](#null-sorting-behavior) and
[Upgrading](#upgrading) for the Postgres change vs older library versions.

**Why is my deep page still slow on Postgres?**  
Likely still on the null-safe path. Set `nullable: false` on non-null leading keys, ensure a matching composite index,
and confirm `keysetStrategy` is `auto`. See the perf checklist under [Keyset predicates](#keyset-predicates) and
`pnpm bench:postgres`.

**Can I force portable SQL without row-value compare?**  
Yes: `keysetStrategy: 'portable'`.

---

## Acknowledgements

Built on the excellent [Kysely](https://github.com/kysely-org/kysely).
