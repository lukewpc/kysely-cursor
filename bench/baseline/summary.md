# kysely-cursor benchmarks

**2026-07-26T10:54:28.377Z** · `91a6469` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.864ms | 2.35ms | 2.72× |
| mysql | depth=500 | 0.645ms | 70.0ms | 108× |
| mssql | depth=500 | 5.99ms | 25.3ms | 4.23× |
| sqlite | depth=500 | 0.245ms | 0.505ms | 2.06× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.20ms | 0.879ms | 0.73× | -0.322ms |
| depth=100 | 0.786ms | 1.34ms | 1.70× | 0.553ms |
| depth=500 | 0.864ms | 2.35ms | 2.72× | 1.49ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 17.2ms | 12.9ms | 0.75× | -4.207ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.08ms | 0.816ms | 0.76× | -0.262ms |
| depth=100 | 0.832ms | 55.9ms | 67.2× | 55.1ms |
| depth=500 | 0.645ms | 70.0ms | 108× | 69.4ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.7ms | 20.0ms | 1.20× | 3.35ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.25ms | 1.91ms | 0.85× | -0.341ms |
| depth=100 | 2.59ms | 7.30ms | 2.82× | 4.71ms |
| depth=500 | 5.99ms | 25.3ms | 4.23× | 19.3ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 39.7ms | 50.9ms | 1.28× | 11.3ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.436ms | 0.314ms | 0.72× | -0.122ms |
| depth=100 | 0.254ms | 0.244ms | 0.96× | -0.010ms |
| depth=500 | 0.245ms | 0.505ms | 2.06× | 0.260ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 6.63ms | 3.50ms | 0.53× | -3.130ms |

## Deep-page growth

- **postgres**: cursor ×0.72, offset ×2.68 (depth=0→depth=500); deepest speedup 2.72×
- **mysql**: cursor ×0.60, offset ×85.78 (depth=0→depth=500); deepest speedup 108×
- **mssql**: cursor ×2.66, offset ×13.27 (depth=0→depth=500); deepest speedup 4.23×
- **sqlite**: cursor ×0.56, offset ×1.61 (depth=0→depth=500); deepest speedup 2.06×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
