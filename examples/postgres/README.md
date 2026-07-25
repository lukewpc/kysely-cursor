# PostgreSQL example — kysely-cursor

A small, runnable tour of [kysely-cursor](../..) against Postgres. It seeds a `posts` table and walks through the library’s main APIs the way you’d use them in an app.

## Database lifecycle (Compose, not Testcontainers)

This example uses **Docker Compose + pnpm scripts**, not Testcontainers.

| Approach | Good for |
| --- | --- |
| **Compose + scripts** (what we use) | Learning / iterating: DB stays up, reconnect with `psql`, re-run demos in ~1s, no extra Node deps |
| **Testcontainers** | Automated tests in CI (this repo’s `test/dialect/*.test.ts`) — isolated, ephemeral, parallel |

The demo code never starts Docker itself; `package.json` owns that boundary so `index.ts` stays about the library.

## Prerequisites

- Node.js 24+
- Docker with Compose v2 (`docker compose`, including `up --wait`)
- Dependencies from the monorepo root (`pnpm install`)

## Run

From the **repo root** (starts Compose Postgres, then demos):

```bash
pnpm example:postgres
```

From this directory:

```bash
pnpm start          # db:up + demos (preferred)
pnpm db:up          # start Postgres only (stays up for iteration)
pnpm dev            # demos only (expects DB already up)
pnpm db:down        # stop / remove the container
pnpm db:reset       # wipe volume and recreate
```

Compose uses host port **54329** (avoids clashing with a system Postgres on 5432) and database `kysely_cursor_example`.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:54329/kysely_cursor_example` | Override to use your own Postgres |
| `PAGINATION_SECRET` | _(unset)_ | When set, page tokens are encrypted (SuperJSON → AES-GCM → Base64URL) |

```bash
PAGINATION_SECRET='dev-only-secret' pnpm start
```

```bash
# Bring-your-own database (skips needing Compose if you only run `pnpm dev`)
DATABASE_URL=postgres://user:pass@localhost:5432/mydb pnpm dev
```

## What it demonstrates

| # | Demo | Library surface |
| --- | --- | --- |
| 1 | Forward / back pagination | `paginate` + `cursor: { nextPage \| prevPage }` |
| 2 | Filtered author feed | Same sorts, different `WHERE` query |
| 3 | Nullable column ordering | `nulls: 'last'` on Postgres |
| 4 | Connection-style edges | `paginateWithEdges` |
| 5 | Numeric offset | `cursor: { offset }` |
| 6 | Full result walk | Loop on `nextPage` until exhausted |

Also covered in the supporting modules:

- **`nullable: false`** on non-null feed keys so Postgres can use row-value compare seeks
- **Composite indexes** that match sort shapes
- **Pluggable codecs** — default SuperJSON → Base64URL, optional AES-GCM via `PAGINATION_SECRET`
- **`keysetStrategy: 'auto'`** (row compare when allowed)

## Layout

```
examples/postgres/
  docker-compose.yml   Example Postgres (port 54329)
  package.json         db:up / db:down / start / dev
  index.ts             Entry: connect → migrate → seed → demos
  db.ts                Schema, indexes, deterministic seed
  paginator.ts         createPaginator + codec pipelines
  demos.ts             One function per feature
  README.md            This file
```

Copy patterns from `paginator.ts` and `demos.ts` into your app; Compose scripts are just harness.

## Key takeaways

1. **Sorts must uniquely identify rows** — end with a non-null unique key (usually primary key).
2. **Reuse one paginator** — dialect, codec, and keyset strategy are app-level; only query / sorts / cursor change per request.
3. **Match indexes to sorts** — e.g. `(created_at DESC, id DESC)` for the feed.
4. **Mark non-null leading keys** with `nullable: false` when you want seek-friendly SQL on Postgres.
5. **Keep the same `sorts` array** when following `nextPage` / `prevPage` (tokens include a sort signature).
6. Prefer keyset over **offset** for deep pages; use offset only for legacy page numbers or shallow admin UIs.

For full API docs, see the [root README](../../README.md).
