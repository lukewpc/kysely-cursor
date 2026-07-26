# kysely-cursor

[![NPM Version](https://img.shields.io/npm/v/kysely-cursor?style=flat&label=latest)](https://www.npmjs.com/package/kysely-cursor)
[![Tests](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml/badge.svg)](https://github.com/lukewpc/kysely-cursor/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/lukewpc/kysely-cursor?style=flat)](./LICENSE)
[![Coverage](https://codecov.io/gh/lukewpc/kysely-cursor/branch/main/graph/badge.svg)](https://codecov.io/gh/lukewpc/kysely-cursor)

Cursor-based (keyset) pagination for [Kysely](https://github.com/kysely-org/kysely).

- Stable next/previous pages using keyset seeks
- PostgreSQL, MySQL, SQL Server, and SQLite
- Explicit null ordering where the database supports it
- Pluggable page tokens (opaque, encrypted, or stored server-side)
- GraphQL-style edges via `paginateWithEdges`

---

## Why keyset?

Classic `OFFSET … LIMIT` is easy to write, but two problems show up at scale:

1. **Deep pages get slow** — the database still walks over every skipped row.
2. **Concurrent writes** — inserts and deletes while someone pages can skip or duplicate rows.

**Keyset pagination** avoids both. Each page token remembers the sort values of the last row you saw (for example `created_at` + `id`). The next query is “give me rows _after_ this point,” which can use an index range instead of skipping.

### Offset still works

If you already expose page numbers, you can pass an offset:

```ts
cursor: {
  offset: 50
}
```

That path is a **hybrid**:

- When the offset lands on real rows, the response can still include keyset tokens (`nextPage` / `prevPage`) so the client can switch to keyset from there.
- If the offset is past the end of the result set, you get an empty page. `hasPrevPage` is `true` (you are not on page 1), but there is no `prevPage` token — step back by reducing the offset. See [API](#api) and the [FAQ](#faq).

Prefer keyset for new APIs. Use offset only when you must keep numeric page indexes.

---

## Install

```bash
pnpm add kysely-cursor   # or: npm i / yarn add
```

Requires **Node ≥ 20**, **ESM only**, and **Kysely ≥ 0.28.6** (peer dependency).

> Page tokens are versioned, but **not guaranteed to decode after a library upgrade**. Treat failed decodes as “start over at page 1.”

---

## Quick start

```ts
import { Kysely } from 'kysely'
import { createPaginator, PostgresPaginationDialect } from 'kysely-cursor'

type DB = { posts: { id: number; title: string; created_at: Date } }

const db = new Kysely<DB>({/* … */})

const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
})

// Last sort column must be unique and non-null (usually the primary key).
// notNull: true on non-null columns enables faster seek SQL — see below.
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

// Go backward:
// cursor: { prevPage: page2.prevPage! }
```

Use the same pattern with `MysqlPaginationDialect`, `MssqlPaginationDialect`, or `SqlitePaginationDialect`.

---

## Sorts

```ts
const sorts = [
  { col: 'posts.created_at', dir: 'desc', notNull: true },
  { col: 'posts.id', dir: 'desc' }, // unique tie-breaker
] as const
```

| Field     | Meaning                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `col`     | Column or expression to sort by (may be table-qualified)                                              |
| `dir`     | `'asc'` (default) or `'desc'`                                                                         |
| `output`  | Field name on each result row. Defaults to the last segment of `col` (so `posts.id` → `id`)           |
| `notNull` | Promise that this column has no NULLs. Opt-in; unlocks faster SQL (see [Faster seeks](#faster-seeks)) |
| `nulls`   | Put NULLs `'first'` or `'last'`. Postgres and SQLite only; MySQL/MSSQL throw if set                   |

**Rules of thumb:**

- Leading sort columns may be nullable. The **last** sort column must be non-null and unique (almost always the primary key).
- Always pass the **same** `sorts` for a given screen — including `col` spelling and `output`. Tokens embed a sort signature and reject mismatches.
- Add a composite index that matches the sort, e.g. `(created_at DESC, id DESC)`.

### `notNull`

By default the library generates **null-safe** keyset SQL, even if TypeScript thinks a column is non-null. That is the safe choice when you are unsure.

Set `notNull: true` only when you know the column never contains NULL (and the database agrees). That allows simpler, faster seek predicates.

- `notNull: true` — only on columns that are actually non-null at runtime
- `notNull: false` — only allowed on nullable columns
- omit — null-safe path (default)

---

## Faster seeks

For deep pages you want the database to use an index range. Three things make that reliable:

1. A **composite index** matching your sort order
2. **`notNull: true`** on every non-null leading sort column
3. **Uniform directions** (all `asc` or all `desc`)

When those hold, the library can emit simpler SQL. On Postgres and SQLite it may use a **row comparison** such as `(created_at, id) < ($1, $2)`. Elsewhere it uses a plain multi-column `OR` chain.

| Situation                                                           | SQL style                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| Default, or any sort uses explicit `nulls`                          | Null-safe `OR` (always correct, a bit heavier)          |
| All non-final keys `notNull: true`, same direction, Postgres/SQLite | Plain `OR`, or **row compare** when allowed             |
| Same, SQL Server                                                    | Plain `OR`                                              |
| Same, MySQL                                                         | Stays on null-safe `OR` (tends to plan better on MySQL) |

Control this with `keysetStrategy` on the paginator:

- `'auto'` (default) — use row compare when the dialect and sorts allow it
- `'portable'` — never use row compare (plain / null-safe `OR` only)

```ts
const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
  keysetStrategy: 'auto', // default
})
```

If a deep page is still slow on Postgres, you are probably still on the null-safe path — check the list above, or run `pnpm bench:postgres`.

---

## Dialects and nulls

Pick a dialect class and pass an instance to `createPaginator`:

| Dialect    | Class                       | Row compare | `nulls` option     | Default NULL placement (ASC) |
| ---------- | --------------------------- | ----------- | ------------------ | ---------------------------- |
| PostgreSQL | `PostgresPaginationDialect` | yes         | yes                | last                         |
| MySQL      | `MysqlPaginationDialect`    | no          | no (throws if set) | first                        |
| SQL Server | `MssqlPaginationDialect`    | no          | no (throws if set) | first                        |
| SQLite     | `SqlitePaginationDialect`   | yes         | yes (SQLite 3.30+) | first                        |

If you omit `nulls` on a sort, each dialect uses its native default (table above).

Going to the **previous** page inverts sort direction and any explicit `nulls` values so the total order stays the same as when you walked forward.

For an unsupported engine, extend `BasePaginationDialect` and set `meta` to describe what the database can do.

---

## Codecs (page tokens)

A page token is an opaque string your client sends back on the next request. By default tokens are:

1. Serialized with **SuperJSON** (Dates, BigInts, etc.)
2. Encoded as **URL-safe Base64**

```ts
// default is equivalent to:
cursorCodec: codecPipe(superJsonCodec, base64UrlCodec)
```

| Export                   | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `superJsonCodec`         | Serialize rich JS values                                   |
| `base64UrlCodec`         | Turn bytes/strings into a URL-safe token                   |
| `createAesCodec(secret)` | Encrypt with AES-256-GCM                                   |
| `stashCodec(stash)`      | Store payload server-side; token is a short id (e.g. UUID) |
| `codecPipe(…)`           | Compose codecs (encode left → right)                       |

```ts
// Encrypt tokens so sort values are not readable client-side
cursorCodec: codecPipe(superJsonCodec, createAesCodec(process.env.PAGINATION_SECRET!), base64UrlCodec)

// Or keep tokens short: store the payload in Redis (or similar) under a UUID
cursorCodec: stashCodec({
  get: (k) => redis.get(k),
  set: (k, v) => redis.set(k, v),
})
```

Tokens encode the **sort key values** of boundary rows. They are page handles, not auth. Encrypt or stash them if those values are sensitive.

---

## API

### `createPaginator`

```ts
createPaginator({
  dialect,                              // e.g. new PostgresPaginationDialect()
  cursorCodec?,                         // default: SuperJSON → Base64URL
  keysetStrategy?: 'auto' | 'portable', // default: 'auto'
  maxLimit?,                            // optional cap; larger limit → INVALID_LIMIT
}): Paginator  // { paginate, paginateWithEdges }
```

You can also call standalone `paginate` / `paginateWithEdges` with the same options fields inlined.

### `paginate`

```ts
await paginator.paginate({
  query,   // Kysely SelectQueryBuilder (filters stay on the query)
  sorts,
  limit,   // positive integer
  cursor?, // { nextPage } | { prevPage } | { offset }
})
```

The paginator only adds **order**, **limit**, and the **keyset/offset seek**. Put filters on `query` yourself.

**Result shape:**

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

`hasNextPage` / `hasPrevPage` tell you whether another page exists. `nextPage` / `prevPage` are the tokens to fetch it — and they are **not always set** even when the flags are true (notably with pure offset past the end of the set). See the [FAQ](#faq).

### `paginateWithEdges`

Same as `paginate`, but returns Relay-style edges instead of a flat `items` array:

```ts
edges: {
  node: T
  cursor: string
}
;[]
```

### Errors

Failures throw `PaginationError` with a `code`:

| Code               | Typical cause                                                 |
| ------------------ | ------------------------------------------------------------- |
| `INVALID_TOKEN`    | Corrupt/expired token, sort signature mismatch, bad offset    |
| `INVALID_SORT`     | Empty sorts, or `nulls` on a dialect that does not support it |
| `INVALID_LIMIT`    | Non-positive limit, or above `maxLimit`                       |
| `UNEXPECTED_ERROR` | Internal or codec failure (see `cause`)                       |

Map client mistakes to **HTTP 400** and `UNEXPECTED_ERROR` to **500**.

---

## Examples and benchmarks

```bash
pnpm example:postgres   # Docker Compose demos: next/prev, filters, nulls, edges, offset
pnpm bench:quick        # smoke benchmark
pnpm bench              # full CI profile (all dialects)
pnpm bench:compare      # compare against bench/baseline/
```

More detail: [`examples/postgres`](./examples/postgres) · [`bench/README.md`](./bench/README.md).

CI runs lint, a Kysely version matrix, and per-dialect benches with regression checks against `bench/baseline/`.

---

## FAQ

**Why do tokens break when I change sorts?**  
Each token includes a hash of the sort spec (columns, directions, null placement). If the next request uses different sorts, decode fails on purpose so two screens cannot accidentally share tokens. Start over at page 1.

**Why is `hasPrevPage` true but `prevPage` missing?**  
Usually an **offset** request past the end of the data: there are no rows to build a keyset token from, but `offset > 0` means you are not on the first page. Step back with a smaller offset (`offset - limit`, floored at 0), or drop offset and use keyset tokens after the first successful page. If you still accept `cursor: { offset }`, do not wire “Back” only to `prevPage`.

**Deep page still slow on Postgres?**  
You are likely still on null-safe SQL. Set `notNull: true` on non-null leading keys, match a composite index, leave `keysetStrategy: 'auto'`. See [Faster seeks](#faster-seeks) and `pnpm bench:postgres`.

**When do I need `output`?**  
Only when the name of the field on the result row differs from the last segment of `col` (for example `col: 'posts.created_at'` selected as `createdAt`).

**Does the first page have `prevPage`?**  
Usually no. The library fetches `limit + 1` rows to set `hasNextPage`. `prevPage` shows up after you have moved forward.

**How do I force SQL without row-value compare?**  
`keysetStrategy: 'portable'`.

---

## Development

```bash
pnpm install && pnpm build && pnpm test
pnpm fix                              # lint + format
./scripts/test-kysely-versions.sh     # full Kysely peer matrix (optional)
```

MIT © Luke Wood — built on [Kysely](https://github.com/kysely-org/kysely).
