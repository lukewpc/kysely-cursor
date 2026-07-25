export type DialectName = 'postgres' | 'mysql' | 'mssql' | 'sqlite'

/**
 * Scenario ids live here (not types.ts) so CLI/config/gate can typecheck from the
 * root package without a built `kysely-cursor` dist.
 */
export type ScenarioId =
  | 'deep-page'
  | 'sequential-walk'
  | 'filtered-feed'
  | 'author-timeline'
  | 'scoreboard'
  | 'ideal-baseline'

export const ALL_DIALECTS: DialectName[] = ['postgres', 'mysql', 'mssql', 'sqlite']

/** Every scenario the suite knows about (order = run order). */
export const ALL_SCENARIOS: ScenarioId[] = [
  'deep-page',
  'sequential-walk',
  'filtered-feed',
  'author-timeline',
  'scoreboard',
  'ideal-baseline',
]

/**
 * Default / CI profile: high-SNR cells only.
 * Matches the CI gate (deep-page + sequential-walk) and keeps PR wall time ~30s
 * where the engine allows (MSSQL container start still dominates that dialect).
 */
export const CI_SCENARIOS: ScenarioId[] = ['deep-page', 'sequential-walk']

export type BenchConfig = {
  dialects: DialectName[]
  /** Which scenarios to run (subset of ALL_SCENARIOS). */
  scenarios: ScenarioId[]
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
  /** Full poster matrix (all scenarios, denser depths). */
  full: boolean
}

const SCENARIO_SET = new Set<string>(ALL_SCENARIOS)

const parseScenarios = (raw: string | undefined, fallback: ScenarioId[]): ScenarioId[] => {
  if (raw === undefined) return [...fallback]
  if (raw.trim().toLowerCase() === 'all') return [...ALL_SCENARIOS]
  const out: ScenarioId[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (!id) continue
    if (!SCENARIO_SET.has(id)) {
      throw new Error(`Unknown scenario "${id}". Choose from: all, ${ALL_SCENARIOS.join(', ')}`)
    }
    if (!out.includes(id as ScenarioId)) out.push(id as ScenarioId)
  }
  if (out.length === 0) {
    throw new Error(`No valid scenarios. Choose from: all, ${ALL_SCENARIOS.join(', ')}`)
  }
  // Preserve canonical run order.
  return ALL_SCENARIOS.filter((s) => out.includes(s))
}

export const parseArgs = (argv: string[]): BenchConfig => {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag)
    if (idx === -1) return undefined
    return argv[idx + 1]
  }

  const has = (flag: string) => argv.includes(flag)
  const quick = has('--quick')
  const full = has('--full')

  if (quick && full) {
    throw new Error('Use either --quick or --full, not both')
  }

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

  // Profiles (flags always win over profile defaults):
  //   default/CI — deep-page + sequential-walk, sparse depths, short walk
  //   --quick    — smaller seed / fewer iters (smoke)
  //   --full     — all scenarios, dense depths (poster / local deep dive)
  const profileScenarios = full ? ALL_SCENARIOS : CI_SCENARIOS
  const rowCount = num(get('--rows'), quick ? 10_000 : 50_000)
  const pageSize = num(get('--page-size'), 25)
  const iterations = num(get('--iterations'), quick ? 3 : full ? 6 : 4)
  const warmup = num(get('--warmup'), quick ? 1 : full ? 2 : 1)
  const walkPages = num(get('--walk-pages'), quick ? 15 : full ? 40 : 25)

  const depthsArg = get('--depths')
  const deepPageDepths = depthsArg
    ? depthsArg
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0)
    : quick
      ? [0, 50, 200]
      : full
        ? [0, 10, 50, 100, 500, 1000]
        : [0, 100, 500]

  // drop depths that would exceed the dataset
  const maxDepth = Math.max(0, Math.floor(rowCount / pageSize) - 1)
  const filteredDepths = deepPageDepths.filter((d) => d <= maxDepth)
  if (filteredDepths.length === 0) filteredDepths.push(0)

  const scenarios = parseScenarios(get('--scenarios'), profileScenarios)

  return {
    dialects,
    scenarios,
    rowCount,
    pageSize,
    deepPageDepths: filteredDepths,
    walkPages: Math.min(walkPages, maxDepth + 1),
    iterations,
    warmup,
    hotAuthorId: 1,
    resultsDir: get('--out') ?? new URL('../results', import.meta.url).pathname,
    quick,
    full,
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
    `scenarios=${cfg.scenarios.join(',')}`,
    `rows=${cfg.rowCount.toLocaleString()}`,
    `pageSize=${cfg.pageSize}`,
    `depths=[${cfg.deepPageDepths.join(',')}]`,
    `walkPages=${cfg.walkPages}`,
    `iterations=${cfg.iterations}`,
    `warmup=${cfg.warmup}`,
  ].join('  ')
