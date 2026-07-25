# kysely-cursor benchmarks

**2026-07-25T17:02:02.131Z** · `dd14529` · 50,000 rows · page 25 · iters 6/2 · walk 40 · depths [0,10,50,100,500,1000] · postgres, mysql, mssql, sqlite

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect  | Label      |  Cursor |  Offset | Speedup |
| -------- | ---------- | ------: | ------: | ------: |
| postgres | depth=1000 | 0.817ms |  2.65ms |   3.25× |
| mysql    | depth=1000 | 0.662ms |  82.9ms |    125× |
| mssql    | depth=1000 |  14.3ms |  51.4ms |   3.59× |
| sqlite   | depth=1000 | 0.176ms | 0.949ms |   5.40× |

## postgres

### deep-page

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.776ms | 0.660ms |   0.85× | -0.116ms |
| depth=10   | 0.711ms | 0.582ms |   0.82× | -0.129ms |
| depth=50   | 0.658ms | 0.682ms |   1.04× |  0.024ms |
| depth=100  | 0.870ms | 0.838ms |   0.96× | -0.032ms |
| depth=500  | 0.687ms |  2.50ms |   3.65× |   1.82ms |
| depth=1000 | 0.817ms |  2.65ms |   3.25× |   1.83ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |     Δ ms |
| ------- | -----: | -----: | ------: | -------: |
| walk=40 | 20.1ms | 16.8ms |   0.84× | -3.279ms |

### filtered-feed

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.415ms | 0.400ms |   0.96× | -0.015ms |
| depth=10   | 0.854ms | 0.540ms |   0.63× | -0.314ms |
| depth=50   | 0.595ms | 0.721ms |   1.21× |  0.126ms |
| depth=100  | 0.749ms | 0.803ms |   1.07× |  0.054ms |
| depth=500  | 0.453ms |  3.19ms |   7.05× |   2.74ms |
| depth=1000 | 0.424ms |  5.34ms |   12.6× |   4.92ms |

### author-timeline

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.560ms | 0.479ms |   0.85× | -0.081ms |
| depth=5  | 0.500ms | 0.503ms |   1.00× |  0.002ms |
| depth=10 | 0.452ms | 0.473ms |   1.05× |  0.021ms |
| depth=25 | 0.526ms | 0.593ms |   1.13× |  0.067ms |
| walk=40  |  17.4ms |  25.4ms |   1.46× |   8.01ms |

### scoreboard

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.330ms | 0.818ms |   2.48× | 0.488ms |
| depth=10   | 0.591ms |  1.28ms |   2.16× | 0.684ms |
| depth=50   | 0.392ms | 0.529ms |   1.35× | 0.138ms |
| depth=100  | 0.429ms | 0.712ms |   1.66× | 0.283ms |
| depth=500  | 0.384ms |  2.34ms |   6.10× |  1.96ms |
| depth=1000 | 0.381ms |  4.35ms |   11.4× |  3.97ms |

### ideal-baseline

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.307ms | 0.300ms |   0.98× | -0.007ms |
| depth=50   | 0.332ms | 0.391ms |   1.18× |  0.059ms |
| depth=100  | 0.339ms | 0.473ms |   1.40× |  0.135ms |
| depth=500  | 0.330ms |  1.26ms |   3.83× |  0.932ms |
| depth=1000 | 0.412ms |  2.70ms |   6.56× |   2.29ms |

## mysql

### deep-page

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.917ms | 0.802ms |   0.87× | -0.115ms |
| depth=10   |  1.90ms |  1.21ms |   0.64× | -0.693ms |
| depth=50   | 0.889ms |  2.04ms |   2.30× |   1.15ms |
| depth=100  | 0.907ms |  56.2ms |   62.0× |   55.3ms |
| depth=500  | 0.642ms |  69.4ms |    108× |   68.8ms |
| depth=1000 | 0.662ms |  82.9ms |    125× |   82.2ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |   Δ ms |
| ------- | -----: | -----: | ------: | -----: |
| walk=40 | 25.5ms | 39.4ms |   1.55× | 13.9ms |

