# kysely-cursor benchmarks

**2026-07-26T10:19:34.198Z** · `8e72b5c` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.602ms | 1.73ms | 2.87× |
| mysql | depth=500 | 0.643ms | 68.5ms | 107× |
| mssql | depth=500 | 4.37ms | 19.6ms | 4.48× |
| sqlite | depth=500 | 0.202ms | 0.463ms | 2.29× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.31ms | 0.948ms | 0.72× | -0.366ms |
| depth=100 | 0.726ms | 1.03ms | 1.42× | 0.306ms |
| depth=500 | 0.602ms | 1.73ms | 2.87× | 1.13ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 15.8ms | 16.4ms | 1.04× | 0.564ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.09ms | 0.834ms | 0.76× | -0.261ms |
| depth=100 | 1.45ms | 54.6ms | 37.6× | 53.1ms |
| depth=500 | 0.643ms | 68.5ms | 107× | 67.8ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.0ms | 19.9ms | 1.24× | 3.89ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.57ms | 1.35ms | 0.86× | -0.216ms |
| depth=100 | 1.84ms | 5.28ms | 2.87× | 3.44ms |
| depth=500 | 4.37ms | 19.6ms | 4.48× | 15.2ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 28.1ms | 38.3ms | 1.36× | 10.2ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.506ms | 0.386ms | 0.76× | -0.121ms |
| depth=100 | 0.306ms | 0.297ms | 0.97× | -0.009ms |
| depth=500 | 0.202ms | 0.463ms | 2.29× | 0.261ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 5.11ms | 3.59ms | 0.70× | -1.527ms |

## Deep-page growth

- **postgres**: cursor ×0.46, offset ×1.82 (depth=0→depth=500); deepest speedup 2.87×
- **mysql**: cursor ×0.59, offset ×82.12 (depth=0→depth=500); deepest speedup 107×
- **mssql**: cursor ×2.78, offset ×14.47 (depth=0→depth=500); deepest speedup 4.48×
- **sqlite**: cursor ×0.40, offset ×1.20 (depth=0→depth=500); deepest speedup 2.29×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
