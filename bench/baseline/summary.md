# kysely-cursor benchmarks

**2026-07-26T12:56:09.724Z** · `cbf4fa5` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.688ms | 2.79ms | 4.06× |
| mysql | depth=500 | 0.489ms | 55.1ms | 113× |
| mssql | depth=500 | 8.23ms | 27.9ms | 3.39× |
| sqlite | depth=500 | 0.202ms | 0.494ms | 2.45× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.25ms | 0.922ms | 0.74× | -0.325ms |
| depth=100 | 0.699ms | 0.871ms | 1.24× | 0.171ms |
| depth=500 | 0.688ms | 2.79ms | 4.06× | 2.11ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 14.9ms | 14.8ms | 1.00× | -0.048ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.803ms | 0.620ms | 0.77× | -0.184ms |
| depth=100 | 0.612ms | 43.4ms | 70.8× | 42.8ms |
| depth=500 | 0.489ms | 55.1ms | 113× | 54.6ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 12.1ms | 15.2ms | 1.26× | 3.18ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.43ms | 2.00ms | 0.82× | -0.433ms |
| depth=100 | 2.96ms | 7.47ms | 2.52× | 4.51ms |
| depth=500 | 8.23ms | 27.9ms | 3.39× | 19.7ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 46.5ms | 55.7ms | 1.20× | 9.14ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.433ms | 0.299ms | 0.69× | -0.134ms |
| depth=100 | 0.239ms | 0.236ms | 0.99× | -0.003ms |
| depth=500 | 0.202ms | 0.494ms | 2.45× | 0.292ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 4.75ms | 2.84ms | 0.60× | -1.909ms |

## Deep-page growth

- **postgres**: cursor ×0.55, offset ×3.03 (depth=0→depth=500); deepest speedup 4.06×
- **mysql**: cursor ×0.61, offset ×88.98 (depth=0→depth=500); deepest speedup 113×
- **mssql**: cursor ×3.38, offset ×13.97 (depth=0→depth=500); deepest speedup 3.39×
- **sqlite**: cursor ×0.47, offset ×1.65 (depth=0→depth=500); deepest speedup 2.45×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
