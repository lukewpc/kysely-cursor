# Kysely Cursor

### Warning: this project is WIP

[![NPM Version](https://img.shields.io/npm/v/kysely-cursor?style=flat&label=latest)](https://github.com/lukewpc/kysely-cursor/releases/latest)
[![Tests](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml/badge.svg)](https://github.com/lukewpc/kysely-cursor)
[![License](https://img.shields.io/github/license/lukewpc/kysely-cursor?style=flat)](https://github.com/lukewpc/kysely-cursor/blob/master/LICENSE)

Cursor-based pagination utilities for [Kysely](https://github.com/kysely-org/kysely) with first-class support for Postgres, MySQL, and SQL Server, plus pluggable **codecs** for safe, portable page tokens.

---

## Table of contents

- [Why keyset pagination?](#why-keyset-pagination)
- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
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
- [Contributing](#contributing)
- [License](#license)

---

## Why keyset pagination?

Offset/limit pagination (`OFFSET … LIMIT …`) is simple but slow and unstable on large tables: later pages get progressively slower, rows can be skipped/duplicated under concurrent writes, and offsets leak information about collection size.

**Keyset pagination** uses a _cursor_ derived from your current last item’s sort keys (e.g. `(created_at DESC, id DESC)`) to fetch the next page. This is:

- **Fast** – leverages index range scans.
- **Stable** – resistant to inserts/deletes between requests.
- **Compact** – portable opaque tokens instead of numeric offsets.

---

## Features

- **Next/previous** page support with correct sort inversion.
- **Pluggable codecs** for page tokens: JSON, Base64, SuperJSON, AES-GCM encryption, and stash/external storage.
- **Composable codecs** (`codecPipe`) to combine stringify → encrypt → base64, etc.
- **Dialects built-in**: Postgres, MySQL, SQL Server (null ordering handled per engine).
- **Fully typed** with Kysely generics; sort keys mapped to selected output.
- Helpful `PaginationError`s for common misconfigurations.

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

- Node.js 18+ (uses `crypto`, `randomUUID`, and modern ESM)
- Kysely ^0.28.7

---

## Quick start

```ts
import { Kysely, sql } from 'kysely'
import { createPaginator, PostgresDialect, codecPipe, superJsonCodec, base64Codec } from 'kysely-cursor'

type DB = { users: { id: string; created_at: Date; email: string } }

const db = new Kysely<DB>({
  /* ... */
})

// Build a codec for page tokens: SuperJSON -> Base64 (opaque & URL safe).
const cursorCodec = codecPipe(superJsonCodec, base64Codec)

const paginator = createPaginator({
  dialect: PostgresDialect,
  cursorCodec,
})

const sorts = [
  // nullable leading sorts are allowed, final sort must be non-nullable
  { col: 'users.created_at', dir: 'desc', output: 'created_at' as const },
  { col: 'users.id', dir: 'desc', output: 'id' as const },
] as const

const page1 = await paginator.paginate({
  query: db.selectFrom('users').select(['id', 'email', 'created_at']),
  sorts,
  limit: 25,
})
// page1.items, page1.nextPage

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

You must provide an ordered **sort set** that uniquely identifies rows:

```ts
const sorts = [
  { col: 'users.created_at', dir: 'desc', output: 'created_at' as const },
  { col: 'users.id', dir: 'desc', output: 'id' as const }, // final non-nullable key
] as const
```

- Leading sorts may be nullable; the **final sort must be non-nullable** (ensures deterministic ordering).
- `output` is the key name in your selected row object (defaults to the column’s last segment if omitted).

### Cursors & tokens

- A **cursor** is a compact payload `{ sig, k }`:
  - `sig`: short SHA-256 hash of your sort spec (guards against mixing tokens with different orders).
  - `k`: map of sort output keys to their values from the boundary row.

- Tokens are created by your **cursor codec** (encode/decode). You decide how opaque/portable they are.

### Dialects

Three built-ins:

- `PostgresDialect` – uses `LIMIT`, correct nulls handling with `asc().nullsFirst()` / `desc().nullsLast()`.
- `MysqlDialect` – uses `LIMIT`, emulates nulls ordering similarly.
- `MssqlDialect` – uses `TOP`, standard `ORDER BY`.

Each dialect implements:

- `applyLimit(builder, limit)`
- `applySort(builder, sorts)`
- `applyCursor(builder, sorts, decodedCursor)` – adds `WHERE` predicate (or `OFFSET`).

### Codecs

Available codecs out of the box:

- `jsonCodec` – plain `JSON.stringify/parse`.
- `superJsonCodec` – handles Dates, BigInts, etc.
- `base64Codec` – UTF-8 ⇄ Base64 strings.
- `createAesCodec(secret)` – AES-256-GCM with scrypt-derived keys (see [Security notes](#security-notes)).
- `stashCodec(stash)` – store full payload in an external key/value store and return a random key.
- `codecPipe(...codecs)` – compose multiple codecs into one.

---

## API

### `createPaginator`

```ts
import { createPaginator, PaginatorOptions, Paginator } from 'kysely-cursor'

const paginator: Paginator = createPaginator({
  dialect, // PaginationDialect
  cursorCodec, // Codec<any, string>
})
```

Returns a simple `{ paginate }` wrapper that injects your defaults.

---

### `paginate` (low-level)

If you prefer, you can call the core function with all options:

```ts
import { paginate } from 'kysely-cursor'

const result = await paginate({
  query, // Kysely SelectQueryBuilder
  sorts, // SortSet<DB, TB, O>
  limit, // positive integer
  cursor, // { nextPage } | { prevPage }
  dialect,
  cursorCodec,
})
```

Returns:

```ts
type PaginatedResult<T> = {
  items: T[]
  nextPage?: string
  prevPage?: string
}
```

---

### Types

```ts
type PaginationDialect = {
  applyLimit(builder, limit): builder
  applySort(builder, sorts): builder
  applyCursor(builder, sorts, cursor): builder
}

type PaginatorOptions = {
  dialect: PaginationDialect
  cursorCodec: Codec<any, string>
}

type SortDirection = 'asc' | 'desc'

type CursorIncoming = { nextPage: string } | { prevPage: string }
```

A single `PaginationError` class is thrown for user-caused issues (bad tokens, invalid input, etc.).

---

## Examples

### Forward/back pagination

```ts
const sorts = [
  { col: 'posts.published_at', dir: 'desc', output: 'published_at' as const },
  { col: 'posts.id', dir: 'desc', output: 'id' as const },
] as const

const page1 = await paginator.paginate({ query: postsQ, sorts, limit: 20 })

// forward
const page2 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: { nextPage: page1.nextPage! },
})

// backward (inverts sorts internally to fetch previous window)
const backToPage1 = await paginator.paginate({
  query: postsQ,
  sorts,
  limit: 20,
  cursor: { prevPage: page2.prevPage! },
})
```

### Custom codec pipelines

Make tokens opaque and short by composing codecs:

```ts
import { codecPipe, superJsonCodec, base64Codec, createAesCodec } from 'kysely-cursor'

const cursorCodec = codecPipe(
  superJsonCodec, // stable serialization for Dates, BigInts
  createAesCodec(process.env.PAGINATION_SECRET!), // encrypt
  base64Codec, // URL-safe string
)
```

Or use external storage:

```ts
import { stashCodec } from 'kysely-cursor'

const stash = {
  get: async (key: string) => redis.get(`cursor:${key}`)!,
  set: async (key: string, val: string) => {
    await redis.set(`cursor:${key}`, val, { EX: 3600 })
  },
}
const cursorCodec = stashCodec(stash)
// Returned tokens look like random UUIDs; payload lives in Redis.
```

### Custom dialects

Implement the three hooks to support a new database or tweak behavior:

```ts
import { baseApplyCursor, PaginationDialect } from 'kysely-cursor'

export const MyDialect: PaginationDialect = {
  applyLimit: (b, limit) => b.limit(limit),
  applySort: (b, sorts) => sorts.reduce((acc, s) => acc.orderBy(s.col as any, s.dir ?? 'asc'), b),
  applyCursor: baseApplyCursor, // reuse the standard predicate builder
}
```

---

## Error handling

All operational errors are wrapped in `PaginationError` with an optional `cause`:

- `Invalid page size limit`
- `Cannot paginate without sorting`
- `Invalid cursor`
- `Page token does not match sort order`
- `Sort index out of bounds`
- `Missing pagination cursor value for "key"`
- `Failed to paginate` (with underlying DB error as `cause`)

You can `instanceof PaginationError` to decide whether to return `400 Bad Request` vs. `500`.

---

## Security notes

The provided `createAesCodec(secret)` uses **AES-256-GCM** with:

- Key derivation via **scrypt** (`N=2^15, r=8, p=1`) from your `secret` and a random 16-byte salt.
- Random 12-byte IV, 16-byte auth tag.
- Payload layout: `version (1) | salt (16) | iv (12) | tag (16) | ciphertext`, Base64-encoded.

**Recommendations**

- Keep `PAGINATION_SECRET` long and random.
- Rotate secrets by supporting multiple versions if needed (the codec is versioned).
- Prefer encrypting or stashing tokens if they may include sensitive values (e.g., emails, internal IDs).
- Avoid exposing raw JSON tokens in URLs if they contain personally identifiable data.

---

## FAQ

**Why do tokens break if I change the sort order?**
Tokens contain a short **signature** of the sort spec. If it doesn’t match, decoding fails with `Page token does not match sort order`. This prevents mixing tokens across different screens.

**Do I have to include `output`?**
No. If omitted, the last path segment of `col` is used (e.g., `users.created_at` → `created_at`). Use `output` when the selected column alias differs from the DB column.

**Can the first page have a `prevPage`?**
If the first page is truncated (over-fetched by 1), a `prevPage` is created for back navigation once you move forward. An empty result returns no tokens.

**Nulls ordering?**
Dialects set sensible defaults: ascending → NULLS FIRST, descending → NULLS LAST, matching the cursor predicate logic.

---

### Acknowledgements

Built on the excellent [Kysely](https://github.com/kysely-org/kysely).
