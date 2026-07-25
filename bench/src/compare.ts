import type { BaselineCell, BaselineReport, CellDelta, CompareResult } from './types.js'
import { cellKey } from './baseline.js'
import { formatMs, formatSpeedup } from './metrics.js'

export const DEFAULT_REGRESSION_THRESHOLD = 1.5

/**
 * Shallow depths and sub-ms cells are dominated by runner noise on GHA.
 * Only enforce fail-on-regression for library pages at this depth and deeper.
 */
export const MIN_GATE_DEPTH = 100

/** Raw SQL ceiling — informative, not a library regression signal. */
const NON_GATING_SCENARIOS = new Set(['ideal-baseline'])

const safeRatio = (current: number, baseline: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) {
    return Number.NaN
  }
  return current / baseline
}

const statusFor = (cursorRatio: number, threshold: number): CellDelta['status'] => {
  if (!Number.isFinite(cursorRatio)) return 'stable'
  if (cursorRatio >= threshold) return 'regression'
  if (cursorRatio <= 1 / threshold) return 'improvement'
  return 'stable'
}

/**
 * Whether a cell regression should fail CI (`--fail-on-regression`).
 * Still listed in the report when true or false; only gating ones set exit 1.
 */
export const isGatingRegression = (d: CellDelta): boolean => {
  if (d.status !== 'regression') return false
  if (NON_GATING_SCENARIOS.has(d.scenario)) return false

  const depthMatch = /^depth=(\d+)$/.exec(d.label)
  if (depthMatch) {
    return Number(depthMatch[1]) >= MIN_GATE_DEPTH
  }

  // sequential-walk / author walk labels (`walk=N`) — gate these.
  if (d.label.startsWith('walk=')) return true

  return true
}

export const gatingRegressions = (result: CompareResult): CellDelta[] => result.regressions.filter(isGatingRegression)

/** Shape fields that must match for ratios to be meaningful (dialect list excluded). */
export const configShapeKey = (
  c: Pick<BaselineReport['config'], 'rowCount' | 'pageSize' | 'deepPageDepths' | 'walkPages' | 'iterations' | 'warmup'>,
): string =>
  JSON.stringify({
    rowCount: c.rowCount,
    pageSize: c.pageSize,
    deepPageDepths: c.deepPageDepths,
    walkPages: c.walkPages,
    iterations: c.iterations,
    warmup: c.warmup,
  })

export const compareBaselines = (
  baseline: BaselineReport,
  current: BaselineReport,
  threshold: number = DEFAULT_REGRESSION_THRESHOLD,
): CompareResult => {
  // Partial runs (e.g. CI matrix per dialect) only need baseline cells for dialects present.
  const currentDialects = new Set(current.cells.map((c) => c.dialect))
  const scopedBaselineCells = baseline.cells.filter((c) => currentDialects.has(c.dialect))

  const baseMap = new Map(scopedBaselineCells.map((c) => [cellKey(c), c]))
  const curMap = new Map(current.cells.map((c) => [cellKey(c), c]))

  const matched: CellDelta[] = []
  const missingInCurrent: BaselineCell[] = []
  const newInCurrent: BaselineCell[] = []

  for (const [key, b] of baseMap) {
    const c = curMap.get(key)
    if (!c) {
      missingInCurrent.push(b)
      continue
    }
    const cursorRatio = safeRatio(c.cursorMean, b.cursorMean)
    const speedupRatio =
      Number.isFinite(c.speedup) && Number.isFinite(b.speedup) && b.speedup > 0 ? c.speedup / b.speedup : null
    matched.push({
      key,
      dialect: c.dialect,
      scenario: c.scenario,
      label: c.label,
      baseline: b,
      current: c,
      cursorRatio,
      speedupRatio,
      status: statusFor(cursorRatio, threshold),
    })
  }

  for (const [key, c] of curMap) {
    if (!baseMap.has(key)) newInCurrent.push(c)
  }

  const regressions = matched.filter((d) => d.status === 'regression').sort((a, b) => b.cursorRatio - a.cursorRatio)
  const improvements = matched.filter((d) => d.status === 'improvement').sort((a, b) => a.cursorRatio - b.cursorRatio)

  return {
    baseline,
    current,
    threshold,
    matched,
    missingInCurrent,
    newInCurrent,
    regressions,
    improvements,
  }
}

const formatRatio = (r: number): string => {
  if (!Number.isFinite(r)) return 'n/a'
  const pct = (r - 1) * 100
  const sign = pct > 0 ? '+' : ''
  return `${r.toFixed(2)}× (${sign}${pct.toFixed(0)}%)`
}

