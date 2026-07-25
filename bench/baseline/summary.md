# kysely-cursor benchmarks

**2026-07-25T16:40:14.758Z** · `dabd5d9` · 50,000 rows · page 25 · iters 6/2 · walk 40 · depths [0,10,50,100,500,1000] · postgres, mysql, mssql, sqlite

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect  | Label      |  Cursor |  Offset | Speedup |
| -------- | ---------- | ------: | ------: | ------: |
| postgres | depth=1000 |  1.04ms |  2.86ms |   2.74× |
| mysql    | depth=1000 | 0.629ms |  81.1ms |    129× |
| mssql    | depth=1000 |  12.9ms |  46.2ms |   3.58× |
| sqlite   | depth=1000 | 0.198ms | 0.753ms |   3.81× |

## postgres

### deep-page

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.990ms |  1.00ms |   1.01× |  0.012ms |
| depth=10   | 0.923ms | 0.786ms |   0.85× | -0.137ms |
| depth=50   | 0.832ms | 0.979ms |   1.18× |  0.146ms |
| depth=100  | 0.975ms |  1.19ms |   1.22× |  0.215ms |
| depth=500  | 0.745ms |  1.74ms |   2.34× |  0.995ms |
| depth=1000 |  1.04ms |  2.86ms |   2.74× |   1.82ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |     Δ ms |
| ------- | -----: | -----: | ------: | -------: |
| walk=40 | 28.8ms | 25.2ms |   0.87× | -3.619ms |

### filtered-feed

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    |  1.17ms | 0.637ms |   0.54× | -0.532ms |
| depth=10   |  1.08ms | 0.877ms |   0.81× | -0.203ms |
| depth=50   | 0.712ms |  1.26ms |   1.77× |  0.545ms |
| depth=100  | 0.652ms |  1.06ms |   1.63× |  0.411ms |
| depth=500  | 0.623ms |  4.96ms |   7.96× |   4.34ms |
| depth=1000 | 0.582ms |  10.5ms |   18.0× |   9.92ms |

### author-timeline

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.505ms | 0.501ms |   0.99× | -0.004ms |
| depth=5  | 0.591ms | 0.547ms |   0.92× | -0.044ms |
| depth=10 | 0.587ms | 0.567ms |   0.97× | -0.020ms |
| depth=25 | 0.563ms | 0.729ms |   1.30× |  0.167ms |
| walk=40  |  25.7ms |  32.3ms |   1.26× |   6.66ms |

### scoreboard

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.492ms | 0.862ms |   1.75× |  0.370ms |
| depth=10   | 0.584ms | 0.545ms |   0.93× | -0.039ms |
| depth=50   | 0.613ms | 0.873ms |   1.42× |  0.260ms |
| depth=100  | 0.545ms | 0.932ms |   1.71× |  0.387ms |
| depth=500  | 0.545ms |  2.77ms |   5.07× |   2.22ms |
| depth=1000 | 0.664ms |  5.23ms |   7.87× |   4.56ms |

### ideal-baseline

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.442ms | 0.745ms |   1.69× | 0.303ms |
| depth=50   | 0.486ms | 0.576ms |   1.19× | 0.090ms |
| depth=100  | 0.472ms | 0.635ms |   1.34× | 0.162ms |
| depth=500  | 0.492ms |  1.56ms |   3.17× |  1.06ms |
| depth=1000 | 0.467ms |  2.69ms |   5.77× |  2.23ms |

## mysql

### deep-page

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.932ms | 0.780ms |   0.84× | -0.152ms |
| depth=10   | 0.997ms |  1.03ms |   1.03× |  0.028ms |
| depth=50   | 0.841ms |  1.92ms |   2.28× |   1.08ms |
| depth=100  | 0.959ms |  54.3ms |   56.6× |   53.4ms |
| depth=500  | 0.707ms |  68.5ms |   96.9× |   67.8ms |
| depth=1000 | 0.629ms |  81.1ms |    129× |   80.5ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |   Δ ms |
| ------- | -----: | -----: | ------: | -----: |
| walk=40 | 25.2ms | 39.4ms |   1.56× | 14.2ms |

