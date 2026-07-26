# kysely-cursor benchmarks

**2026-07-26T13:22:22.966Z** · `7b88b1a` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.493ms | 1.99ms | 4.03× |
| mysql | depth=500 | 0.635ms | 68.8ms | 108× |
| mssql | depth=500 | 5.86ms | 25.5ms | 4.35× |
| sqlite | depth=500 | 0.203ms | 0.458ms | 2.25× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.46ms | 1.16ms | 0.80× | -0.296ms |
| depth=100 | 0.772ms | 0.945ms | 1.22× | 0.172ms |
| depth=500 | 0.493ms | 1.99ms | 4.03× | 1.50ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 13.6ms | 12.1ms | 0.89× | -1.436ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.07ms | 0.852ms | 0.79× | -0.220ms |
| depth=100 | 0.810ms | 57.0ms | 70.4× | 56.2ms |
| depth=500 | 0.635ms | 68.8ms | 108× | 68.2ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 16.4ms | 20.0ms | 1.22× | 3.56ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.07ms | 1.81ms | 0.88× | -0.253ms |
| depth=100 | 2.50ms | 6.78ms | 2.71× | 4.28ms |
| depth=500 | 5.86ms | 25.5ms | 4.35× | 19.6ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 39.1ms | 50.4ms | 1.29× | 11.2ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.446ms | 0.307ms | 0.69× | -0.139ms |
| depth=100 | 0.299ms | 0.291ms | 0.97× | -0.008ms |
| depth=500 | 0.203ms | 0.458ms | 2.25× | 0.255ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 4.85ms | 3.53ms | 0.73× | -1.325ms |

## Deep-page growth

- **postgres**: cursor ×0.34, offset ×1.72 (depth=0→depth=500); deepest speedup 4.03×
- **mysql**: cursor ×0.59, offset ×80.81 (depth=0→depth=500); deepest speedup 108×
- **mssql**: cursor ×2.84, offset ×14.07 (depth=0→depth=500); deepest speedup 4.35×
- **sqlite**: cursor ×0.46, offset ×1.49 (depth=0→depth=500); deepest speedup 2.25×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
