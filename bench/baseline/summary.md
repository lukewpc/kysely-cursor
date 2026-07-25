# kysely-cursor benchmarks

**2026-07-25T14:20:39.600Z** · 200,000 rows · page 25 · iters 12/3 · walk 150 · depths [0,10,50,100,500,1000,2000,4000] · postgres, mysql, mssql, sqlite

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect | Label | Cursor | Offset | Speedup |
| --- | --- | ---: | ---: | ---: |
| postgres | depth=4000 | 0.214ms | 10.5ms | 48.9× |
| mysql | depth=4000 | 0.302ms | 468ms | 1551× |
| mssql | depth=4000 | 32.6ms | 110ms | 3.38× |
| sqlite | depth=4000 | 0.069ms | 1.40ms | 20.2× |

## postgres

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.944ms | 0.347ms | 0.37× | -0.596ms |
| depth=10 | 0.322ms | 0.262ms | 0.82× | -0.059ms |
| depth=50 | 0.324ms | 0.304ms | 0.94× | -0.020ms |
| depth=100 | 0.361ms | 0.351ms | 0.97× | -0.011ms |
| depth=500 | 0.235ms | 0.959ms | 4.08× | 0.724ms |
| depth=1000 | 0.226ms | 1.91ms | 8.43× | 1.68ms |
| depth=2000 | 0.228ms | 6.89ms | 30.2× | 6.66ms |
| depth=4000 | 0.214ms | 10.5ms | 48.9× | 10.2ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=150 | 34.9ms | 43.2ms | 1.24× | 8.30ms |

### filtered-feed

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.216ms | 0.178ms | 0.82× | -0.038ms |
| depth=10 | 0.220ms | 0.220ms | 1.00× | 0.000ms |
| depth=50 | 0.229ms | 0.316ms | 1.38× | 0.088ms |
| depth=100 | 0.295ms | 0.484ms | 1.64× | 0.189ms |
| depth=500 | 0.203ms | 1.80ms | 8.88× | 1.60ms |
| depth=1000 | 0.249ms | 7.34ms | 29.5× | 7.09ms |

### author-timeline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.190ms | 0.198ms | 1.04× | 0.008ms |
| depth=5 | 0.244ms | 0.202ms | 0.83× | -0.042ms |
| depth=10 | 0.226ms | 0.220ms | 0.97× | -0.007ms |
| depth=25 | 0.237ms | 0.284ms | 1.20× | 0.047ms |
| walk=40 | 10.5ms | 10.5ms | 1.00× | 0.011ms |
| depth=50 | 0.251ms | 0.393ms | 1.57× | 0.143ms |
| depth=100 | 0.253ms | 0.568ms | 2.25× | 0.316ms |

### scoreboard

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.188ms | 0.176ms | 0.94× | -0.012ms |
| depth=10 | 0.198ms | 0.633ms | 3.19× | 0.435ms |
| depth=50 | 0.226ms | 0.324ms | 1.43× | 0.098ms |
| depth=100 | 0.217ms | 0.432ms | 1.99× | 0.215ms |
| depth=500 | 0.198ms | 1.56ms | 7.87× | 1.36ms |
| depth=1000 | 0.189ms | 2.88ms | 15.2× | 2.69ms |

### ideal-baseline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.182ms | 0.172ms | 0.95× | -0.009ms |
| depth=50 | 0.198ms | 0.237ms | 1.20× | 0.039ms |
| depth=100 | 0.199ms | 0.301ms | 1.51× | 0.102ms |
| depth=500 | 0.197ms | 0.795ms | 4.03× | 0.598ms |
| depth=1000 | 0.201ms | 1.42ms | 7.03× | 1.22ms |
| depth=2000 | 0.203ms | 3.07ms | 15.1× | 2.87ms |

## mysql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.283ms | 0.240ms | 0.85× | -0.044ms |
| depth=10 | 0.318ms | 0.427ms | 1.34× | 0.108ms |
| depth=50 | 0.339ms | 1.19ms | 3.50× | 0.849ms |
| depth=100 | 0.282ms | 2.23ms | 7.92× | 1.95ms |
| depth=500 | 0.276ms | 376ms | 1365× | 376ms |
| depth=1000 | 0.318ms | 401ms | 1260× | 401ms |
| depth=2000 | 0.291ms | 424ms | 1456× | 424ms |
| depth=4000 | 0.302ms | 468ms | 1551× | 467ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=150 | 40.5ms | 253ms | 6.25× | 213ms |

