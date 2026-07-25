# kysely-cursor benchmarks

**2026-07-25T19:21:03.631Z** · `ce6911c` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.557ms | 1.77ms | 3.18× |
| mysql | depth=500 | 0.621ms | 69.6ms | 112× |
| mssql | depth=500 | 3.57ms | 18.3ms | 5.11× |
| sqlite | depth=500 | 0.248ms | 0.493ms | 1.99× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.43ms | 1.000ms | 0.70× | -0.426ms |
| depth=100 | 0.666ms | 0.965ms | 1.45× | 0.299ms |
| depth=500 | 0.557ms | 1.77ms | 3.18× | 1.22ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 14.3ms | 14.8ms | 1.04× | 0.583ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.05ms | 0.807ms | 0.77× | -0.242ms |
| depth=100 | 0.800ms | 57.3ms | 71.6× | 56.5ms |
| depth=500 | 0.621ms | 69.6ms | 112× | 69.0ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.8ms | 20.0ms | 1.19× | 3.24ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.54ms | 1.21ms | 0.79× | -0.326ms |
| depth=100 | 1.83ms | 5.03ms | 2.74× | 3.20ms |
| depth=500 | 3.57ms | 18.3ms | 5.11× | 14.7ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 23.9ms | 31.9ms | 1.33× | 7.92ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.514ms | 0.311ms | 0.60× | -0.203ms |
| depth=100 | 0.247ms | 0.239ms | 0.97× | -0.008ms |
| depth=500 | 0.248ms | 0.493ms | 1.99× | 0.245ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 7.27ms | 3.44ms | 0.47× | -3.834ms |

## Deep-page growth

- **postgres**: cursor ×0.39, offset ×1.77 (depth=0→depth=500); deepest speedup 3.18×
- **mysql**: cursor ×0.59, offset ×86.22 (depth=0→depth=500); deepest speedup 112×
- **mssql**: cursor ×2.32, offset ×15.08 (depth=0→depth=500); deepest speedup 5.11×
- **sqlite**: cursor ×0.48, offset ×1.59 (depth=0→depth=500); deepest speedup 1.99×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
