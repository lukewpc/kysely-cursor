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

- Node 18+
- pnpm
- Docker (for postgres / mysql / mssql)

From the monorepo root:

```bash
pnpm install
pnpm build          # build kysely-cursor so the workspace package resolves
```

## Run

```bash
# all dialects, 100k rows (needs Docker)
pnpm bench

# fast smoke (10k rows, fewer iterations) — good first run
pnpm bench:quick

# single dialect
pnpm bench:sqlite
pnpm bench:postgres

# fine-grained knobs
pnpm --filter kysely-cursor-bench bench -- --dialect postgres,sqlite --rows 50000 --depths 0,10,100,500
```

### CLI flags

| Flag           | Default                           | Description                                    |
| -------------- | --------------------------------- | ---------------------------------------------- |
| `--dialect`    | all                               | Comma-separated: `postgres,mysql,mssql,sqlite` |
| `--rows`       | `100000` (`10000` with `--quick`) | Seed size                                      |
| `--page-size`  | `25`                              | Rows per page                                  |
| `--depths`     | `0,10,50,100,500,1000,2000`       | Deep-page depths (0-based)                     |
| `--walk-pages` | `200`                             | Sequential-walk length                         |
| `--iterations` | `15`                              | Timed iterations per cell                      |
| `--warmup`     | `3`                               | Untimed warmup iterations                      |
| `--out`        | `./bench/results`                 | Report output directory                        |
| `--quick`      | off                               | Smaller dataset / fewer iterations             |

## Scenarios

| Scenario            | What it models                                                   | Why it matters                                                     |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| **deep-page**       | Library page at depth N (`cursor: { nextPage }` vs `{ offset }`) | Primary library comparison; tokens pre-resolved outside the timer  |
| **sequential-walk** | Infinite scroll / crawl of N consecutive pages                   | End-to-end chained cost                                            |
| **filtered-feed**   | `WHERE status = 'published'` product listing                     | Selective filter + composite index                                 |
| **author-timeline** | `WHERE author_id = ?` profile feed                               | Selective secondary key + deep paging                              |
| **ideal-baseline**  | Textbook raw keyset SQL vs OFFSET (no library)                   | Theoretical ceiling; isolates null-safe predicate + codec overhead |

### Interpreting library vs ideal results

**Default** (unmarked leading sorts) still uses null-safe OR so nullable columns
work across dialects:

```sql
WHERE (created_at IS NOT NULL AND created_at < $1)
   OR (created_at IS NOT NULL AND created_at = $1 AND id IS NOT NULL AND id < $2)
```

On PostgreSQL that shape is typically a **Filter** over an index walk
(`Rows Removed by Filter ≈ OFFSET`), not an **Index Cond** seek.

Bench feed sorts set `nullable: false` on non-null columns. The library then
emits seek-friendly SQL where the dialect allows it — on Postgres, row compare:

```sql
WHERE (created_at, id) < ($1, $2)
```

which becomes an Index Cond seek (same shape as the ideal baseline).

Typical Postgres plans at depth 1000 (50k×~800B rows, warm cache):

| Form                           | Plan shape                        | Buffers | Exec time (order of magnitude) |
| ------------------------------ | --------------------------------- | ------- | ------------------------------ |
| Library null-safe OR (default) | Index Scan + Filter, ~25k removed | ~3000   | ~same as OFFSET                |
| Library with `nullable: false` | Index Cond seek                   | ~7      | **~100× faster**               |
| Ideal row comparison (raw SQL) | Index Cond seek                   | ~7      | theoretical ceiling            |
| OFFSET 25000                   | Index Scan, skip 25k              | ~3000   | baseline                       |

Postgres runs attach `EXPLAIN (ANALYZE, BUFFERS)` at the deepest measured page.

**Cursor pagination still wins on stability** under concurrent inserts/deletes
(no skipped/duplicated rows). These benches measure **latency**, not correctness.

### Dataset

A single realistic `posts` table is seeded deterministically on every dialect:

```
posts (
  id, author_id, title, status, score, created_at
)
```

Indexes:

- `(created_at, id)` — chronological feed
- `(status, created_at, id)` — filtered feed
- `(author_id, created_at, id)` — author timeline
- `(score, id)` — scoreboard-style sorts

~70% of rows are `status = 'published'`. Author `1` owns every 50th row so the
timeline scenario has real depth.

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
