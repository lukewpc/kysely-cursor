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

- [Why keyset pagination?](#why-keyset-pagination)
- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Concepts](#concepts)
  - [Sorts](#sorts)
  - [Dialects](#dialects)
  - [Codecs](#codecs)
  - [Null Sorting Behavior](#null-sorting-behavior)
- [API](#api)
  - [`createPaginator`](#createpaginator)
  - [`paginate` (low-level)](#paginate-low-level)
- [Examples](#examples)
  - [Forward/back pagination](#forwardback-pagination)
  - [Offset fallback](#offset-fallback)
  - [Custom codec pipelines](#custom-codec-pipelines)
- [Error handling](#error-handling)
- [FAQ](#faq)

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

const db = new Kysely<DB>({
  /* ... */
})

// Build a cursor codec: SuperJSON → Base64 URL (opaque & URL‑safe)
const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec)

const paginator = createPaginator({
  dialect: PostgresPaginationDialect,
  cursorCodec,
})

const sorts = [
  // nullable leading sorts are allowed; final sort must be unique & non‑nullable
  { col: 'users.created_at', dir: 'desc', output: 'created_at' },
  { col: 'users.id', dir: 'desc', output: 'id' },
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
  { col: 'users.created_at', dir: 'desc', output: 'created_at' },
  { col: 'users.id', dir: 'desc', output: 'id' }, // final non‑nullable & unique key
] as const
```

- Leading sorts take precedence over later sorts.
- Leading sorts may be nullable; the **final sort must be non‑nullable & unique**.
- Use a primary key or a unique index for the final sort, this acts as a tie-breaker.
- `dir` is the sort direction. Defaults to `asc`.
- `col` is the field to sort by, optionally qualified.
- `output` is the field name in your outputted rows. Defaults to `col`, without the qualifying prefix. May need to be explicitly set if your `col` is aliased in your select statement.

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
To ensure consistent pagination behavior across dialects, this library **normalizes** null sorting rules.

| Database System                  | Default NULLs (ASC) | Default NULLs (DESC) | Supports `NULLS FIRST / LAST`? |
| -------------------------------- | ------------------- | -------------------- | ------------------------------ |
| **MySQL**                        | NULLs **first**     | NULLs **last**       | ❌ Not supported               |
| **PostgreSQL**                   | NULLs **last**      | NULLs **first**      | ✅ Fully supported             |
| **Microsoft SQL Server (MSSQL)** | NULLs **first**     | NULLs **last**       | ❌ Not supported               |
| **SQLite**                       | NULLs **first**     | NULLs **last**       | ✅ Supported since 3.30.0      |

#### Current behavior

Because **PostgreSQL** is the _odd one out_ (sorting NULLs last on ascending by default),
this library **inverts Postgres’s null ordering** to match the behaviour of the other supported dialects:

- Ascending (`ASC`) → `NULLS FIRST`
- Descending (`DESC`) → `NULLS LAST`

This ensures consistent cursor pagination semantics across all engines, even when nullable sort keys are involved.

#### Future plans

In a future release, customizable null sorting behavior may be introduced for dialects that support `NULLS FIRST` / `NULLS LAST` natively (e.g. PostgreSQL, SQLite).

---

## API

### `createPaginator`

```ts
import { createPaginator, type PaginatorOptions, type Paginator } from 'kysely-cursor'

const paginator: Paginator = createPaginator({
  dialect, // PaginationDialect
  cursorCodec, // optional: Codec<any, string>; defaults to SuperJSON+Base64URL
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
export type PaginatedResult<T> = {
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

### Forward/back pagination

```ts
const sorts = [
  { col: 'posts.published_at', dir: 'desc', output: 'published_at' },
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
Ascending sorts treat NULLs first; descending sorts push NULLs last.

---

### Acknowledgements

Built on the excellent [Kysely](https://github.com/kysely-org/kysely).
