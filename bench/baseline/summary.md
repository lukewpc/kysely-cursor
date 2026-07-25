# kysely-cursor benchmarks

**2026-07-25T18:08:52.785Z** · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.296ms | 0.913ms | 3.09× |
| mysql | depth=500 | 0.306ms | 83.2ms | 271× |
| mssql | depth=500 | 3.09ms | 19.2ms | 6.22× |
| sqlite | depth=500 | 0.097ms | 0.254ms | 2.62× |

## postgres

### Deep page (single request at depth N)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.525ms | 0.422ms | 0.80× | -0.103ms |
| depth=100 | 0.364ms | 0.610ms | 1.67× | 0.246ms |
| depth=500 | 0.296ms | 0.913ms | 3.09× | 0.618ms |

### Sequential walk (N consecutive pages)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 8.17ms | 6.40ms | 0.78× | -1.774ms |

## mysql

### Deep page (single request at depth N)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.338ms | 0.312ms | 0.92× | -0.026ms |
| depth=100 | 0.356ms | 62.1ms | 174× | 61.7ms |
| depth=500 | 0.306ms | 83.2ms | 271× | 82.9ms |

### Sequential walk (N consecutive pages)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 7.67ms | 11.4ms | 1.49× | 3.73ms |

## mssql

### Deep page (single request at depth N)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.838ms | 0.857ms | 1.02× | 0.019ms |
| depth=100 | 1.47ms | 4.53ms | 3.09× | 3.06ms |
| depth=500 | 3.09ms | 19.2ms | 6.22× | 16.2ms |

### Sequential walk (N consecutive pages)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 17.4ms | 24.0ms | 1.38× | 6.61ms |

## sqlite

### Deep page (single request at depth N)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.078ms | 0.069ms | 0.89× | -0.008ms |
| depth=100 | 0.161ms | 0.107ms | 0.66× | -0.054ms |
| depth=500 | 0.097ms | 0.254ms | 2.62× | 0.157ms |

### Sequential walk (N consecutive pages)

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 2.70ms | 1.58ms | 0.59× | -1.116ms |

## Deep-page growth

- **postgres**: cursor ×0.56, offset ×2.17 (depth=0→depth=500); deepest speedup 3.09×
- **mysql**: cursor ×0.91, offset ×266.33 (depth=0→depth=500); deepest speedup 271×
- **mssql**: cursor ×3.69, offset ×22.46 (depth=0→depth=500); deepest speedup 6.22×
- **sqlite**: cursor ×1.25, offset ×3.66 (depth=0→depth=500); deepest speedup 2.62×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
