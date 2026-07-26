# kysely-cursor benchmarks

**2026-07-26T12:53:03.255Z** · `f9a2ed4` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.588ms | 1.97ms | 3.36× |
| mysql | depth=500 | 0.601ms | 70.0ms | 117× |
| mssql | depth=500 | 6.42ms | 27.8ms | 4.33× |
| sqlite | depth=500 | 0.251ms | 0.498ms | 1.99× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.26ms | 0.938ms | 0.74× | -0.323ms |
| depth=100 | 0.684ms | 1.09ms | 1.59× | 0.405ms |
| depth=500 | 0.588ms | 1.97ms | 3.36× | 1.38ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.0ms | 18.1ms | 1.13× | 2.05ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.11ms | 0.888ms | 0.80× | -0.222ms |
| depth=100 | 1.18ms | 56.2ms | 47.8× | 55.0ms |
| depth=500 | 0.601ms | 70.0ms | 117× | 69.4ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.0ms | 21.3ms | 1.33× | 5.26ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.11ms | 1.89ms | 0.89× | -0.227ms |
| depth=100 | 2.95ms | 6.75ms | 2.29× | 3.80ms |
| depth=500 | 6.42ms | 27.8ms | 4.33× | 21.3ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 39.2ms | 50.8ms | 1.30× | 11.6ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.469ms | 0.314ms | 0.67× | -0.156ms |
| depth=100 | 0.267ms | 0.247ms | 0.93× | -0.020ms |
| depth=500 | 0.251ms | 0.498ms | 1.99× | 0.247ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 7.29ms | 3.51ms | 0.48× | -3.784ms |

## Deep-page growth

- **postgres**: cursor ×0.47, offset ×2.10 (depth=0→depth=500); deepest speedup 3.36×
- **mysql**: cursor ×0.54, offset ×78.87 (depth=0→depth=500); deepest speedup 117×
- **mssql**: cursor ×3.04, offset ×14.72 (depth=0→depth=500); deepest speedup 4.33×
- **sqlite**: cursor ×0.53, offset ×1.59 (depth=0→depth=500); deepest speedup 1.99×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
