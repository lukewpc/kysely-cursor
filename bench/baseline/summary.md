# kysely-cursor benchmarks

**2026-07-26T10:21:27.498Z** · `5cbc18d` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.530ms | 1.71ms | 3.23× |
| mysql | depth=500 | 0.646ms | 69.3ms | 107× |
| mssql | depth=500 | 6.39ms | 28.2ms | 4.41× |
| sqlite | depth=500 | 0.183ms | 0.447ms | 2.44× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.30ms | 1.03ms | 0.79× | -0.269ms |
| depth=100 | 0.661ms | 1.01ms | 1.52× | 0.345ms |
| depth=500 | 0.530ms | 1.71ms | 3.23× | 1.18ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 14.1ms | 14.3ms | 1.01× | 0.176ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.11ms | 0.844ms | 0.76× | -0.269ms |
| depth=100 | 0.852ms | 55.3ms | 64.9× | 54.5ms |
| depth=500 | 0.646ms | 69.3ms | 107× | 68.6ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.3ms | 20.4ms | 1.25× | 4.05ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.28ms | 1.97ms | 0.86× | -0.311ms |
| depth=100 | 3.09ms | 8.05ms | 2.61× | 4.96ms |
| depth=500 | 6.39ms | 28.2ms | 4.41× | 21.8ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 40.2ms | 51.7ms | 1.29× | 11.5ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.425ms | 0.286ms | 0.67× | -0.138ms |
| depth=100 | 0.218ms | 0.208ms | 0.96× | -0.009ms |
| depth=500 | 0.183ms | 0.447ms | 2.44× | 0.263ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 5.01ms | 3.61ms | 0.72× | -1.401ms |

## Deep-page growth

- **postgres**: cursor ×0.41, offset ×1.66 (depth=0→depth=500); deepest speedup 3.23×
- **mysql**: cursor ×0.58, offset ×82.03 (depth=0→depth=500); deepest speedup 107×
- **mssql**: cursor ×2.81, offset ×14.32 (depth=0→depth=500); deepest speedup 4.41×
- **sqlite**: cursor ×0.43, offset ×1.56 (depth=0→depth=500); deepest speedup 2.44×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
