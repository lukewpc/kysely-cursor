# kysely-cursor benchmarks

**2026-07-25T18:59:02.715Z** · `5184713` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.583ms | 1.82ms | 3.12× |
| mysql | depth=500 | 0.639ms | 65.8ms | 103× |
| mssql | depth=500 | 7.42ms | 27.1ms | 3.66× |
| sqlite | depth=500 | 0.211ms | 0.501ms | 2.38× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.22ms | 0.869ms | 0.71× | -0.351ms |
| depth=100 | 0.720ms | 0.964ms | 1.34× | 0.244ms |
| depth=500 | 0.583ms | 1.82ms | 3.12× | 1.23ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 14.4ms | 12.6ms | 0.87× | -1.844ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.08ms | 0.783ms | 0.73× | -0.293ms |
| depth=100 | 0.821ms | 53.1ms | 64.6× | 52.2ms |
| depth=500 | 0.639ms | 65.8ms | 103× | 65.1ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 15.2ms | 20.4ms | 1.34× | 5.22ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.16ms | 1.89ms | 0.88× | -0.265ms |
| depth=100 | 2.79ms | 7.42ms | 2.66× | 4.63ms |
| depth=500 | 7.42ms | 27.1ms | 3.66× | 19.7ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 38.2ms | 49.8ms | 1.30× | 11.6ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.498ms | 0.357ms | 0.72× | -0.141ms |
| depth=100 | 0.311ms | 0.299ms | 0.96× | -0.012ms |
| depth=500 | 0.211ms | 0.501ms | 2.38× | 0.290ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 5.36ms | 3.82ms | 0.71× | -1.548ms |

## Deep-page growth

- **postgres**: cursor ×0.48, offset ×2.09 (depth=0→depth=500); deepest speedup 3.12×
- **mysql**: cursor ×0.59, offset ×83.99 (depth=0→depth=500); deepest speedup 103×
- **mssql**: cursor ×3.44, offset ×14.35 (depth=0→depth=500); deepest speedup 3.66×
- **sqlite**: cursor ×0.42, offset ×1.41 (depth=0→depth=500); deepest speedup 2.38×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