### filtered-feed

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.520ms | 0.537ms |   1.03× | 0.017ms |
| depth=10   | 0.664ms |  1.52ms |   2.28× | 0.852ms |
| depth=50   | 0.659ms |  1.88ms |   2.86× |  1.22ms |
| depth=100  | 0.720ms |  3.41ms |   4.74× |  2.69ms |
| depth=500  | 0.650ms |  14.7ms |   22.7× |  14.1ms |
| depth=1000 | 0.629ms |  33.3ms |   52.9× |  32.6ms |

### author-timeline

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.573ms | 0.524ms |   0.91× | -0.049ms |
| depth=5  | 0.650ms | 0.672ms |   1.03× |  0.022ms |
| depth=10 | 0.664ms | 0.794ms |   1.20× |  0.130ms |
| depth=25 | 0.670ms |  1.20ms |   1.79× |  0.531ms |
| walk=40  |  25.4ms |  42.9ms |   1.69× |   17.5ms |

### scoreboard

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.448ms | 0.450ms |   1.00× | 0.002ms |
| depth=10   | 0.598ms | 0.791ms |   1.32× | 0.194ms |
| depth=50   | 0.573ms |  1.82ms |   3.17× |  1.24ms |
| depth=100  | 0.592ms |  56.4ms |   95.3× |  55.8ms |
| depth=500  | 0.565ms |  72.7ms |    129× |  72.2ms |
| depth=1000 | 0.576ms |  87.4ms |    152× |  86.8ms |

### ideal-baseline

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.407ms | 0.403ms |   0.99× | -0.004ms |
| depth=50   | 0.534ms |  1.71ms |   3.21× |   1.18ms |
| depth=100  | 0.526ms |  56.1ms |    107× |   55.6ms |
| depth=500  | 0.533ms |  71.3ms |    134× |   70.8ms |
| depth=1000 | 0.578ms |  83.1ms |    144× |   82.5ms |

## mssql

### deep-page

| Label      | Cursor | Offset | Speedup |     Δ ms |
| ---------- | -----: | -----: | ------: | -------: |
| depth=0    | 2.00ms | 1.98ms |   0.99× | -0.013ms |
| depth=10   | 2.41ms | 2.66ms |   1.10× |  0.250ms |
| depth=50   | 2.18ms | 4.64ms |   2.13× |   2.46ms |
| depth=100  | 2.57ms | 7.03ms |   2.73× |   4.46ms |
| depth=500  | 8.57ms | 30.8ms |   3.59× |   22.2ms |
| depth=1000 | 14.3ms | 51.4ms |   3.59× |   37.0ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |   Δ ms |
| ------- | -----: | -----: | ------: | -----: |
| walk=40 | 66.8ms |  102ms |   1.52× | 35.0ms |

### filtered-feed

| Label      | Cursor | Offset | Speedup |     Δ ms |
| ---------- | -----: | -----: | ------: | -------: |
| depth=0    | 1.28ms | 1.28ms |   1.00× | -0.001ms |
| depth=10   | 1.92ms | 1.90ms |   0.99× | -0.028ms |
| depth=50   | 2.03ms | 4.56ms |   2.25× |   2.53ms |
| depth=100  | 2.62ms | 8.56ms |   3.27× |   5.95ms |
| depth=500  | 9.21ms | 32.3ms |   3.51× |   23.1ms |
| depth=1000 | 16.0ms | 54.1ms |   3.39× |   38.1ms |

### author-timeline

| Label    | Cursor | Offset | Speedup |    Δ ms |
| -------- | -----: | -----: | ------: | ------: |
| depth=0  | 1.26ms | 1.28ms |   1.02× | 0.023ms |
| depth=5  | 1.36ms | 2.94ms |   2.16× |  1.58ms |
| depth=10 | 1.43ms | 1.89ms |   1.33× | 0.464ms |
| depth=25 | 1.61ms | 2.73ms |   1.70× |  1.13ms |
| walk=40  | 65.5ms |  109ms |   1.67× |  43.8ms |

### scoreboard

