# kysely-cursor benchmarks

**2026-07-25T16:19:20.304Z** · 50,000 rows · page 25 · iters 6/2 · walk 40 · depths [0,10,50,100,500,1000] · postgres, mysql, mssql, sqlite

Cursor = keyset via library API (`nullable: false` on non-null keys). Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).

## Headline — deepest deep-page

| Dialect  | Label      |  Cursor |  Offset | Speedup |
| -------- | ---------- | ------: | ------: | ------: |
| postgres | depth=1000 | 0.252ms |  1.46ms |   5.77× |
| mysql    | depth=1000 | 0.294ms |   101ms |    342× |
| mssql    | depth=1000 |  8.63ms |  35.5ms |   4.12× |
| sqlite   | depth=1000 | 0.083ms | 0.424ms |   5.10× |

## postgres

### Deep page (single request at depth N)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.478ms | 0.402ms |   0.84× | -0.076ms |
| depth=10   | 0.408ms | 0.331ms |   0.81× | -0.078ms |
| depth=50   | 0.409ms | 0.516ms |   1.26× |  0.107ms |
| depth=100  | 0.332ms | 0.455ms |   1.37× |  0.122ms |
| depth=500  | 0.324ms | 0.951ms |   2.94× |  0.627ms |
| depth=1000 | 0.252ms |  1.46ms |   5.77× |   1.20ms |

### Sequential walk (N consecutive pages)

| Label   | Cursor | Offset | Speedup |     Δ ms |
| ------- | -----: | -----: | ------: | -------: |
| walk=40 | 11.8ms | 10.4ms |   0.88× | -1.390ms |

### Filtered feed (status = published)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.248ms | 0.203ms |   0.82× | -0.045ms |
| depth=10   | 0.280ms | 0.259ms |   0.93× | -0.021ms |
| depth=50   | 0.328ms | 0.565ms |   1.72× |  0.237ms |
| depth=100  | 0.246ms | 0.459ms |   1.87× |  0.214ms |
| depth=500  | 0.249ms |  2.29ms |   9.18× |   2.04ms |
| depth=1000 | 0.224ms |  6.85ms |   30.6× |   6.63ms |

### Author timeline (author_id = 1)

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.284ms | 0.252ms |   0.89× | -0.032ms |
| depth=5  | 0.303ms | 0.287ms |   0.95× | -0.016ms |
| depth=10 | 0.239ms | 0.261ms |   1.09× |  0.022ms |
| depth=25 | 0.245ms | 0.336ms |   1.37× |  0.091ms |
| walk=40  |  10.1ms |  15.2ms |   1.50× |   5.09ms |

### Scoreboard (ORDER BY score DESC, id DESC)

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.230ms | 0.267ms |   1.16× | 0.037ms |
| depth=10   | 0.251ms | 0.491ms |   1.96× | 0.241ms |
| depth=50   | 0.264ms | 0.324ms |   1.23× | 0.060ms |
| depth=100  | 0.209ms | 0.449ms |   2.14× | 0.239ms |
| depth=500  | 0.204ms |  1.78ms |   8.75× |  1.58ms |
| depth=1000 | 0.493ms |  5.50ms |   11.2× |  5.01ms |

### Ideal keyset baseline (raw SQL, row_compare, no library)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.187ms | 0.187ms |   1.00× | -0.000ms |
| depth=50   | 0.220ms | 0.227ms |   1.03× |  0.007ms |
| depth=100  | 0.197ms | 0.261ms |   1.33× |  0.065ms |
| depth=500  | 0.175ms | 0.774ms |   4.42× |  0.599ms |
| depth=1000 | 0.210ms |  1.41ms |   6.73× |   1.20ms |

## mysql

### Deep page (single request at depth N)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.684ms | 0.280ms |   0.41× | -0.404ms |
| depth=10   | 0.366ms | 0.451ms |   1.23× |  0.085ms |
| depth=50   | 0.382ms |  1.49ms |   3.91× |   1.11ms |
| depth=100  | 0.358ms |  68.2ms |    191× |   67.9ms |
| depth=500  | 0.296ms |  83.1ms |    281× |   82.8ms |
| depth=1000 | 0.294ms |   101ms |    342× |    100ms |

### Sequential walk (N consecutive pages)

| Label   | Cursor | Offset | Speedup |   Δ ms |
| ------- | -----: | -----: | ------: | -----: |
| walk=40 | 12.4ms | 23.9ms |   1.93× | 11.5ms |

