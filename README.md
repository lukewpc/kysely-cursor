# Kysely Cursor

[![NPM Version](https://img.shields.io/npm/v/kysely-cursor?style=flat&label=latest)](https://github.com/lukewpc/kysely-cursor/releases/latest)
[![Tests](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml/badge.svg)](https://github.com/lukewpc/kysely-cursor)
[![License](https://img.shields.io/github/license/lukewpc/kysely-cursor?style=flat)](https://github.com/lukewpc/kysely-cursor/blob/master/LICENSE)
[![Coverage](https://codecov.io/gh/lukewpc/kysely-cursor/branch/main/graph/badge.svg)](https://codecov.io/gh/lukewpc/kysely-cursor)

Cursor‑based (keyset) pagination utilities for [Kysely](https://github.com/kysely-org/kysely).

- Fast, stable page navigation using keyset predicates
- Built‑in dialects: PostgreSQL, MySQL, MSSQL, SQLite
- Pluggable **codecs** for opaque, portable, and optionally encrypted page tokens

---

## Table of contents

- [Kysely Cursor](#kysely-cursor)
  - [Table of contents](#table-of-contents)
  - [Why keyset pagination?](#why-keyset-pagination)
  - [Features](#features)
  - [Install](#install)
  - [Quick start](#quick-start)
    - [Warning: this project is in early development, so does not support cross-version token compatiablity](#warning-this-project-is-in-early-development-so-does-not-support-cross-version-token-compatiablity)
  - [Concepts](#concepts)
    - [Sorts](#sorts)
    - [Dialects](#dialects)
    - [Codecs](#codecs)
    - [Null Sorting Behavior](#null-sorting-behavior)
      - [Current behavior](#current-behavior)
      - [Future plans](#future-plans)
  - [API](#api)
    - [`createPaginator`](#createpaginator)
    - [`paginate` (low-level)](#paginate-low-level)
    - [`paginateWithEdges` (low-level)](#paginatewithedges-low-level)
  - [Examples](#examples)
    - [Forward/back pagination](#forwardback-pagination)
    - [Offset fallback](#offset-fallback)
    - [Custom codec pipelines](#custom-codec-pipelines)
  - [Error Handling](#error-handling)
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

- **Next/previous** page navigation with automatic sort inversion for `prev`.
- **Offset fallback** via `cursor: { offset: number }` when you must use numeric offsets.
- **Pluggable codecs** for page tokens: SuperJSON, Base64 URL, AES‑GCM encryption, and external stash storage.
- **Composable codecs** (`codecPipe`) to build pipelines like `superjson → encrypt → base64url`.
- **Typed** end‑to‑end with Kysely generics; sort keys map to your selected output.
- **Helpful errors** (`PaginationError`) for bad input and misconfigurations.
- **Dialect aware null ordering** consistent with engine semantics.

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

**Peer requirements**

- Node.js 18+
- Kysely >= 0.28.6

---

## Quick start

### Warning: this project is in early development, so does not support cross-version token compatiablity

```ts
import { Kysely } from 'kysely'
import { createPaginator, PostgresPaginationDialect, codecPipe, superJsonCodec, base64UrlCodec } from 'kysely-cursor'

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
- `output` is the field name in your outputted rows. Defaults to `col`, without the qualifying prefix. May need to be explicitly set if your `col` is aliased in your select statement.
- `nullable` opts a **leading** key into faster keyset SQL when you assert it has no NULLs (see [Keyset predicates](#keyset-predicates)). Defaults to treating leading keys as nullable.
- `nulls` is an optional per-sort null ordering hint:

  ```ts
  { col: 'users.deleted_at', dir: 'asc', nulls: 'last' }
  ```

  - `'first'` → place all `NULL`s before non-NULLs for that sort
  - `'last'` → place all `NULL`s after non-NULLs for that sort
  - If omitted, the dialect’s defaults are used (see below).
  - On dialects that **don’t** support `NULLS FIRST / LAST` (e.g. MySQL, MSSQL), providing `nulls` will throw a `PaginationError` at runtime — so only specify it when the dialect can express it.
  - Explicit `nulls` always uses the null-safe predicate path (even if `nullable: false`).

### Keyset predicates

The library keeps **one semantic model** of keyset pagination and varies only the **SQL emission** by sort class and dialect capability.

| Situation                                              | Emitted shape (DESC example)                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Default leading sorts (nullable) or explicit `nulls:`  | Null-safe OR: `(created_at IS NOT NULL AND created_at < $1) OR (… = $1 AND id …)` |
| All non-final sorts set `nullable: false`, uniform dir | **Plain OR** on all engines: `created_at < $1 OR (created_at = $1 AND id < $2)`   |
| Same + dialect supports row compare (Postgres, SQLite) | **Row compare**: `(created_at, id) < ($1, $2)` — Index Cond seek on Postgres      |
| Same on MSSQL (`nullable: false`)                      | **Plain OR** (no portable tuple compare)                                          |
| Same on MySQL (`nullable: false`)                      | Stays **null-safe OR** (benches: plain OR / row compare regress at depth)         |
| Mixed sort directions                                  | Plain OR only where allowed; never row compare                                    |

**Defaults stay null-safe.** Mark non-null feed columns with `nullable: false` when you want the seek-friendly path. Emission still reads only the runtime flag (TypeScript does not change SQL). When your query result type is accurate, TypeScript also rejects mismatches: `nullable: false` on a `| null` field, or `nullable: true` on a non-null field. If the column can actually contain NULLs despite the types, pages can still be wrong.

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

See `bench/` for latency comparisons across dialects. CI runs the suite on every
PR (sticky comment + regression check vs `bench/baseline/`) and refreshes the
committed baseline on `main`.

### Dialects

Built‑ins (imported from `kysely-cursor`):

- `PostgresPaginationDialect`
- `MysqlPaginationDialect`
- `MssqlPaginationDialect`
- `SqlitePaginationDialect`

### Codecs

Codecs are used to encode and decode the cursor to an opaque string. You can compose multiple codecs into a pipeline.

Provided:

- `superJsonCodec` — preserves Dates, BigInts, etc.
- `base64UrlCodec` — UTF‑8 ⇄ Base64 **URL‑safe** strings.
- `createAesCodec(secret)` — AES‑256‑GCM with scrypt‑derived key and versioned payload (
  see [Security notes](#security-notes)).
- `stashCodec(stash)` — stores the raw payload in external storage, returning a random UUID key.
- `codecPipe(...codecs)` — compose multiple codecs into one.

The default cursor codec is `codecPipe(superJsonCodec, base64UrlCodec)`.

### Null Sorting Behavior

Handling of `NULL` values during sorting differs between database engines.
To ensure consistent pagination behavior across dialects, this library now supports **explicit** null ordering on each sort key (`nulls: 'first' | 'last'`) and falls back to dialect-aware defaults when it’s not provided.

| Database System                  | Default NULLs (ASC) | Default NULLs (DESC) | Supports `NULLS FIRST / LAST`? |
| -------------------------------- | ------------------- | -------------------- | ------------------------------ |
| **MySQL**                        | NULLs **first**     | NULLs **last**       | ❌ Not supported               |
| **PostgreSQL**                   | NULLs **last**      | NULLs **first**      | ✅ Fully supported             |
| **Microsoft SQL Server (MSSQL)** | NULLs **first**     | NULLs **last**       | ❌ Not supported               |
| **SQLite**                       | NULLs **first**     | NULLs **last**       | ✅ Supported since 3.30.0      |

#### Current behavior

1. **You can set it yourself**
   On sorts where the column can be nullable, add:

```ts
const sort = { col: 'posts.published_at', dir: 'asc', nulls: 'last' }
```

If the dialect supports `NULLS FIRST / LAST` (Postgres, SQLite ≥ 3.30.0), this will be emitted as part of the `ORDER BY`. If it **doesn’t** (MySQL, MSSQL), the library throws a `PaginationError` with `code: 'INVALID_SORT'`, so you don’t silently get inconsistent pagination.

2. **If you don’t set it, the dialect decides**
   Each dialect declares:
   - whether it supports explicit null directives
   - what its default “ascending NULL placement” is

   The paginator then:
   - uses that default when `dir === 'asc'`
   - uses the **inverted** default when `dir === 'desc'` (so if ASC puts NULLs first, DESC will put them last)

---

## API

### `createPaginator`

```ts
import { createPaginator, type PaginatorOptions, type Paginator } from 'kysely-cursor'

const paginator: Paginator = createPaginator({
  dialect, // PaginationDialect
  cursorCodec, // optional: Codec<any, string>; defaults to SuperJSON+Base64URL
  keysetStrategy, // optional: 'auto' | 'portable'; defaults to 'auto'
})
```

Returns an object with `paginate` and `paginateWithEdges` methods that injects your defaults.

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

Identical to above, except it will return an array of `edges` that contain every
item with a correlated `cursor`.

```ts
import { paginateWithEdges } from 'kysely-cursor'

const result = await paginateWithEdges({
  query, // Kysely SelectQueryBuilder
  sorts, // SortSet<DB, TB, O>
  limit, // positive integer
  cursor, // { nextPage } | { prevPage } | { offset }
  dialect, // PaginationDialect
  cursorCodec, // optional
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

See [`examples/postgres`](./examples/postgres) for schema, indexes, codecs, filtered feeds, `paginateWithEdges`, offset fallback, and full-result walks. DB lifecycle: `pnpm db:up` / `db:down` / `start` in that folder.

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

// backward (internally inverts sorts to walk back)
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

## Error Handling

All operational errors are thrown as a `PaginationError` with a consistent structure:

```ts
{
  message: string
  code: ErrorCode
  cause?: Error
}
```

Treat these as **400 Bad Request** unless the `code` indicates an internal failure.

---

## FAQ

**Why do tokens break if I change the sort order?**
Tokens include a signature of the sort spec. If it doesn’t match, decoding fails with
`Page token does not match sort order` to prevent mixing tokens across screens.

**Do I have to include `output`?**
No. If omitted, the last path segment of `col` is used (e.g., `users.created_at → created_at`). Use `output` when the
selected column alias differs from the DB column.

**Can the first page expose `prevPage`?**
The library over‑fetches by `limit+1` to determine if there’s another page. You’ll get `prevPage` once you’ve moved
forward; an empty result returns no tokens.

**How are NULLs handled?**
You can now control this per sort via `nulls: 'first' | 'last'` on dialects that support it. If you omit it, the dialect’s
declared defaults are used, and descending sorts get the inverse of the ascending default. On dialects that can’t express
null placement, specifying `nulls` throws an error so you don’t get silent drift.

---

### Acknowledgements

Built on the excellent [Kysely](https://github.com/kysely-org/kysely).
