import type {
  BaselineCell,
  BaselineReport,
  CellDelta,
  CompareResult,
} from './types.js'
import { cellKey } from './baseline.js'
import { formatMs, formatSpeedup } from './metrics.js'

export const DEFAULT_REGRESSION_THRESHOLD = 1.5

const safeRatio = (current: number, baseline: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) {
    return Number.NaN
  }
  return current / baseline
}

const statusFor = (
  cursorRatio: number,
  threshold: number,
): CellDelta['status'] => {
  if (!Number.isFinite(cursorRatio)) return 'stable'
  if (cursorRatio >= threshold) return 'regression'
  if (cursorRatio <= 1 / threshold) return 'improvement'
  return 'stable'
}

export const compareBaselines = (
  baseline: BaselineReport,
  current: BaselineReport,
  threshold: number = DEFAULT_REGRESSION_THRESHOLD,
): CompareResult => {
  const baseMap = new Map(baseline.cells.map((c) => [cellKey(c), c]))
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
      Number.isFinite(c.speedup) &&
      Number.isFinite(b.speedup) &&
      b.speedup > 0
        ? c.speedup / b.speedup
        : null
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

  const regressions = matched
    .filter((d) => d.status === 'regression')
    .sort((a, b) => b.cursorRatio - a.cursorRatio)
  const improvements = matched
    .filter((d) => d.status === 'improvement')
    .sort((a, b) => a.cursorRatio - b.cursorRatio)

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

const formatConfigLine = (b: BaselineReport): string => {
  const c = b.config
  const sha = b.gitSha ? ` · sha \`${b.gitSha.slice(0, 7)}\`` : ''
  return (
    `${c.rowCount.toLocaleString()} rows · page ${c.pageSize} · ` +
    `iters ${c.iterations}/${c.warmup} · walk ${c.walkPages} · ` +
    `depths [${c.deepPageDepths.join(',')}] · ${c.dialects.join(', ')}${sha}`
  )
}

/** Concise markdown for PR comments and CI logs. */
export const renderCompareMarkdown = (result: CompareResult): string => {
  const lines: string[] = []
  const { baseline, current, threshold, matched, regressions, improvements } =
    result

  const hasFail = regressions.length > 0
  const configMismatch =
    JSON.stringify(baseline.config) !== JSON.stringify(current.config)

  lines.push(`# Benchmark comparison`)
  lines.push('')
  lines.push(
    hasFail
      ? `**Status: ⚠️ ${regressions.length} regression(s)** (cursor mean ≥ ${threshold}× baseline)`
      : `**Status: ✅ no regressions** (threshold ${threshold}× on cursor mean)`,
  )
  if (configMismatch) {
    lines.push('')
    lines.push(
      '> ⚠️ **Config differs** from baseline — ratios may not be meaningful until configs match.',
    )
  }
  lines.push('')
  lines.push(`| | Generated | Config |`)
  lines.push(`| --- | --- | --- |`)
  lines.push(
    `| **Baseline** | ${baseline.generatedAt} | ${formatConfigLine(baseline)} |`,
  )
  lines.push(
    `| **Current** | ${current.generatedAt} | ${formatConfigLine(current)} |`,
  )
  lines.push('')
  lines.push(
    'Primary signal: **cursor mean** latency (library path). Absolute ms varies by runner; ratios vs the committed baseline are what matter.',
  )
  lines.push('')

  if (regressions.length) {
    lines.push('## Regressions')
    lines.push('')
    lines.push(
      '| Dialect | Scenario | Label | Baseline cursor | Current cursor | Δ |',
    )
    lines.push('| --- | --- | --- | ---: | ---: | ---: |')
    for (const d of regressions) {
      lines.push(
        `| ${d.dialect} | ${d.scenario} | ${d.label} | ${formatMs(d.baseline.cursorMean)} | ${formatMs(d.current.cursorMean)} | ${formatRatio(d.cursorRatio)} |`,
      )
    }
    lines.push('')
  }

  if (improvements.length) {
    lines.push('## Improvements')
    lines.push('')
    lines.push(
      '| Dialect | Scenario | Label | Baseline cursor | Current cursor | Δ |',
    )
    lines.push('| --- | --- | --- | ---: | ---: | ---: |')
    for (const d of improvements.slice(0, 20)) {
      lines.push(
        `| ${d.dialect} | ${d.scenario} | ${d.label} | ${formatMs(d.baseline.cursorMean)} | ${formatMs(d.current.cursorMean)} | ${formatRatio(d.cursorRatio)} |`,
      )
    }
    if (improvements.length > 20) {
      lines.push('')
      lines.push(`_…and ${improvements.length - 20} more_`)
    }
    lines.push('')
  }

  // Headline: deepest deep-page per dialect
  lines.push('## Headline — deepest deep-page (cursor)')
  lines.push('')
  lines.push(
    '| Dialect | Label | Baseline | Current | Δ | Speedup (cur) |',
  )
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |')
  const dialects = [...new Set(matched.map((m) => m.dialect))]
  for (const dialect of dialects) {
    const deep = matched
      .filter((m) => m.dialect === dialect && m.scenario === 'deep-page')
      .sort((a, b) => {
        const da = Number(a.label.replace(/\D/g, '')) || 0
        const db = Number(b.label.replace(/\D/g, '')) || 0
        return da - db
      })
    const last = deep[deep.length - 1]
    if (!last) continue
    const mark =
      last.status === 'regression'
        ? ' ⚠️'
        : last.status === 'improvement'
          ? ' ✅'
          : ''
    lines.push(
      `| ${dialect} | ${last.label} | ${formatMs(last.baseline.cursorMean)} | ${formatMs(last.current.cursorMean)} | ${formatRatio(last.cursorRatio)}${mark} | ${formatSpeedup(last.current.speedup)} |`,
    )
  }
  lines.push('')

  // Deep-page matrix (compact)
  lines.push('## Deep-page cursor mean (baseline → current)')
  lines.push('')
  for (const dialect of dialects) {
    const deep = matched
      .filter((m) => m.dialect === dialect && m.scenario === 'deep-page')
      .sort((a, b) => {
        const da = Number(a.label.replace(/\D/g, '')) || 0
        const db = Number(b.label.replace(/\D/g, '')) || 0
        return da - db
      })
    if (!deep.length) continue
    lines.push(`### ${dialect}`)
    lines.push('')
    lines.push('| Label | Baseline | Current | Δ | Offset (cur) | Speedup |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const d of deep) {
      const mark =
        d.status === 'regression' ? ' ⚠️' : d.status === 'improvement' ? ' ✅' : ''
      lines.push(
        `| ${d.label} | ${formatMs(d.baseline.cursorMean)} | ${formatMs(d.current.cursorMean)} | ${formatRatio(d.cursorRatio)}${mark} | ${formatMs(d.current.offsetMean)} | ${formatSpeedup(d.current.speedup)} |`,
      )
    }
    lines.push('')
  }

  if (result.missingInCurrent.length || result.newInCurrent.length) {
    lines.push('## Coverage')
    lines.push('')
    if (result.missingInCurrent.length) {
      lines.push(
        `- Missing vs baseline (${result.missingInCurrent.length}): ${result.missingInCurrent
          .slice(0, 8)
          .map((c) => cellKey(c))
          .join(', ')}${result.missingInCurrent.length > 8 ? '…' : ''}`,
      )
    }
    if (result.newInCurrent.length) {
      lines.push(
        `- New cells (${result.newInCurrent.length}): ${result.newInCurrent
          .slice(0, 8)
          .map((c) => cellKey(c))
          .join(', ')}${result.newInCurrent.length > 8 ? '…' : ''}`,
      )
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push(
    `_Threshold: cursor mean ≥ ${threshold}× baseline = regression. See \`bench/README.md\`._`,
  )
  lines.push('')

  return lines.join('\n')
}

export const hasRegressions = (result: CompareResult): boolean =>
  result.regressions.length > 0