### filtered-feed

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.532ms | 0.557ms |   1.05× | 0.024ms |
| depth=10   | 0.659ms | 0.826ms |   1.25× | 0.167ms |
| depth=50   | 0.667ms |  1.90ms |   2.85× |  1.23ms |
| depth=100  | 0.662ms |  3.20ms |   4.84× |  2.54ms |
| depth=500  | 0.651ms |  14.5ms |   22.3× |  13.9ms |
| depth=1000 | 0.607ms |  31.0ms |   51.0× |  30.4ms |

### author-timeline

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.497ms | 0.483ms |   0.97× | -0.013ms |
| depth=5  | 0.599ms |  1.37ms |   2.29× |  0.775ms |
| depth=10 | 0.602ms | 0.768ms |   1.28× |  0.166ms |
| depth=25 | 0.643ms |  1.21ms |   1.87× |  0.562ms |
| walk=40  |  24.1ms |  41.5ms |   1.72× |   17.4ms |

### scoreboard

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.465ms | 0.458ms |   0.99× | -0.006ms |
| depth=10   | 0.578ms | 0.746ms |   1.29× |  0.169ms |
| depth=50   | 0.592ms |  1.89ms |   3.19× |   1.29ms |
| depth=100  | 0.570ms |  55.2ms |   96.7× |   54.6ms |
| depth=500  | 0.585ms |  70.6ms |    121× |   70.0ms |
| depth=1000 | 0.550ms |  84.3ms |    153× |   83.7ms |

### ideal-baseline

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.399ms | 0.393ms |   0.98× | -0.006ms |
| depth=50   | 0.510ms |  1.66ms |   3.25× |   1.15ms |
| depth=100  | 0.484ms |  53.9ms |    111× |   53.4ms |
| depth=500  | 0.525ms |  68.0ms |    129× |   67.5ms |
| depth=1000 | 0.517ms |  80.9ms |    157× |   80.3ms |

## mssql

### deep-page

| Label      | Cursor | Offset | Speedup |     Δ ms |
| ---------- | -----: | -----: | ------: | -------: |
| depth=0    | 2.22ms | 2.16ms |   0.97× | -0.058ms |
| depth=10   | 2.40ms | 2.50ms |   1.04× |  0.094ms |
| depth=50   | 2.39ms | 4.83ms |   2.02× |   2.44ms |
| depth=100  | 2.77ms | 7.18ms |   2.59× |   4.41ms |
| depth=500  | 8.25ms | 28.3ms |   3.44× |   20.1ms |
| depth=1000 | 12.9ms | 46.2ms |   3.58× |   33.3ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |   Δ ms |
| ------- | -----: | -----: | ------: | -----: |
| walk=40 | 73.6ms |  101ms |   1.38× | 27.6ms |

### filtered-feed

| Label      | Cursor | Offset | Speedup |    Δ ms |
| ---------- | -----: | -----: | ------: | ------: |
| depth=0    | 1.41ms | 1.42ms |   1.01× | 0.014ms |
| depth=10   | 1.62ms | 2.30ms |   1.42× | 0.675ms |
| depth=50   | 2.09ms | 4.51ms |   2.16× |  2.42ms |
| depth=100  | 2.66ms | 7.63ms |   2.87× |  4.97ms |
| depth=500  | 7.23ms | 28.2ms |   3.90× |  20.9ms |
| depth=1000 | 14.0ms | 49.3ms |   3.53× |  35.3ms |

### author-timeline

| Label    | Cursor | Offset | Speedup |     Δ ms |
| -------- | -----: | -----: | ------: | -------: |
| depth=0  | 1.49ms | 1.49ms |   1.00× | -0.005ms |
| depth=5  | 1.53ms | 1.78ms |   1.17× |  0.255ms |
| depth=10 | 1.82ms | 2.00ms |   1.10× |  0.180ms |
| depth=25 | 1.99ms | 3.07ms |   1.54× |   1.08ms |
| walk=40  | 71.8ms |  110ms |   1.53× |   37.7ms |

### scoreboard