### Filtered feed (status = published)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.275ms | 0.267ms |   0.97× | -0.008ms |
| depth=10   | 0.337ms | 0.474ms |   1.41× |  0.137ms |
| depth=50   | 0.346ms |  1.48ms |   4.28× |   1.14ms |
| depth=100  | 0.336ms |  2.72ms |   8.10× |   2.39ms |
| depth=500  | 0.319ms |  14.5ms |   45.6× |   14.2ms |
| depth=1000 | 0.298ms |  29.2ms |   98.0× |   28.9ms |

### Author timeline (author_id = 1)

| Label    |  Cursor |  Offset | Speedup |    Δ ms |
| -------- | ------: | ------: | ------: | ------: |
| depth=0  | 0.366ms | 0.371ms |   1.01× | 0.005ms |
| depth=5  | 0.296ms | 0.334ms |   1.13× | 0.038ms |
| depth=10 | 0.330ms | 0.581ms |   1.76× | 0.251ms |
| depth=25 | 0.308ms | 0.800ms |   2.60× | 0.492ms |
| walk=40  |  12.9ms |  27.0ms |   2.10× |  14.1ms |

### Scoreboard (ORDER BY score DESC, id DESC)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.263ms | 0.198ms |   0.75× | -0.065ms |
| depth=10   | 0.251ms | 0.427ms |   1.70× |  0.175ms |
| depth=50   | 0.399ms |  1.23ms |   3.08× |  0.829ms |
| depth=100  | 0.257ms |  68.2ms |    266× |   68.0ms |
| depth=500  | 0.866ms |  83.2ms |   96.1× |   82.4ms |
| depth=1000 | 0.252ms |  96.0ms |    382× |   95.8ms |

### Ideal keyset baseline (raw SQL, null_safe_or, no library)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.347ms | 0.215ms |   0.62× | -0.131ms |
| depth=50   | 0.268ms |  1.37ms |   5.13× |   1.11ms |
| depth=100  | 0.284ms |  66.8ms |    235× |   66.5ms |
| depth=500  | 0.265ms |  83.2ms |    314× |   82.9ms |
| depth=1000 | 0.382ms |  98.1ms |    257× |   97.8ms |

## mssql

### Deep page (single request at depth N)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.872ms | 0.739ms |   0.85× | -0.133ms |
| depth=10   | 0.925ms |  1.12ms |   1.21× |  0.191ms |
| depth=50   |  1.06ms |  2.86ms |   2.70× |   1.80ms |
| depth=100  |  1.15ms |  4.41ms |   3.83× |   3.26ms |
| depth=500  |  3.06ms |  20.0ms |   6.55× |   17.0ms |
| depth=1000 |  8.63ms |  35.5ms |   4.12× |   26.9ms |

### Sequential walk (N consecutive pages)

| Label   | Cursor | Offset | Speedup |   Δ ms |
| ------- | -----: | -----: | ------: | -----: |
| walk=40 | 27.5ms | 46.7ms |   1.70× | 19.2ms |

### Filtered feed (status = published)

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.500ms | 0.560ms |   1.12× | 0.060ms |
| depth=10   | 0.588ms | 0.971ms |   1.65× | 0.383ms |
| depth=50   | 0.791ms |  2.19ms |   2.77× |  1.40ms |
| depth=100  |  1.12ms |  4.37ms |   3.89× |  3.25ms |
| depth=500  |  4.18ms |  21.4ms |   5.13× |  17.2ms |
| depth=1000 |  9.65ms |  34.9ms |   3.61× |  25.2ms |

### Author timeline (author_id = 1)

| Label    |  Cursor |  Offset | Speedup |    Δ ms |
| -------- | ------: | ------: | ------: | ------: |
| depth=0  | 0.501ms | 0.550ms |   1.10× | 0.050ms |
| depth=5  | 0.566ms | 0.716ms |   1.27× | 0.150ms |
| depth=10 | 0.722ms | 0.853ms |   1.18× | 0.131ms |
| depth=25 | 0.879ms |  1.40ms |   1.60× | 0.525ms |
| walk=40  |  28.5ms |  49.2ms |   1.72× |  20.7ms |

### Scoreboard (ORDER BY score DESC, id DESC)

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.537ms | 0.793ms |   1.48× | 0.256ms |
| depth=10   | 0.569ms | 0.878ms |   1.54× | 0.310ms |
| depth=50   | 0.910ms |  2.67ms |   2.93× |  1.76ms |
| depth=100  |  1.02ms |  4.51ms |   4.40× |  3.49ms |
| depth=500  |  3.21ms |  20.1ms |   6.26× |  16.9ms |
| depth=1000 |  4.87ms |  34.4ms |   7.05× |  29.5ms |

