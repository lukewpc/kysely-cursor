# kysely-cursor benchmarks

**2026-07-26T12:47:08.048Z** · `8813118` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.687ms | 1.73ms | 2.53× |
| mysql | depth=500 | 0.667ms | 70.8ms | 106× |
| mssql | depth=500 | 6.43ms | 27.9ms | 4.35× |
| sqlite | depth=500 | 0.235ms | 0.485ms | 2.06× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.34ms | 0.895ms | 0.67× | -0.449ms |
| depth=100 | 0.700ms | 0.914ms | 1.31× | 0.214ms |
| depth=500 | 0.687ms | 1.73ms | 2.53× | 1.05ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 15.2ms | 13.6ms | 0.89× | -1.598ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.17ms | 0.826ms | 0.71× | -0.341ms |
| depth=100 | 0.761ms | 56.0ms | 73.6× | 55.2ms |
| depth=500 | 0.667ms | 70.8ms | 106× | 70.1ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.5ms | 21.4ms | 1.30× | 4.93ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.26ms | 1.99ms | 0.88× | -0.270ms |
| depth=100 | 2.76ms | 7.34ms | 2.66× | 4.58ms |
| depth=500 | 6.43ms | 27.9ms | 4.35× | 21.5ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 42.2ms | 57.3ms | 1.36× | 15.1ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.429ms | 0.311ms | 0.72× | -0.118ms |
| depth=100 | 0.246ms | 0.224ms | 0.91× | -0.021ms |
| depth=500 | 0.235ms | 0.485ms | 2.06× | 0.250ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 6.79ms | 2.97ms | 0.44× | -3.819ms |

## Deep-page growth

- **postgres**: cursor ×0.51, offset ×1.94 (depth=0→depth=500); deepest speedup 2.53×
- **mysql**: cursor ×0.57, offset ×85.75 (depth=0→depth=500); deepest speedup 106×
- **mssql**: cursor ×2.84, offset ×14.04 (depth=0→depth=500); deepest speedup 4.35×
- **sqlite**: cursor ×0.55, offset ×1.56 (depth=0→depth=500); deepest speedup 2.06×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