| Label      | Cursor | Offset | Speedup |    Δ ms |
| ---------- | -----: | -----: | ------: | ------: |
| depth=0    | 1.46ms | 1.48ms |   1.02× | 0.023ms |
| depth=10   | 1.65ms | 2.00ms |   1.21× | 0.347ms |
| depth=50   | 1.86ms | 4.92ms |   2.64× |  3.06ms |
| depth=100  | 2.36ms | 7.76ms |   3.29× |  5.40ms |
| depth=500  | 5.65ms | 29.9ms |   5.29× |  24.2ms |
| depth=1000 | 9.41ms | 51.3ms |   5.45× |  41.9ms |

### ideal-baseline

| Label      | Cursor | Offset | Speedup |    Δ ms |
| ---------- | -----: | -----: | ------: | ------: |
| depth=0    | 1.32ms | 1.33ms |   1.01× | 0.007ms |
| depth=50   | 1.88ms | 4.60ms |   2.44× |  2.71ms |
| depth=100  | 2.36ms | 7.01ms |   2.96× |  4.64ms |
| depth=500  | 6.31ms | 27.1ms |   4.30× |  20.8ms |
| depth=1000 | 12.0ms | 47.1ms |   3.92× |  35.1ms |

## sqlite

### deep-page

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.363ms | 0.247ms |   0.68× | -0.116ms |
| depth=10   | 0.307ms | 0.214ms |   0.70× | -0.092ms |
| depth=50   | 0.291ms | 0.235ms |   0.81× | -0.055ms |
| depth=100  | 0.291ms | 0.252ms |   0.86× | -0.040ms |
| depth=500  | 0.233ms | 0.472ms |   2.03× |  0.239ms |
| depth=1000 | 0.198ms | 0.753ms |   3.81× |  0.555ms |

### sequential-walk

| Label   | Cursor | Offset | Speedup |     Δ ms |
| ------- | -----: | -----: | ------: | -------: |
| walk=40 | 8.55ms | 5.59ms |   0.65× | -2.957ms |

### filtered-feed

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.152ms | 0.149ms |   0.98× | -0.002ms |
| depth=10   | 0.335ms | 0.284ms |   0.85× | -0.052ms |
| depth=50   | 0.211ms | 0.199ms |   0.94× | -0.013ms |
| depth=100  | 0.209ms | 0.244ms |   1.17× |  0.035ms |
| depth=500  | 0.203ms | 0.639ms |   3.15× |  0.436ms |
| depth=1000 | 0.179ms |  1.12ms |   6.27× |  0.944ms |

### author-timeline

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.131ms | 0.129ms |   0.99× | -0.001ms |
| depth=5  | 0.177ms | 0.129ms |   0.73× | -0.048ms |
| depth=10 | 0.357ms | 0.156ms |   0.44× | -0.202ms |
| depth=25 | 0.180ms | 0.146ms |   0.81× | -0.035ms |
| walk=40  |  7.25ms |  7.05ms |   0.97× | -0.194ms |

### scoreboard

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.134ms | 0.127ms |   0.95× | -0.006ms |
| depth=10   | 0.234ms | 0.146ms |   0.62× | -0.088ms |
| depth=50   | 0.197ms | 0.211ms |   1.07× |  0.014ms |
| depth=100  | 0.312ms | 0.313ms |   1.00× |  0.001ms |
| depth=500  | 0.179ms | 0.543ms |   3.04× |  0.364ms |
| depth=1000 | 0.180ms | 0.829ms |   4.61× |  0.649ms |

### ideal-baseline

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.094ms | 0.072ms |   0.76× | -0.023ms |
| depth=50   | 0.109ms | 0.104ms |   0.96× | -0.004ms |
| depth=100  | 0.113ms | 0.139ms |   1.23× |  0.026ms |
| depth=500  | 0.101ms | 0.402ms |   3.99× |  0.301ms |
| depth=1000 | 0.095ms | 0.684ms |   7.24× |  0.590ms |

## Deep-page growth

- **postgres**: cursor ×1.05, offset ×2.86 (depth=0→depth=1000); deepest speedup 2.74×
- **mysql**: cursor ×0.67, offset ×104.08 (depth=0→depth=1000); deepest speedup 129×
- **mssql**: cursor ×5.82, offset ×21.40 (depth=0→depth=1000); deepest speedup 3.58×
- **sqlite**: cursor ×0.55, offset ×3.05 (depth=0→depth=1000); deepest speedup 3.81×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
