# kysely-cursor benchmarks

Realistic **cursor (keyset) vs offset** pagination benchmarks for every dialect
supported by [kysely-cursor](../README.md):

| Dialect    | Engine          | How it runs               |
| ---------- | --------------- | ------------------------- |
| `postgres` | PostgreSQL 17   | Docker via testcontainers |
| `mysql`    | MySQL 8.4       | Docker via testcontainers |
| `mssql`    | SQL Server 2022 | Docker via testcontainers |
| `sqlite`   | better-sqlite3  | In-process (no Docker)    |

Both strategies go through the same public API:

```ts
// keyset
await paginator.paginate({ query, sorts, limit, cursor: { nextPage } })

// offset fallback
await paginator.paginate({ query, sorts, limit, cursor: { offset } })
```

## Prerequisites

- Node 24+
- pnpm
- Docker (for postgres / mysql / mssql)

From the monorepo root:

```bash
pnpm install
pnpm build          # build kysely-cursor so the workspace package resolves
```

## Run

```bash
# all dialects, 200k rows (needs Docker)
pnpm bench

# fast smoke (20k rows, fewer iterations) — good first run
pnpm bench:quick

# single dialect
pnpm bench:sqlite
pnpm bench:postgres

# fine-grained knobs
pnpm --filter kysely-cursor-bench bench -- --dialect postgres,sqlite --rows 50000 --depths 0,10,100,500
```

### CLI flags

| Flag           | Default                                      | Description                                    |
| -------------- | -------------------------------------------- | ---------------------------------------------- |
| `--dialect`    | all                                          | Comma-separated: `postgres,mysql,mssql,sqlite` |
| `--rows`       | `200000` (`20000` with `--quick`)            | Seed size                                      |
| `--page-size`  | `25`                                         | Rows per page                                  |
| `--depths`     | `0,10,50,100,500,1000,2000,4000` (quick: `0,10,50,200,400`) | Deep-page depths (0-based); clipped to dataset |
| `--walk-pages` | `150` (`40` with `--quick`)                  | Sequential-walk length                         |
| `--iterations` | `12` (`5` with `--quick`)                    | Timed iterations per cell                      |
| `--warmup`     | `3` (`1` with `--quick`)                     | Untimed warmup iterations                      |
| `--out`        | `./bench/results`                            | Report output directory                        |
| `--quick`      | off                                          | Smaller dataset / fewer iterations             |

## Scenarios

| Scenario            | What it models                                                   | Why it matters                                                     |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| **deep-page**       | Library page at depth N (`cursor: { nextPage }` vs `{ offset }`) | Primary library comparison; tokens pre-resolved outside the timer  |
| **sequential-walk** | Infinite scroll / crawl of N consecutive pages                   | End-to-end chained cost                                            |
| **filtered-feed**   | `WHERE status = 'published'` product listing                     | Selective filter + composite index                                 |
| **author-timeline** | `WHERE author_id = ?` profile feed                               | Selective secondary key + deep paging                              |
| **scoreboard**      | `ORDER BY score DESC, id DESC` ranking                           | Non-time secondary sort + `(score, id)` index                      |
| **ideal-baseline**  | Raw keyset SQL matching the dialect’s library emission           | Codec/wrapper ceiling — not a generic “textbook” shape on every DB |

### What SQL the library emits (timed scenarios)

Timed scenarios set `nullable: false` on non-null sort keys. Emission still follows
each dialect’s capability flags (same as production):

| Dialect    | With `nullable: false` (feed / score sorts) | Notes |
| ---------- | ------------------------------------------- | ----- |
| `postgres` | **Row compare** `(created_at, id) < ($1,$2)` | Index Cond seek |
| `sqlite`   | **Row compare**                             | Same family |
| `mssql`    | **Plain OR** (no tuple compare)             | Cursor still wins; latency can grow with depth |
| `mysql`    | **Null-safe OR** (even with `nullable: false`) | Intentional: plain OR / row compare often regress at depth on MySQL |

Default (unmarked) leading sorts stay **null-safe OR** on every dialect. On
Postgres that shape is typically a **Filter** over an index walk
(`Rows Removed by Filter ≈ OFFSET`), not an Index Cond seek — so deep pages
look ~like OFFSET unless you opt into `nullable: false`.

```sql
-- default / MySQL optimized path
WHERE (created_at IS NOT NULL AND created_at < $1)
   OR (created_at IS NOT NULL AND created_at = $1 AND id IS NOT NULL AND id < $2)

-- Postgres / SQLite with nullable: false
WHERE (created_at, id) < ($1, $2)
```

