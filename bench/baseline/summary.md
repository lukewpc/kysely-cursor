# kysely-cursor benchmarks

**2026-07-26T12:10:06.592Z** · `8cd7f02` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.594ms | 1.65ms | 2.77× |
| mysql | depth=500 | 0.658ms | 68.7ms | 104× |
| mssql | depth=500 | 5.67ms | 27.0ms | 4.77× |
| sqlite | depth=500 | 0.203ms | 0.443ms | 2.18× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.23ms | 0.891ms | 0.72× | -0.340ms |
| depth=100 | 0.715ms | 1.04ms | 1.45× | 0.322ms |
| depth=500 | 0.594ms | 1.65ms | 2.77× | 1.05ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 15.0ms | 20.1ms | 1.34× | 5.06ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.07ms | 0.866ms | 0.81× | -0.203ms |
| depth=100 | 0.830ms | 54.1ms | 65.2× | 53.3ms |
| depth=500 | 0.658ms | 68.7ms | 104× | 68.0ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 15.9ms | 20.5ms | 1.29× | 4.63ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.27ms | 1.89ms | 0.83× | -0.389ms |
| depth=100 | 2.94ms | 7.37ms | 2.51× | 4.44ms |
| depth=500 | 5.67ms | 27.0ms | 4.77× | 21.4ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 39.4ms | 48.3ms | 1.22× | 8.83ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.421ms | 0.307ms | 0.73× | -0.115ms |
| depth=100 | 0.298ms | 0.277ms | 0.93× | -0.021ms |
| depth=500 | 0.203ms | 0.443ms | 2.18× | 0.240ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 4.92ms | 3.52ms | 0.72× | -1.400ms |

## Deep-page growth

- **postgres**: cursor ×0.48, offset ×1.85 (depth=0→depth=500); deepest speedup 2.77×
- **mysql**: cursor ×0.61, offset ×79.31 (depth=0→depth=500); deepest speedup 104×
- **mssql**: cursor ×2.49, offset ×14.33 (depth=0→depth=500); deepest speedup 4.77×
- **sqlite**: cursor ×0.48, offset ×1.44 (depth=0→depth=500); deepest speedup 2.18×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
