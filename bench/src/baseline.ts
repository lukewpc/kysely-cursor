import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { BaselineCell, BaselineReport, BenchReport, ComparisonRow } from './types.js'

export const DEFAULT_BASELINE_DIR = new URL('../baseline', import.meta.url).pathname
export const DEFAULT_BASELINE_JSON = join(DEFAULT_BASELINE_DIR, 'results.json')
export const DEFAULT_BASELINE_MD = join(DEFAULT_BASELINE_DIR, 'summary.md')

export const cellKey = (c: Pick<BaselineCell, 'dialect' | 'scenario' | 'label'>): string =>
  `${c.dialect}|${c.scenario}|${c.label}`

export const comparisonToCell = (c: ComparisonRow): BaselineCell => ({
  dialect: c.dialect,
  scenario: c.scenario,
  label: c.label,
  cursorMean: c.cursor.mean,
  cursorP50: c.cursor.p50,
  cursorP95: c.cursor.p95,
  offsetMean: c.offset.mean,
  offsetP50: c.offset.p50,
  offsetP95: c.offset.p95,
  speedup: c.speedup,
  deltaMs: c.deltaMs,
})

/** Strip samples / plans into a git-friendly baseline document. */
export const toBaseline = (report: BenchReport, opts?: { gitSha?: string }): BaselineReport => {
  const cells: BaselineCell[] = []
  for (const d of report.dialects) {
    for (const s of d.scenarios) {
      for (const c of s.comparisons) {
        cells.push(comparisonToCell(c))
      }
    }
  }
  return {
    version: 1,
    generatedAt: report.generatedAt,
    gitSha: opts?.gitSha,
    config: report.config,
    cells,
  }
}

/** Accept either a BaselineReport or a full BenchReport (local dumps). */
export const normalizeBaseline = (raw: unknown): BaselineReport => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid baseline: not an object')
  }
  const obj = raw as Record<string, unknown>

  if (obj.version === 1 && Array.isArray(obj.cells)) {
    return raw as BaselineReport
  }

  // Full BenchReport from a local run
  if (Array.isArray(obj.dialects) && obj.config && obj.generatedAt) {
    return toBaseline(raw as BenchReport)
  }

  throw new Error('Unrecognized baseline shape (expected BaselineReport v1 or full BenchReport)')
}

export const loadBaseline = async (path: string): Promise<BaselineReport> => {
  const text = await readFile(path, 'utf8')
  return normalizeBaseline(JSON.parse(text) as unknown)
}

export const writeBaseline = async (
  baseline: BaselineReport,
  dir: string = DEFAULT_BASELINE_DIR,
  summaryMarkdown?: string,
): Promise<{ jsonPath: string; mdPath: string }> => {
  await mkdir(dir, { recursive: true })
  const jsonPath = join(dir, 'results.json')
  const mdPath = join(dir, 'summary.md')
  await writeFile(jsonPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  if (summaryMarkdown !== undefined) {
    await writeFile(mdPath, summaryMarkdown, 'utf8')
  }
  return { jsonPath, mdPath }
}

export const writeBaselineFiles = async (
  report: BenchReport,
  opts?: { dir?: string; gitSha?: string; summaryMarkdown?: string },
): Promise<{ jsonPath: string; mdPath: string; baseline: BaselineReport }> => {
  const baseline = toBaseline(report, { gitSha: opts?.gitSha })
  const paths = await writeBaseline(baseline, opts?.dir ?? DEFAULT_BASELINE_DIR, opts?.summaryMarkdown)
  return { ...paths, baseline }
}

const DIALECT_ORDER = ['postgres', 'mysql', 'mssql', 'sqlite'] as const
type DialectName = (typeof DIALECT_ORDER)[number]

/**
 * Merge partial baseline reports (e.g. one file per CI matrix dialect) into a
 * single report. Later reports overwrite cells with the same dialect|scenario|label.
 * Config is taken from the first report; `config.dialects` is the union in
 * canonical order.
 */
export const mergeBaselines = (reports: BaselineReport[]): BaselineReport => {
  if (reports.length === 0) {
    throw new Error('mergeBaselines: need at least one report')
  }
  if (reports.length === 1) return reports[0]!

  const cellMap = new Map<string, BaselineCell>()
  const dialectSet = new Set<DialectName>()
  let generatedAt = reports[0]!.generatedAt
  let gitSha = reports[0]!.gitSha
  const baseConfig = { ...reports[0]!.config }

  for (const r of reports) {
    if (r.generatedAt > generatedAt) generatedAt = r.generatedAt
    if (r.gitSha) gitSha = r.gitSha
    for (const c of r.cells) {
      cellMap.set(cellKey(c), c)
      dialectSet.add(c.dialect)
    }
  }

  const dialects: DialectName[] = DIALECT_ORDER.filter((d) => dialectSet.has(d))

  return {
    version: 1,
    generatedAt,
    gitSha,
    config: { ...baseConfig, dialects },
    cells: [...cellMap.values()],
  }
}
