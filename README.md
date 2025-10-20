# Kysely Cursor

### Warning: this project is in early stages and may be unstable

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
- [Limitations](#limitations)
- [Concepts](#concepts)
    - [Sorts](#sorts)
    - [Cursors & tokens](#cursors--tokens)
    - [Dialects](#dialects)
    - [Codecs](#codecs)
- [API](#api)
    - [`createPaginator`](#createpaginator)
    - [`paginate` (low-level)](#paginate-low-level)
    - [Types](#types)
- [Examples](#examples)
    - [Forward/back pagination](#forwardback-pagination)
    - [Offset fallback](#offset-fallback)
    - [Custom codec pipelines](#custom-codec-pipelines)
    - [Custom dialects](#custom-dialects)
- [Error handling](#error-handling)
- [Security notes](#security-notes)
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
  // nullable leading sorts are allowed; final sort must be non‑nullable
  {col: 'users.created_at', dir: 'desc', output: 'created_at' as const},
  {col: 'users.id', dir: 'desc', output: 'id' as const},
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
  cursor: {nextPage: page1.nextPage!},
})
```

---

## Null Sorting Behavior

Handling of `NULL` values during sorting differs between database engines.
To ensure consistent pagination behavior across dialects, this library **normalizes** null sorting rules.

| Database System                  | Default NULLs (ASC) | Default NULLs (DESC) | Supports `NULLS FIRST / LAST`? |
|----------------------------------|---------------------|----------------------|--------------------------------|
| **MySQL**                        | NULLs **first**     | NULLs **last**       | ❌ Not supported                |
| **PostgreSQL**                   | NULLs **last**      | NULLs **first**      | ✅ Fully supported              |
| **Microsoft SQL Server (MSSQL)** | NULLs **first**     | NULLs **last**       | ❌ Not supported                |
| **SQLite**                       | NULLs **first**     | NULLs **last**       | ✅ Supported since 3.30.0       |

### Current behavior

Because **PostgreSQL** is the *odd one out* (sorting NULLs last on ascending by default),
this library **inverts Postgres’s null ordering** to match the behaviour of the other supported dialects:

* Ascending (`ASC`) → `NULLS FIRST`
* Descending (`DESC`) → `NULLS LAST`

This ensures consistent cursor pagination semantics across all engines, even when nullable sort keys are involved.

### Future plans

In a future release, customizable null sorting behavior may be introduced for dialects that support `NULLS FIRST` / `NULLS LAST` natively (e.g. PostgreSQL, SQLite).

---

## Concepts

### Sorts

Provide an ordered **sort set** that uniquely identifies rows:

```ts
const sorts = [
  {col: 'users.created_at', dir: 'desc', output: 'created_at' as const},
  {col: 'users.id', dir: 'desc', output: 'id' as const}, // final non‑nullable key
] as const
```

- Leading sorts may be nullable; the **final sort must be non‑nullable** (ensures deterministic ordering).
- `output` is the property name in your selected row object. If omitted, it defaults to the last `col` segment (e.g.,
  `users.created_at → created_at`).

### Cursors & tokens

- A **cursor payload** is `{ sig, k }` where:
    - `sig` is a short SHA‑256 signature of your sort spec (prevents mixing tokens across different sort orders);
    - `k` is a map of sort output keys to the boundary row’s values.

- A **token** is the encoded string representation of that payload (via your **cursor codec**).

### Dialects

Built‑ins (imported from `kysely-cursor`):

- `PostgresPaginationDialect`
- `MysqlPaginationDialect`
- `MssqlPaginationDialect`
- `SqlitePaginationDialect`

Each dialect implements:

- `applyLimit(builder, limit, cursorType?)`
- `applyOffset(builder, offset)`
- `applySort(builder, sorts)`
- `applyCursor(builder, sorts, decodedCursor)`

Postgres defaults to `NULLS FIRST` for ascending and `NULLS LAST` for descending to align with the cursor predicate
logic. Other dialects emulate sensible null ordering.

### Codecs

Provided:

- `superJsonCodec` — preserves Dates, BigInts, etc.
- `base64UrlCodec` — UTF‑8 ⇄ Base64 **URL‑safe** strings.
- `createAesCodec(secret)` — AES‑256‑GCM with scrypt‑derived key and versioned payload (
  see [Security notes](#security-notes)).
- `stashCodec(stash)` — stores the raw payload in external storage, returning a random UUID key.
- `codecPipe(...codecs)` — compose multiple codecs into one.

The default cursor codec is `codecPipe(superJsonCodec, base64UrlCodec)`.

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

Returns an object with a single `paginate` method that injects your defaults.

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

### Types

```ts
export type CursorIncoming = { nextPage: string } | { prevPage: string } | { offset: number } // numeric offset fallback

export type PaginationDialect = {
  applyLimit: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    limit: number,
    cursorType?: 'next' | 'prev' | 'offset',
  ) => SelectQueryBuilder<DB, TB, O>
  applyOffset: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    offset: number,
  ) => SelectQueryBuilder<DB, TB, O>
  applySort: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    sorts: SortSet<DB, TB, O>,
  ) => SelectQueryBuilder<DB, TB, O>
  applyCursor: <DB, TB extends keyof DB, O>(
    builder: SelectQueryBuilder<DB, TB, O>,
    sorts: SortSet<DB, TB, O>,
    cursor: { type: 'next' | 'prev'; payload: any },
  ) => SelectQueryBuilder<DB, TB, O>
}

export type PaginatorOptions = {
  dialect: PaginationDialect
  /** Defaults to `codecPipe(superJsonCodec, base64UrlCodec)` */
  cursorCodec?: Codec<any, string>
}
```

A single `PaginationError` class is thrown for expected operational problems (invalid input, bad token, etc.).

---

## Examples

### Forward/back pagination

```ts
const sorts = [
  {col: 'posts.published_at', dir: 'desc', output: 'published_at' as const},
  {col: 'posts.id', dir: 'desc', output: 'id' as const},
] as const

const page1 = await paginator.paginate({query: postsQ, sorts, limit: 20})

// forward
const page2 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: {nextPage: page1.nextPage!},
})

// backward (internally inverts sorts to walk back)
const backToPage1 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: {prevPage: page2.prevPage!},
})
```

### Offset fallback

Useful for legacy routes or when you truly need numeric offsets:

```ts
const page3 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: {offset: 40}, // skip first 40 rows (page index * limit)
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
    await redis.set(`cursor:${key}`, val, {EX: 3600})
  },
}

const cursorCodec = stashCodec(stash)
// Returned tokens look like random UUIDs; payload is stored in Redis.
```

### Custom dialects

Implement the hooks to support another database or to tweak behavior:

```ts
import { baseApplyCursor, type PaginationDialect } from 'kysely-cursor'

export const MyDialect: PaginationDialect = {
  applyLimit: (b, limit) => b.limit(limit),
  applyOffset: (b, offset) => b.offset(offset),
  applySort: (b, sorts) => sorts.reduce((acc, s) => acc.orderBy(s.col as any, s.dir ?? 'asc'), b),
  applyCursor: baseApplyCursor, // reuse the standard predicate builder
}
```

---

## Error handling

Operational errors are thrown as `PaginationError` (with optional `cause`):

- `Invalid page size limit`
- `Cannot paginate without sorting`
- `Invalid cursor`
- `Page token does not match sort order`
- `Sort index out of bounds`
- `Missing pagination cursor value for "key"`
- `Failed to paginate` (DB/driver error wrapped as `cause`)

Treat these as **400 Bad Request** unless the `cause` indicates an internal failure.

---

## Security notes

`createAesCodec(secret)` implements **AES‑256‑GCM** with:

- Key derivation via **scrypt** (`N=2^15, r=8, p=1`) from your secret and a random 16‑byte salt
- Random 12‑byte IV and 16‑byte auth tag
- Payload layout: `version (1) | salt (16) | iv (12) | tag (16) | ciphertext`, Base64‑encoded (URL‑safe if you
  additionally wrap with `base64UrlCodec`)

**Recommendations**

- Keep `PAGINATION_SECRET` long and random
- Consider version rotation if you change parameters
- Prefer encrypting or stashing tokens if they include sensitive values (emails, internal IDs)

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