const shortSha = (b: BaselineReport): string => (b.gitSha ? b.gitSha.slice(0, 7) : '—')

const deltaRow = (d: CellDelta): string =>
  `| ${d.dialect} | ${d.scenario} | ${d.label} | ${formatMs(d.baseline.cursorMean)} | ${formatMs(d.current.cursorMean)} | ${formatRatio(d.cursorRatio)} |`

const DELTA_HEADER = '| Dialect | Scenario | Label | Base | Curr | Δ |\n| --- | --- | --- | ---: | ---: | ---: |'

/** Short markdown for PR sticky comments and CI logs (not a full matrix dump). */
export const renderCompareMarkdown = (result: CompareResult): string => {
  const lines: string[] = []
  const { baseline, current, threshold, matched, regressions, improvements } = result
  const gated = gatingRegressions(result)
  const noise = regressions.filter((d) => !isGatingRegression(d))
  const configMismatch = configShapeKey(baseline.config) !== configShapeKey(current.config)

  const status =
    gated.length > 0
      ? `**⚠️ ${gated.length} CI-gating regression${gated.length === 1 ? '' : 's'}**`
      : noise.length > 0
        ? `**✅ no CI-gating regressions** · ${noise.length} noisy cell${noise.length === 1 ? '' : 's'}`
        : `**✅ no regressions**`

  lines.push(`# Benchmark comparison`)
  lines.push('')
  lines.push(
    `${status} · ≥${threshold}× · \`${shortSha(current)}\` vs baseline \`${shortSha(baseline)}\``,
  )
  if (configMismatch) {
    lines.push('')
    lines.push('> ⚠️ Config differs from baseline — ratios may not be meaningful.')
  }
  lines.push('')

  if (gated.length) {
    lines.push('### CI-gating')
    lines.push('')
    lines.push(DELTA_HEADER)
    for (const d of gated) lines.push(deltaRow(d))
    lines.push('')
  }

  if (noise.length) {
    lines.push(`### Noisy (not gated)${noise.length > 5 ? ` · ${noise.length}` : ''}`)
    lines.push('')
    lines.push(DELTA_HEADER)
    for (const d of noise.slice(0, 5)) lines.push(deltaRow(d))
    if (noise.length > 5) lines.push(`_…${noise.length - 5} more_`)
    lines.push('')
  }

  if (improvements.length) {
    const top = improvements.slice(0, 5)
    lines.push(`### Improvements · top ${top.length} of ${improvements.length}`)
    lines.push('')
    lines.push(DELTA_HEADER)
    for (const d of top) lines.push(deltaRow(d))
    lines.push('')
  }

  // One row per dialect: deepest deep-page cursor mean
  const dialects = [...new Set(matched.map((m) => m.dialect))].sort()
  const headlines: CellDelta[] = []
  for (const dialect of dialects) {
    const deep = matched
      .filter((m) => m.dialect === dialect && m.scenario === 'deep-page')
      .sort((a, b) => {
        const da = Number(a.label.replace(/\D/g, '')) || 0
        const db = Number(b.label.replace(/\D/g, '')) || 0
        return da - db
      })
    const last = deep[deep.length - 1]
    if (last) headlines.push(last)
  }
  if (headlines.length) {
    lines.push('### Deepest deep-page')
    lines.push('')
    lines.push('| Dialect | Label | Base | Curr | Δ | vs offset |')
    lines.push('| --- | --- | ---: | ---: | ---: | ---: |')
    for (const d of headlines) {
      const mark = d.status === 'regression' ? ' ⚠️' : d.status === 'improvement' ? ' ✅' : ''
      lines.push(
        `| ${d.dialect} | ${d.label} | ${formatMs(d.baseline.cursorMean)} | ${formatMs(d.current.cursorMean)} | ${formatRatio(d.cursorRatio)}${mark} | ${formatSpeedup(d.current.speedup)} |`,
      )
    }
    lines.push('')
  }

  if (result.missingInCurrent.length || result.newInCurrent.length) {
    const miss = result.missingInCurrent.length
    const neu = result.newInCurrent.length
    lines.push(
      `_Coverage: ${miss ? `${miss} missing` : ''}${miss && neu ? ', ' : ''}${neu ? `${neu} new` : ''}._`,
    )
    lines.push('')
  }

  lines.push(
    `_Gate: library · depth ≥ ${MIN_GATE_DEPTH} or walk · cursor mean ≥ ${threshold}× · [bench/README.md](bench/README.md)_`,
  )
  lines.push('')

  return lines.join('\n')
}

/** True when any regression should fail `--fail-on-regression` (not all report rows). */
export const hasRegressions = (result: CompareResult): boolean => gatingRegressions(result).length > 0
