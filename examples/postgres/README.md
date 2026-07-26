# PostgreSQL example — kysely-cursor

A small, runnable tour of [kysely-cursor](../..) against Postgres. It seeds a `posts` table and walks through the library’s main APIs the way you’d use them in an app.

## Prerequisites

- Node.js 20+
- Docker with Compose v2 (`docker compose`, including `up --wait`)
- Dependencies from the monorepo root (`pnpm install`)

## Run

From the **repo root** (starts Postgres, then demos):

```bash
pnpm example:postgres
```

From this directory:

```bash
pnpm start          # start Postgres + run demos
pnpm db:up          # start Postgres only (stays up for iteration)
pnpm dev            # demos only (expects DB already up)
pnpm db:down        # stop / remove the container
pnpm db:reset       # wipe volume and recreate
```

Compose uses host port **54329** (avoids clashing with a system Postgres on 5432) and database `kysely_cursor_example`.

### Environment

| Variable            | Default                                                              | Purpose                                                               |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`      | `postgres://postgres:postgres@localhost:54329/kysely_cursor_example` | Override to use your own Postgres                                     |
| `PAGINATION_SECRET` | _(unset)_                                                            | When set, page tokens are encrypted (SuperJSON → AES-GCM → Base64URL) |

```bash
PAGINATION_SECRET='dev-only-secret' pnpm start
```

```bash
# Bring-your-own database (skips Compose if you only run `pnpm dev`)
DATABASE_URL=postgres://user:pass@localhost:5432/mydb pnpm dev
```

## What it demonstrates

| #   | Demo                      | Library surface                                 |
| --- | ------------------------- | ----------------------------------------------- |
| 1   | Forward / back pagination | `paginate` + `cursor: { nextPage \| prevPage }` |
| 2   | Filtered author feed      | Same sorts, different `WHERE` query             |
| 3   | Nullable column ordering  | `nulls: 'last'` on Postgres                     |
| 4   | Connection-style edges    | `paginateWithEdges`                             |
| 5   | Numeric offset            | `cursor: { offset }`                            |
| 6   | Full result walk          | Loop on `nextPage` until exhausted              |

Supporting modules also show composite indexes matched to sort shapes, `notNull: true` for Postgres row-value seeks, pluggable codecs, and `keysetStrategy: 'auto'`.

```
examples/postgres/
  docker-compose.yml   Postgres on port 54329
  package.json         db:up / db:down / start / dev
  index.ts             connect → migrate → seed → demos
  db.ts                schema, indexes, seed
  paginator.ts         createPaginator + codec pipelines
  demos.ts             one function per feature
```

For full API docs and pagination tips, see the [root README](../../README.md).
