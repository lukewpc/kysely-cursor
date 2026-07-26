# kysely-cursor benchmarks

**2026-07-26T13:14:52.772Z** · `8f49161` · 50,000 rows · page 25 · iters 4/1 · walk 25 · depths [0,100,500] · postgres,mysql,mssql,sqlite · deep-page,sequential-walk

Cursor = keyset via library API (`notNull: true` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=500 | 0.585ms | 1.95ms | 3.34× |
| mysql | depth=500 | 0.613ms | 69.2ms | 113× |
| mssql | depth=500 | 6.32ms | 26.1ms | 4.13× |
| sqlite | depth=500 | 0.248ms | 0.492ms | 1.98× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.35ms | 0.933ms | 0.69× | -0.419ms |
| depth=100 | 0.700ms | 1.16ms | 1.65× | 0.456ms |
| depth=500 | 0.585ms | 1.95ms | 3.34× | 1.37ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 17.9ms | 13.8ms | 0.77× | -4.092ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 1.10ms | 0.817ms | 0.74× | -0.280ms |
| depth=100 | 0.783ms | 55.7ms | 71.2× | 55.0ms |
| depth=500 | 0.613ms | 69.2ms | 113× | 68.6ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 15.9ms | 20.2ms | 1.27× | 4.26ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 2.36ms | 1.99ms | 0.84× | -0.377ms |
| depth=100 | 2.99ms | 7.13ms | 2.39× | 4.14ms |
| depth=500 | 6.32ms | 26.1ms | 4.13× | 19.8ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 44.4ms | 49.1ms | 1.11× | 4.69ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.415ms | 0.294ms | 0.71× | -0.121ms |
| depth=100 | 0.235ms | 0.239ms | 1.02× | 0.004ms |
| depth=500 | 0.248ms | 0.492ms | 1.98× | 0.243ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=25 | 6.77ms | 2.84ms | 0.42× | -3.930ms |

## Deep-page growth

- **postgres**: cursor ×0.43, offset ×2.09 (depth=0→depth=500); deepest speedup 3.34×
- **mysql**: cursor ×0.56, offset ×84.69 (depth=0→depth=500); deepest speedup 113×
- **mssql**: cursor ×2.67, offset ×13.14 (depth=0→depth=500); deepest speedup 4.13×
- **sqlite**: cursor ×0.60, offset ×1.67 (depth=0→depth=500); deepest speedup 1.98×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