| Label      | Cursor | Offset | Speedup |    Δ ms |
| ---------- | -----: | -----: | ------: | ------: |
| depth=0    | 1.34ms | 3.21ms |   2.39× |  1.86ms |
| depth=10   | 1.41ms | 1.83ms |   1.30× | 0.425ms |
| depth=50   | 2.25ms | 4.16ms |   1.85× |  1.92ms |
| depth=100  | 2.22ms | 9.99ms |   4.51× |  7.77ms |
| depth=500  | 5.12ms | 31.1ms |   6.08× |  26.0ms |
| depth=1000 | 11.8ms | 54.1ms |   4.58× |  42.3ms |

### ideal-baseline

| Label      | Cursor | Offset | Speedup |    Δ ms |
| ---------- | -----: | -----: | ------: | ------: |
| depth=0    | 1.21ms | 1.22ms |   1.01× | 0.006ms |
| depth=50   | 1.70ms | 4.15ms |   2.45× |  2.46ms |
| depth=100  | 2.20ms | 8.80ms |   4.00× |  6.60ms |
| depth=500  | 7.77ms | 30.8ms |   3.97× |  23.0ms |
| depth=1000 | 13.4ms | 51.4ms |   3.85× |  38.0ms |

## sqlite

### deep-page

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.342ms | 0.236ms |   0.69× | -0.106ms |
| depth=10   | 0.285ms | 0.182ms |   0.64× | -0.102ms |
| depth=50   | 0.263ms | 0.195ms |   0.74× | -0.068ms |
| depth=100  | 0.331ms | 0.215ms |   0.65× | -0.117ms |
| depth=500  | 0.212ms | 0.451ms |   2.13× |  0.239ms |
| depth=1000 | 0.176ms | 0.949ms |   5.40× |  0.774ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |     Δ ms |
| ------- | -----: | -----: | ------: | -------: |
| walk=40 | 8.89ms | 5.55ms |   0.62× | -3.336ms |

### filtered-feed

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.130ms | 0.423ms |   3.24× |  0.292ms |
| depth=10   | 0.341ms | 0.284ms |   0.83× | -0.057ms |
| depth=50   | 0.270ms | 0.217ms |   0.80× | -0.053ms |
| depth=100  | 0.201ms | 0.213ms |   1.06× |  0.013ms |
| depth=500  | 0.186ms | 0.614ms |   3.31× |  0.428ms |
| depth=1000 | 0.152ms |  1.19ms |   7.82× |   1.03ms |

### author-timeline

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.108ms | 0.384ms |   3.55× |  0.276ms |
| depth=5  | 0.154ms | 0.109ms |   0.71× | -0.045ms |
| depth=10 | 0.154ms | 0.115ms |   0.75× | -0.039ms |
| depth=25 | 0.152ms | 0.128ms |   0.84× | -0.024ms |
| walk=40  |  7.28ms |  5.57ms |   0.76× | -1.714ms |

### scoreboard

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.101ms | 0.103ms |   1.02× |  0.002ms |
| depth=10   | 0.159ms | 0.104ms |   0.65× | -0.056ms |
| depth=50   | 0.156ms | 0.127ms |   0.81× | -0.029ms |
| depth=100  | 0.165ms | 0.158ms |   0.96× | -0.006ms |
| depth=500  | 0.154ms | 0.384ms |   2.50× |  0.230ms |
| depth=1000 | 0.146ms | 0.686ms |   4.69× |  0.540ms |

### ideal-baseline

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.077ms | 0.069ms |   0.89× | -0.009ms |
| depth=50   | 0.095ms | 0.088ms |   0.92× | -0.007ms |
| depth=100  | 0.086ms | 0.113ms |   1.32× |  0.027ms |
| depth=500  | 0.078ms | 0.339ms |   4.35× |  0.261ms |
| depth=1000 | 0.077ms | 0.626ms |   8.12× |  0.549ms |

## Deep-page growth

- **postgres**: cursor ×1.05, offset ×4.02 (depth=0→depth=1000); deepest speedup 3.25×
- **mysql**: cursor ×0.72, offset ×103.26 (depth=0→depth=1000); deepest speedup 125×
- **mssql**: cursor ×7.17, offset ×25.90 (depth=0→depth=1000); deepest speedup 3.59×
- **sqlite**: cursor ×0.51, offset ×4.02 (depth=0→depth=1000); deepest speedup 5.40×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
