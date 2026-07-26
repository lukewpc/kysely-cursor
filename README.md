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

| Field     | Meaning                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `col`     | Column or expression to sort by (may be table-qualified)                                               |
| `dir`     | `'asc'` (default) or `'desc'`                                                                          |
| `output`  | Field name on each result row. Defaults to the last segment of `col` (so `posts.id` → `id`)            |
| `notNull` | Opt-in guarantee that this column has no NULLs; unlocks faster SQL (see [Faster seeks](#faster-seeks)) |
| `nulls`   | Put NULLs `'first'` or `'last'`. Postgres and SQLite only; MySQL and SQL Server throw if set           |

**Rules of thumb:**

- Leading sorts may be nullable. The **last** sort must be non-null and unique (almost always the primary key).
- Always pass the **same** `sorts` for a given screen — including `col` spelling and `output`. Tokens embed a sort signature and reject mismatches.
- Prefer `notNull: true` on every leading sort that is truly non-null (see [Faster seeks](#faster-seeks)). Omitting it still paginates safely but keeps heavier SQL. If a token still carries `null` for such a key, that request falls back to null-safe SQL.

### What TypeScript enforces

Checks use the **columns your query returns** (including `output` aliases):

- Last sort must be a non-null field (`string | null` as the final key is a type error).
- `notNull: true` only on non-null-typed fields; `notNull: false` only on nullable ones. Omitting `notNull` typechecks either way.
- `nulls` only on nullable fields.
- For SQL expressions, set `output` so TypeScript knows which result field to check.

Example that fails to compile: `notNull: true` on `name: string | null`. This only helps if Kysely types match the database — a column that is nullable in SQL but typed non-null will still allow `notNull: true`.

---

## Faster seeks

Deep pages stay fast when the database can use an index range. Checklist:

1. A **composite index** matching your sort order (e.g. `(created_at DESC, id DESC)`)
2. **`notNull: true`** on every non-null leading sort column
3. **Uniform directions** (all `asc` or all `desc`)

| Situation                                  | SQL style                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Default, or any sort uses explicit `nulls` | Null-safe `OR` (safe default, heavier)                             |
| Checklist met — Postgres / SQLite          | **Row compare**, e.g. `(created_at, id) < ($1, $2)` (largest win)  |
| Checklist met — SQL Server                 | Plain multi-column `OR` (simpler than null-safe)                   |
| Checklist met — MySQL                      | Stays on null-safe `OR` on purpose (other shapes often plan worse) |

`keysetStrategy` on the paginator:

- `'auto'` (default) — row compare when the dialect and sorts allow it
- `'portable'` — never row compare

```ts
const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
  keysetStrategy: 'auto', // default
})
```

Still slow? Re-check the checklist and `EXPLAIN` for an index range scan — usually a missing index or still-null-safe sorts.

---

## Dialects and nulls

Pass a dialect instance into `createPaginator`, for example `new PostgresPaginationDialect()`.

| Dialect    | Class                       | Row compare | `nulls` option     | Default NULL placement (ASC) |
| ---------- | --------------------------- | ----------- | ------------------ | ---------------------------- |
| PostgreSQL | `PostgresPaginationDialect` | yes         | yes                | last                         |
| MySQL      | `MysqlPaginationDialect`    | no          | no (throws if set) | first                        |
| SQL Server | `MssqlPaginationDialect`    | no          | no (throws if set) | first                        |
| SQLite     | `SqlitePaginationDialect`   | yes         | yes (SQLite 3.30+) | first                        |

If you omit `nulls` on a sort, the dialect’s native default from the table applies.

When you request the **previous** page, the library inverts each sort’s direction (and any explicit `nulls`) so “backward” still follows the same total order as “forward.”

For an unsupported engine, extend `BasePaginationDialect` and configure `meta` for that database’s capabilities.

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
const paginator = createPaginator({
  dialect: new PostgresPaginationDialect(),
  // Encrypt so sort values are not readable client-side:
  cursorCodec: codecPipe(superJsonCodec, createAesCodec(process.env.PAGINATION_SECRET!), base64UrlCodec),
  // Or keep tokens short by storing the payload server-side (e.g. Redis):
  // cursorCodec: stashCodec({
  //   get: (k) => redis.get(k),
  //   set: (k, v) => redis.set(k, v),
  // }),
})
```

Tokens encode the **sort key values** of boundary rows. Treat them as page handles, not as authentication. Encrypt or stash them if those values are sensitive.

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

Standalone `paginate` / `paginateWithEdges` accept the same fields as options on the call (including `dialect`) if you prefer not to use `createPaginator`.

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
  nextPage?: string      // pass as cursor.nextPage
  prevPage?: string      // pass as cursor.prevPage
  startCursor?: string   // token for the first item on this page
  endCursor?: string     // token for the last item on this page
}
```

`hasNextPage` / `hasPrevPage` say whether another page exists. `nextPage` / `prevPage` are the tokens to fetch it. The flags can be true even when a token is missing — most often with pure offset past the end of the set. See the [FAQ](#faq).

### `paginateWithEdges`

Same as `paginate`, but returns Relay-style edges instead of a flat `items` array. Each edge is `{ node, cursor }`; the page flags and `nextPage` / `prevPage` tokens match `paginate`.

```ts
edges: Array<{ node: T; cursor: string }>
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

## Offset (legacy page numbers)

Keyset is the primary API. If you already expose numeric page indexes, you can still pass:

```ts
cursor: {
  offset: 50
}
```

That still runs `OFFSET` under the hood (with the usual deep-page costs). A page that returns rows may also include keyset tokens (`nextPage` / `prevPage`) so the client can switch to keyset afterward.

If the offset is past the end of the result set, you get an empty page: `hasPrevPage` is `true` (you are not on page 1), but there is no `prevPage` token — step back by reducing the offset. Prefer keyset for new APIs; keep offset only when you must retain page numbers. See the [FAQ](#faq).

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
Usually an [offset](#offset-legacy-page-numbers) request past the end of the data: there are no rows to build a keyset token from, but `offset > 0` means you are not on the first page. Step back with a smaller offset (`offset - limit`, floored at 0), or drop offset and use keyset tokens after the first successful page. If you still accept `cursor: { offset }`, do not wire “Back” only to `prevPage`.

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