### filtered-feed

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.264ms | 0.264ms | 1.00× | -0.000ms |
| depth=10 | 0.307ms | 0.416ms | 1.35× | 0.109ms |
| depth=50 | 0.275ms | 1.28ms | 4.67× | 1.01ms |
| depth=100 | 0.345ms | 2.43ms | 7.04× | 2.08ms |
| depth=500 | 0.304ms | 14.2ms | 46.7× | 13.9ms |
| depth=1000 | 0.390ms | 28.8ms | 74.0× | 28.4ms |

### author-timeline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.255ms | 0.240ms | 0.94× | -0.015ms |
| depth=5 | 0.316ms | 0.347ms | 1.10× | 0.031ms |
| depth=10 | 0.297ms | 0.450ms | 1.51× | 0.153ms |
| depth=25 | 0.332ms | 0.813ms | 2.45× | 0.481ms |
| walk=40 | 13.2ms | 27.6ms | 2.10× | 14.5ms |
| depth=50 | 0.270ms | 1.68ms | 6.22× | 1.41ms |
| depth=100 | 0.271ms | 2.93ms | 10.8× | 2.66ms |

### scoreboard

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.220ms | 0.215ms | 0.98× | -0.005ms |
| depth=10 | 0.275ms | 0.453ms | 1.65× | 0.178ms |
| depth=50 | 0.277ms | 1.37ms | 4.94× | 1.09ms |
| depth=100 | 0.253ms | 2.50ms | 9.89× | 2.25ms |
| depth=500 | 0.249ms | 454ms | 1826× | 454ms |
| depth=1000 | 0.280ms | 475ms | 1696× | 475ms |

### ideal-baseline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.238ms | 0.200ms | 0.84× | -0.039ms |
| depth=50 | 1.24ms | 1.15ms | 0.93× | -0.091ms |
| depth=100 | 2.38ms | 2.17ms | 0.91× | -0.207ms |
| depth=500 | 13.6ms | 451ms | 33.2× | 437ms |
| depth=1000 | 26.7ms | 476ms | 17.8× | 450ms |
| depth=2000 | 54.0ms | 494ms | 9.14× | 440ms |

## mssql

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.647ms | 0.598ms | 0.92× | -0.049ms |
| depth=10 | 0.646ms | 0.853ms | 1.32× | 0.207ms |
| depth=50 | 0.892ms | 2.09ms | 2.34× | 1.20ms |
| depth=100 | 1.14ms | 3.74ms | 3.28× | 2.60ms |
| depth=500 | 2.99ms | 18.8ms | 6.29× | 15.8ms |
| depth=1000 | 5.55ms | 32.6ms | 5.88× | 27.1ms |
| depth=2000 | 17.3ms | 59.3ms | 3.43× | 42.0ms |
| depth=4000 | 32.6ms | 110ms | 3.38× | 77.6ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=150 | 141ms | 442ms | 3.13× | 301ms |

### filtered-feed

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.485ms | 0.481ms | 0.99× | -0.004ms |
| depth=10 | 0.769ms | 0.960ms | 1.25× | 0.191ms |
| depth=50 | 0.822ms | 2.23ms | 2.71× | 1.41ms |
| depth=100 | 1.12ms | 3.86ms | 3.44× | 2.74ms |
| depth=500 | 3.41ms | 20.1ms | 5.89× | 16.7ms |
| depth=1000 | 8.20ms | 33.8ms | 4.13× | 25.6ms |

### author-timeline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.617ms | 0.636ms | 1.03× | 0.018ms |
| depth=5 | 0.540ms | 0.666ms | 1.23× | 0.126ms |
| depth=10 | 0.611ms | 0.852ms | 1.39× | 0.240ms |
| depth=25 | 0.876ms | 1.32ms | 1.51× | 0.446ms |
| walk=40 | 26.3ms | 50.1ms | 1.91× | 23.8ms |
| depth=50 | 0.797ms | 2.19ms | 2.75× | 1.39ms |
| depth=100 | 1.06ms | 4.73ms | 4.48× | 3.67ms |

### scoreboard

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.455ms | 0.461ms | 1.02× | 0.007ms |
| depth=10 | 0.516ms | 0.764ms | 1.48× | 0.248ms |
| depth=50 | 0.879ms | 2.63ms | 2.99× | 1.75ms |
| depth=100 | 0.976ms | 4.05ms | 4.15× | 3.07ms |
| depth=500 | 2.74ms | 21.6ms | 7.90× | 18.9ms |
| depth=1000 | 4.81ms | 35.9ms | 7.46× | 31.1ms |

