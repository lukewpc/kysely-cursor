# kysely-cursor benchmarks

**2026-07-25T18:15:46.201Z** · `89f6616` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.594ms | 1.73ms | 2.91× |
| mysql | depth=500 | 0.501ms | 54.5ms | 109× |
| mssql | depth=500 | 6.06ms | 26.5ms | 4.38× |
| sqlite | depth=500 | 0.196ms | 0.504ms | 2.57× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.18ms | 0.873ms | 0.74× | -0.303ms |
| depth=100 | 0.757ms | 1.13ms | 1.50× | 0.376ms |
| depth=500 | 0.594ms | 1.73ms | 2.91× | 1.13ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 17.3ms | 19.0ms | 1.10× | 1.74ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.836ms | 0.623ms | 0.75× | -0.212ms |
| depth=100 | 0.603ms | 42.9ms | 71.1× | 42.3ms |
| depth=500 | 0.501ms | 54.5ms | 109× | 54.0ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 11.9ms | 14.5ms | 1.22× | 2.64ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.19ms | 1.93ms | 0.88× | -0.253ms |
| depth=100 | 2.66ms | 7.14ms | 2.69× | 4.48ms |
| depth=500 | 6.06ms | 26.5ms | 4.38× | 20.5ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 41.5ms | 58.3ms | 1.40× | 16.8ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.462ms | 0.298ms | 0.64× | -0.165ms |
| depth=100 | 0.285ms | 0.275ms | 0.97× | -0.009ms |
| depth=500 | 0.196ms | 0.504ms | 2.57× | 0.308ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 4.46ms | 2.89ms | 0.65× | -1.569ms |

## Deep-page growth

- **postgres**: cursor ×0.51, offset ×1.98 (depth=0→depth=500); deepest speedup 2.91×
- **mysql**: cursor ×0.60, offset ×87.49 (depth=0→depth=500); deepest speedup 109×
- **mssql**: cursor ×2.77, offset ×13.74 (depth=0→depth=500); deepest speedup 4.38×
- **sqlite**: cursor ×0.42, offset ×1.69 (depth=0→depth=500); deepest speedup 2.57×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
