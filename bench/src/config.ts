export type DialectName = 'postgres' | 'mysql' | 'mssql' | 'sqlite'

export type BenchConfig = {
  dialects: DialectName[]
  /** Total rows to seed into the posts table. */
  rowCount: number
  /** Rows per page for every scenario. */
  pageSize: number
  /** Page depths (0-based) measured by the deep-page scenario. */
  deepPageDepths: number[]
  /** How many pages to walk in the sequential-walk scenario. */
  walkPages: number
  /** Timed iterations per measurement (after warmup). */
  iterations: number
  /** Untimed warmup iterations. */
  warmup: number
  /** Author used for the author-timeline scenario (seeded densely). */
  hotAuthorId: number
  /** Write report artifacts under this directory. */
  resultsDir: string
  /** Skip container dialects that require Docker. */
  quick: boolean
}

const ALL_DIALECTS: DialectName[] = ['postgres', 'mysql', 'mssql', 'sqlite']

export const parseArgs = (argv: string[]): BenchConfig => {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag)
    if (idx === -1) return undefined
    return argv[idx + 1]
  }

  const has = (flag: string) => argv.includes(flag)
  const quick = has('--quick')

  const dialectArg = get('--dialect')
  const dialects: DialectName[] = dialectArg
    ? dialectArg
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter((d): d is DialectName => (ALL_DIALECTS as string[]).includes(d))
    : [...ALL_DIALECTS]

  if (dialects.length === 0) {
    throw new Error(`No valid dialects. Choose from: ${ALL_DIALECTS.join(', ')}`)
  }

  // Full suite is sized for CI-friendly wall time on MySQL/MSSQL containers while
  // still showing cursor vs offset divergence at depth. Use flags for heavier local runs.
  const rowCount = num(get('--rows'), quick ? 10_000 : 50_000)
  const pageSize = num(get('--page-size'), 25)
  const iterations = num(get('--iterations'), quick ? 3 : 6)
  const warmup = num(get('--warmup'), quick ? 1 : 2)
  const walkPages = num(get('--walk-pages'), quick ? 15 : 40)

  const depthsArg = get('--depths')
  const deepPageDepths = depthsArg
    ? depthsArg
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0)
    : quick
      ? [0, 10, 50, 200]
      : [0, 10, 50, 100, 500, 1000]

  // drop depths that would exceed the dataset
  const maxDepth = Math.max(0, Math.floor(rowCount / pageSize) - 1)
  const filteredDepths = deepPageDepths.filter((d) => d <= maxDepth)
  if (filteredDepths.length === 0) filteredDepths.push(0)

  return {
    dialects,
    rowCount,
    pageSize,
    deepPageDepths: filteredDepths,
    walkPages: Math.min(walkPages, maxDepth + 1),
    iterations,
    warmup,
    hotAuthorId: 1,
    resultsDir: get('--out') ?? new URL('../results', import.meta.url).pathname,
    quick,
  }
}

const num = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

export const describeConfig = (cfg: BenchConfig): string =>
  [
    `dialects=${cfg.dialects.join(',')}`,
    `rows=${cfg.rowCount.toLocaleString()}`,
    `pageSize=${cfg.pageSize}`,
    `depths=[${cfg.deepPageDepths.join(',')}]`,
    `walkPages=${cfg.walkPages}`,
    `iterations=${cfg.iterations}`,
    `warmup=${cfg.warmup}`,
  ].join('  ')
