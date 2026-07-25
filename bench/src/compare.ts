import type { BaselineCell, BaselineReport, CellDelta, CompareResult } from './types.js'
import { cellKey } from './baseline.js'
import { renderDeepPageImageGrid, type DepthSeriesPoint } from './chart.js'
import { DEFAULT_REGRESSION_THRESHOLD, isGatingRegression, MIN_ABS_MS, MIN_GATE_DEPTH } from './gate.js'
import { formatMs, formatSpeedup } from './metrics.js'

export {
  cursorDeltaMs,
  DEFAULT_REGRESSION_THRESHOLD,
  GATING_SCENARIOS,
  isGatingRegression,
  MIN_ABS_MS,
  MIN_GATE_DEPTH,
} from './gate.js'
export { renderDeepPageImageGrid, renderDeepPagePng, writeDeepPageCharts } from './chart.js'

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

export const gatingRegressions = (result: CompareResult): CellDelta[] => result.regressions.filter(isGatingRegression)

/** Shape fields that must match for ratios to be meaningful (dialect / scenario lists excluded). */
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

const parseDepth = (label: string): number | null => {
  const m = /^depth=(\d+)$/.exec(label)
  return m ? Number(m[1]) : null
}

/** Deep-page matched cells → series points (ascending depth). */
export const deepPageSeries = (matched: CellDelta[], dialect: string): DepthSeriesPoint[] =>
  matched
    .filter((m) => m.dialect === dialect && m.scenario === 'deep-page')
    .map((m) => {
      const depth = parseDepth(m.label)
      if (depth === null) return null
      return {
        depth,
        baselineMs: m.baseline.cursorMean,
        currentMs: m.current.cursorMean,
      }
    })
    .filter((p): p is DepthSeriesPoint => p !== null)
    .sort((a, b) => a.depth - b.depth)

export type CompareMarkdownOpts = {
  /**
   * Base URL or relative path for chart PNGs (no trailing slash).
   * Local default: `charts` (next to the comment file).
   * CI sticky comments need an https:// raw.githubusercontent.com/... base.
   */
  chartUrlBase?: string
}

/** Short markdown for PR sticky comments and CI logs (not a full matrix dump). */
export const renderCompareMarkdown = (result: CompareResult, opts: CompareMarkdownOpts = {}): string => {
  const lines: string[] = []
  const { baseline, current, threshold, matched } = result
  const gated = gatingRegressions(result)
  const configMismatch = configShapeKey(baseline.config) !== configShapeKey(current.config)
  const chartUrlBase = opts.chartUrlBase ?? 'charts'

  const status =
    gated.length > 0
      ? `**⚠️ ${gated.length} CI-gating regression${gated.length === 1 ? '' : 's'}**`
      : `**✅ no CI-gating regressions**`

  lines.push(`# Benchmark comparison`)
  lines.push('')
  lines.push(`${status} · ≥${threshold}× · \`${shortSha(current)}\` vs baseline \`${shortSha(baseline)}\``)
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

  const dialects = [...new Set(matched.map((m) => m.dialect))].sort()
  const deepCharts = dialects
    .map((dialect) => ({ dialect, points: deepPageSeries(matched, dialect) }))
    .filter((c) => c.points.length > 0)

  if (deepCharts.length) {
    lines.push('### Deep-page')
    lines.push('')
    lines.push(
      renderDeepPageImageGrid(
        deepCharts.map((c) => c.dialect),
        (d) => `${chartUrlBase}/${d}.png`,
      ),
    )
    lines.push('')
    lines.push('| Dialect | Depth | Base | Curr | Δ | vs offset |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const { dialect, points } of deepCharts) {
      for (const p of points) {
        const cell = matched.find(
          (m) => m.dialect === dialect && m.scenario === 'deep-page' && m.label === `depth=${p.depth}`,
        )
        if (!cell) continue
        const mark = cell.status === 'regression' ? ' ⚠️' : cell.status === 'improvement' ? ' ✅' : ''
        lines.push(
          `| ${dialect} | ${p.depth} | ${formatMs(p.baselineMs)} | ${formatMs(p.currentMs)} | ${formatRatio(cell.cursorRatio)}${mark} | ${formatSpeedup(cell.current.speedup)} |`,
        )
      }
    }
    lines.push('')
  }

  const walks = matched
    .filter((m) => m.scenario === 'sequential-walk')
    .sort((a, b) => a.dialect.localeCompare(b.dialect) || a.label.localeCompare(b.label))
  if (walks.length) {
    lines.push('### Sequential-walk')
    lines.push('')
    lines.push('| Dialect | Label | Base | Curr | Δ | vs offset |')
    lines.push('| --- | --- | ---: | ---: | ---: | ---: |')
    for (const d of walks) {
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
    lines.push(`_Coverage: ${miss ? `${miss} missing` : ''}${miss && neu ? ', ' : ''}${neu ? `${neu} new` : ''}._`)
    lines.push('')
  }

  lines.push(
    `_Gate: deep-page / sequential-walk · depth ≥ ${MIN_GATE_DEPTH} or walk · ≥ ${threshold}× · Δ ≥ ${MIN_ABS_MS.postgres}ms (sqlite ${MIN_ABS_MS.sqlite}ms) · [bench/README.md](bench/README.md)_`,
  )
  lines.push('')

  return lines.join('\n')
}

/** True when any regression should fail `--fail-on-regression` (not all report rows). */
export const hasRegressions = (result: CompareResult): boolean => gatingRegressions(result).length > 0