### Interpreting library vs ideal

**ideal-baseline** uses raw SQL in the **same form the library uses on that dialect**,
without the token codec or paginator wrapper:

| Dialect    | Ideal keyset form                          |
| ---------- | ------------------------------------------ |
| `postgres` | Row compare                                |
| `sqlite`   | Row compare                                |
| `mysql`    | Null-safe OR (not row compare)             |
| `mssql`    | Plain OR                                   |

Library deep-page should **approach** ideal on that dialect. A large inverted gap
(lib ≫ ideal or ideal ≫ lib) usually means plan mismatch, not “magic” library
performance.

Typical Postgres plans at depth ~1000+ (warm cache, ~800B rows):

| Form                           | Plan shape                        | Buffers | Exec time (order of magnitude) |
| ------------------------------ | --------------------------------- | ------- | ------------------------------ |
| Library null-safe OR (default) | Index Scan + Filter, many removed | ~thousands | ~same as OFFSET            |
| Library `nullable: false`      | Index Cond seek                   | ~single digits | **much faster**          |
| Ideal row comparison (raw SQL) | Index Cond seek                   | ~same as seek  | codec ceiling            |
| OFFSET deep skip               | Index Scan, skip N                | ~thousands | baseline                   |

Postgres runs attach `EXPLAIN (ANALYZE, BUFFERS)` at the deepest measured page
(library seek form, default null-safe OR, and OFFSET).

### Reading MySQL (and OFFSET cliffs)

MySQL often shows a **sharp OFFSET cliff** once skip distance and fat row payloads
add up (this bench selects a non-indexed ~800B `body` column). Cursor stays roughly
flat while OFFSET can jump from a few ms to hundreds of ms between mid and deep
pages. That is **engine + workload** behavior (large `OFFSET` still walks and
discards rows), not a library bug.

**Do not** treat multi-thousand× MySQL speedups as portable marketing numbers —
they depend on row width, indexes, and depth. Prefer quoting Postgres growth
curves + plans, and describing MySQL as “cursor flat / OFFSET collapses under
deep skip.”

### Stability vs latency

**Cursor pagination still wins on stability** under concurrent inserts/deletes
(no skipped/duplicated rows). These benches measure **latency**, not correctness.

### Dataset

A single realistic `posts` table is seeded deterministically on every dialect:

```
posts (
  id, author_id, title, body, status, score, created_at
)
```

Indexes:

- `(created_at, id)` — chronological feed
- `(status, created_at, id)` — filtered feed
- `(author_id, created_at, id)` — author timeline
- `(score, id)` — scoreboard-style sorts

~70% of rows are `status = 'published'`. Author `1` owns every 50th row so the
timeline scenario has real depth. `body` is non-indexed payload so deep OFFSET
cannot stay index-only.

## Reports

Each run writes:

```
bench/results/
  <timestamp>-report.md      # human-readable markdown
  <timestamp>-results.json   # full sample data + stats
  latest-report.md           # overwritten each run
  latest-results.json
```

Console output includes per-scenario tables (mean / p50 / p95), a headline
deep-page summary, and written takeaways.

### Reading the numbers

- **Speedup** = `offset.mean / cursor.mean` (higher ⇒ cursor faster).
- **Δ ms** = `offset.mean − cursor.mean` (positive ⇒ cursor faster).
- Absolute ms depends on machine and container RTT; the **relative** gap is the signal.
- Page 0 is often similar for both strategies (no skip). The gap opens as depth grows.
- Compare **within a dialect**, not absolute ms across Postgres vs SQLite (containers vs in-process).

## Methodology

1. Start dialect (container or in-process).
2. Create schema + indexes, seed `N` rows, `ANALYZE` / update statistics.
3. For each scenario:
   - Warmup iterations (untimed).
   - Timed iterations; record wall-clock ms via `performance.now()`.
4. Summarize mean / min / max / p50 / p95 / p99 / stdev.
5. Dispose containers and write reports.

For **deep-page**, cursor tokens at each depth are resolved _outside_ the timer
so the comparison is fair: both strategies are measured on a single page fetch
at that position. Sequential-walk times the full multi-page chain.

Postgres runs also capture optional `EXPLAIN (ANALYZE, BUFFERS)` snippets for
qualitative comparison of OFFSET skip vs keyset seek plans.