### ideal-baseline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.434ms | 0.400ms | 0.92× | -0.034ms |
| depth=50 | 0.768ms | 1.94ms | 2.53× | 1.18ms |
| depth=100 | 0.950ms | 3.50ms | 3.69× | 2.55ms |
| depth=500 | 2.97ms | 18.1ms | 6.10× | 15.1ms |
| depth=1000 | 7.99ms | 33.0ms | 4.13× | 25.0ms |
| depth=2000 | 17.0ms | 58.4ms | 3.44× | 41.4ms |

## sqlite

### deep-page

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.053ms | 0.058ms | 1.09× | 0.005ms |
| depth=10 | 0.092ms | 0.056ms | 0.61× | -0.036ms |
| depth=50 | 0.079ms | 0.067ms | 0.85× | -0.012ms |
| depth=100 | 0.078ms | 0.083ms | 1.06× | 0.004ms |
| depth=500 | 0.071ms | 0.234ms | 3.28× | 0.162ms |
| depth=1000 | 0.071ms | 0.416ms | 5.88× | 0.346ms |
| depth=2000 | 0.069ms | 0.754ms | 10.9× | 0.685ms |
| depth=4000 | 0.069ms | 1.40ms | 20.2× | 1.33ms |

### sequential-walk

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| walk=150 | 12.0ms | 12.4ms | 1.03× | 0.369ms |

### filtered-feed

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.052ms | 0.054ms | 1.02× | 0.001ms |
| depth=10 | 0.077ms | 0.056ms | 0.73× | -0.021ms |
| depth=50 | 0.076ms | 0.075ms | 0.99× | -0.001ms |
| depth=100 | 0.076ms | 0.103ms | 1.35× | 0.027ms |
| depth=500 | 0.075ms | 0.336ms | 4.50× | 0.261ms |
| depth=1000 | 0.075ms | 0.605ms | 8.04× | 0.530ms |

### author-timeline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.048ms | 0.049ms | 1.01× | 0.001ms |
| depth=5 | 0.075ms | 0.051ms | 0.67× | -0.024ms |
| depth=10 | 0.074ms | 0.054ms | 0.72× | -0.021ms |
| depth=25 | 0.076ms | 0.062ms | 0.82× | -0.014ms |
| walk=40 | 3.20ms | 2.77ms | 0.87× | -0.431ms |
| depth=50 | 0.074ms | 0.074ms | 0.99× | -0.001ms |
| depth=100 | 0.083ms | 0.097ms | 1.16× | 0.014ms |

### scoreboard

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.044ms | 0.046ms | 1.05× | 0.002ms |
| depth=10 | 0.067ms | 0.049ms | 0.72× | -0.019ms |
| depth=50 | 0.068ms | 0.063ms | 0.93× | -0.005ms |
| depth=100 | 0.069ms | 0.080ms | 1.16× | 0.011ms |
| depth=500 | 0.067ms | 0.224ms | 3.35× | 0.157ms |
| depth=1000 | 0.070ms | 0.404ms | 5.80× | 0.334ms |

### ideal-baseline

| Label | Cursor | Offset | Speedup | Δ ms |
| --- | ---: | ---: | ---: | ---: |
| depth=0 | 0.031ms | 0.030ms | 0.98× | -0.001ms |
| depth=50 | 0.037ms | 0.047ms | 1.26× | 0.010ms |
| depth=100 | 0.040ms | 0.065ms | 1.64× | 0.026ms |
| depth=500 | 0.037ms | 0.202ms | 5.48× | 0.165ms |
| depth=1000 | 0.038ms | 0.378ms | 9.99× | 0.340ms |
| depth=2000 | 0.037ms | 0.701ms | 18.9× | 0.664ms |

## Deep-page growth

- **postgres**: cursor ×0.23, offset ×30.11 (depth=0→depth=4000); deepest speedup 48.9×
- **mysql**: cursor ×1.06, offset ×1952.81 (depth=0→depth=4000); deepest speedup 1551×
- **mssql**: cursor ×50.47, offset ×184.38 (depth=0→depth=4000); deepest speedup 3.38×
- **sqlite**: cursor ×1.31, offset ×24.23 (depth=0→depth=4000); deepest speedup 20.2×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