### Ideal keyset baseline (raw SQL, plain_or, no library)

| Label      |  Cursor |  Offset | Speedup |    Δ ms |
| ---------- | ------: | ------: | ------: | ------: |
| depth=0    | 0.433ms | 0.545ms |   1.26× | 0.111ms |
| depth=50   | 0.805ms |  2.58ms |   3.21× |  1.78ms |
| depth=100  |  1.02ms |  4.07ms |   4.00× |  3.05ms |
| depth=500  |  3.08ms |  19.5ms |   6.34× |  16.4ms |
| depth=1000 |  8.74ms |  33.2ms |   3.80× |  24.5ms |

## sqlite

### Deep page (single request at depth N)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.064ms | 0.059ms |   0.93× | -0.004ms |
| depth=10   | 0.095ms | 0.061ms |   0.64× | -0.034ms |
| depth=50   | 0.092ms | 0.079ms |   0.86× | -0.013ms |
| depth=100  | 0.087ms | 0.097ms |   1.11× |  0.009ms |
| depth=500  | 0.085ms | 0.294ms |   3.46× |  0.209ms |
| depth=1000 | 0.083ms | 0.424ms |   5.10× |  0.341ms |

### Sequential walk (N consecutive pages)

| Label   | Cursor | Offset | Speedup |     Δ ms |
| ------- | -----: | -----: | ------: | -------: |
| walk=40 | 3.78ms | 2.48ms |   0.66× | -1.301ms |

### Filtered feed (status = published)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.093ms | 0.058ms |   0.63× | -0.034ms |
| depth=10   | 0.091ms | 0.065ms |   0.72× | -0.025ms |
| depth=50   | 0.089ms | 0.085ms |   0.96× | -0.004ms |
| depth=100  | 0.089ms | 0.113ms |   1.27× |  0.024ms |
| depth=500  | 0.084ms | 0.372ms |   4.42× |  0.288ms |
| depth=1000 | 0.081ms |  1.21ms |   15.0× |   1.13ms |

### Author timeline (author_id = 1)

| Label    |  Cursor |  Offset | Speedup |     Δ ms |
| -------- | ------: | ------: | ------: | -------: |
| depth=0  | 0.054ms | 0.055ms |   1.02× |  0.001ms |
| depth=5  | 0.083ms | 0.055ms |   0.66× | -0.028ms |
| depth=10 | 0.085ms | 0.058ms |   0.68× | -0.027ms |
| depth=25 | 0.080ms | 0.064ms |   0.80× | -0.016ms |
| walk=40  |  4.16ms |  2.94ms |   0.71× | -1.219ms |

### Scoreboard (ORDER BY score DESC, id DESC)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.050ms | 0.049ms |   0.97× | -0.001ms |
| depth=10   | 0.077ms | 0.053ms |   0.68× | -0.025ms |
| depth=50   | 0.074ms | 0.069ms |   0.93× | -0.005ms |
| depth=100  | 0.075ms | 0.086ms |   1.14× |  0.011ms |
| depth=500  | 0.072ms | 0.291ms |   4.02× |  0.219ms |
| depth=1000 | 0.075ms | 0.452ms |   6.00× |  0.376ms |

### Ideal keyset baseline (raw SQL, row_compare, no library)

| Label      |  Cursor |  Offset | Speedup |     Δ ms |
| ---------- | ------: | ------: | ------: | -------: |
| depth=0    | 0.032ms | 0.030ms |   0.95× | -0.002ms |
| depth=50   | 0.041ms | 0.049ms |   1.21× |  0.008ms |
| depth=100  | 0.040ms | 0.067ms |   1.67× |  0.027ms |
| depth=500  | 0.039ms | 0.206ms |   5.26× |  0.167ms |
| depth=1000 | 0.039ms | 0.456ms |   11.7× |  0.417ms |

## Deep-page growth

- **postgres**: cursor ×0.53, offset ×3.62 (depth=0→depth=1000); deepest speedup 5.77×
- **mysql**: cursor ×0.43, offset ×359.51 (depth=0→depth=1000); deepest speedup 342×
- **mssql**: cursor ×9.89, offset ×48.04 (depth=0→depth=1000); deepest speedup 4.12×
- **sqlite**: cursor ×1.31, offset ×7.16 (depth=0→depth=1000); deepest speedup 5.10×

_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._
