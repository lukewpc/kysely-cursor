import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { toBaseline } from './baseline.js'
import { formatMs, formatSpeedup } from './metrics.js'
import type { BaselineCell, BaselineReport, BenchReport, ComparisonRow } from './types.js'

const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)

const allComparisons = (report: BenchReport): ComparisonRow[] =>
  report.dialects.flatMap((d) => d.scenarios.flatMap((s) => s.comparisons))

export const renderConsole = (report: BenchReport): string => {
  const lines: string[] = []
  lines.push('')
  lines.push('════════════════════════════════════════════════════════════════════════')
  lines.push('  kysely-cursor  ·  cursor vs offset pagination benchmarks')
  lines.push('════════════════════════════════════════════════════════════════════════')
  lines.push(`  generated: ${report.generatedAt}`)
  lines.push(
    `  rows=${report.config.rowCount.toLocaleString()}  pageSize=${report.config.pageSize}  ` +
      `iterations=${report.config.iterations}  warmup=${report.config.warmup}`,
  )
  lines.push('')

  for (const dialect of report.dialects) {
    lines.push(`┌─ ${dialect.dialect.toUpperCase()}  (${dialect.rowCount.toLocaleString()} rows)`)
    for (const scenario of dialect.scenarios) {
      lines.push(`│`)
      lines.push(`│  ${scenario.title}`)
      lines.push(
        `│  ${pad('label', 14)} ${padL('cursor mean', 14)} ${padL('offset mean', 14)} ${padL('speedup', 10)} ${padL('Δ ms', 10)}`,
      )
      lines.push(`│  ${'─'.repeat(66)}`)
      for (const c of scenario.comparisons) {
        lines.push(
          `│  ${pad(c.label, 14)} ${padL(formatMs(c.cursor.mean), 14)} ${padL(formatMs(c.offset.mean), 14)} ${padL(formatSpeedup(c.speedup), 10)} ${padL(formatMs(c.deltaMs), 10)}`,
        )
      }
    }
    lines.push(`└${'─'.repeat(70)}`)
    lines.push('')
  }

  lines.push(renderHeadlineBlock(report))
  lines.push('')
  lines.push(renderBriefTakeaways(report))
  lines.push('')
  return lines.join('\n')
}

const deepestDeepPage = (report: BenchReport): ComparisonRow[] =>
  report.dialects
    .map((d) => {
      const deep = d.scenarios.find((s) => s.scenario === 'deep-page')
      if (!deep || deep.comparisons.length === 0) return null
      return deep.comparisons[deep.comparisons.length - 1]!
    })
    .filter((x): x is ComparisonRow => x !== null)

const renderHeadlineBlock = (report: BenchReport): string => {
  const headlines = deepestDeepPage(report)
  if (!headlines.length) return 'No comparisons recorded.'

  const lines: string[] = []
  lines.push('── Headline: deepest single-page fetch (cursor vs offset) ──')
  lines.push(
    `  ${pad('dialect', 10)} ${pad('label', 12)} ${padL('cursor', 12)} ${padL('offset', 12)} ${padL('speedup', 10)}`,
  )
  for (const h of headlines) {
    lines.push(
      `  ${pad(h.dialect, 10)} ${pad(h.label, 12)} ${padL(formatMs(h.cursor.mean), 12)} ${padL(formatMs(h.offset.mean), 12)} ${padL(formatSpeedup(h.speedup), 10)}`,
    )
  }
  return lines.join('\n')
}

const renderBriefTakeaways = (report: BenchReport): string => {
  const rows = allComparisons(report)
  if (rows.length === 0) return ''

  const speedups = rows.map((r) => r.speedup).filter((s) => Number.isFinite(s) && s > 0)
  const max = rows.reduce((a, b) => (b.speedup > a.speedup ? b : a), rows[0]!)
  const min = rows.reduce((a, b) => (b.speedup < a.speedup ? b : a), rows[0]!)
  const median = [...speedups].sort((a, b) => a - b)[Math.floor(speedups.length / 2)] ?? 0
  const cursorWins = rows.filter((r) => r.speedup > 1.05).length
  const offsetWins = rows.filter((r) => r.speedup < 0.95).length

  const lines: string[] = []
  lines.push('── Takeaways ──')
  lines.push(
    `  • ${cursorWins} favor cursor (>1.05×), ${offsetWins} favor offset (<0.95×); median ${formatSpeedup(median)}`,
  )
  lines.push(
    `  • Best ${formatSpeedup(max.speedup)} (${max.dialect}/${max.scenario}/${max.label}); ` +
      `worst ${formatSpeedup(min.speedup)} (${min.dialect}/${min.scenario}/${min.label})`,
  )
  for (const d of report.dialects) {
    const deep = d.scenarios.find((s) => s.scenario === 'deep-page')
    if (!deep || deep.comparisons.length < 2) continue
    const first = deep.comparisons[0]!
    const last = deep.comparisons[deep.comparisons.length - 1]!
    const cursorGrowth = first.cursor.mean > 0 ? last.cursor.mean / first.cursor.mean : 0
    const offsetGrowth = first.offset.mean > 0 ? last.offset.mean / first.offset.mean : 0
    lines.push(
      `  • ${d.dialect} deep-page: cursor ×${cursorGrowth.toFixed(2)}, offset ×${offsetGrowth.toFixed(2)} ` +
        `(${first.label}→${last.label}); deepest ${formatSpeedup(last.speedup)}`,
    )
  }
  return lines.join('\n')
}

/**
 * Concise markdown for committed baseline + PR comments.
 * Means only (no p50/p95 columns), no essays, no EXPLAIN dumps.
 */
export const renderMarkdown = (report: BenchReport): string => {
  const baseline = toBaseline(report)
  return renderBaselineMarkdown(baseline, report)
}

/** Render from a slim baseline; optional full report supplies titles if present. */
export const renderBaselineMarkdown = (baseline: BaselineReport, full?: BenchReport): string => {
  const lines: string[] = []
  const cfg = baseline.config
  const sha = baseline.gitSha ? ` · \`${baseline.gitSha.slice(0, 7)}\`` : ''

  lines.push('# kysely-cursor benchmarks')
  lines.push('')
  const scenarioBit = cfg.scenarios?.length ? ` · ${cfg.scenarios.join(',')}` : ''
  lines.push(
    `**${baseline.generatedAt}**${sha} · ` +
      `${cfg.rowCount.toLocaleString()} rows · page ${cfg.pageSize} · ` +
      `iters ${cfg.iterations}/${cfg.warmup} · walk ${cfg.walkPages} · ` +
      `depths [${cfg.deepPageDepths.join(',')}] · ${cfg.dialects.join(',')}${scenarioBit}`,
  )
  lines.push('')
  lines.push(
    'Cursor = keyset via library API (`nullable: false` on non-null keys). ' +
      'Offset = built-in offset fallback. Speedup = offset/cursor (higher ⇒ cursor faster).',
  )
  lines.push('')

  // Headline
  lines.push('## Headline — deepest deep-page')
  lines.push('')
  lines.push('| Dialect | Label | Cursor | Offset | Speedup |')
  lines.push('| --- | --- | ---: | ---: | ---: |')
  for (const dialect of cfg.dialects) {
    const deep = baseline.cells.filter((c) => c.dialect === dialect && c.scenario === 'deep-page').sort(byDepthLabel)
    const last = deep[deep.length - 1]
    if (!last) continue
    lines.push(
      `| ${dialect} | ${last.label} | ${formatMs(last.cursorMean)} | ${formatMs(last.offsetMean)} | ${formatSpeedup(last.speedup)} |`,
    )
  }
  lines.push('')

  // Per dialect compact tables
  for (const dialect of cfg.dialects) {
    const cells = baseline.cells.filter((c) => c.dialect === dialect)
    if (!cells.length) continue
    lines.push(`## ${dialect}`)
    lines.push('')

    const scenarios = unique(cells.map((c) => c.scenario))
    for (const scenario of scenarios) {
      const rows = cells.filter((c) => c.scenario === scenario).sort(byDepthLabel)
      const title =
        full?.dialects.find((d) => d.dialect === dialect)?.scenarios.find((s) => s.scenario === scenario)?.title ??
        scenario
      lines.push(`### ${title}`)
      lines.push('')
      lines.push('| Label | Cursor | Offset | Speedup | Δ ms |')
      lines.push('| --- | ---: | ---: | ---: | ---: |')
      for (const c of rows) {
        lines.push(
          `| ${c.label} | ${formatMs(c.cursorMean)} | ${formatMs(c.offsetMean)} | ${formatSpeedup(c.speedup)} | ${formatMs(c.deltaMs)} |`,
        )
      }
      lines.push('')
    }
  }

  // Growth one-liners
  lines.push('## Deep-page growth')
  lines.push('')
  for (const dialect of cfg.dialects) {
    const deep = baseline.cells.filter((c) => c.dialect === dialect && c.scenario === 'deep-page').sort(byDepthLabel)
    if (deep.length < 2) continue
    const first = deep[0]!
    const last = deep[deep.length - 1]!
    const cg = first.cursorMean > 0 ? last.cursorMean / first.cursorMean : 0
    const og = first.offsetMean > 0 ? last.offsetMean / first.offsetMean : 0
    lines.push(
      `- **${dialect}**: cursor ×${cg.toFixed(2)}, offset ×${og.toFixed(2)} ` +
        `(${first.label}→${last.label}); deepest speedup ${formatSpeedup(last.speedup)}`,
    )
  }
  lines.push('')
  lines.push(
    '_Absolute ms depends on machine/runner; use committed baseline diffs for regressions. Full methodology: `bench/README.md`._',
  )
  lines.push('')

  return lines.join('\n')
}

const byDepthLabel = (a: BaselineCell, b: BaselineCell): number => {
  const da = Number(a.label.replace(/\D/g, '')) || 0
  const db = Number(b.label.replace(/\D/g, '')) || 0
  if (da !== db) return da - db
  return a.label.localeCompare(b.label)
}

const unique = <T>(xs: T[]): T[] => [...new Set(xs)]

export const writeReports = async (
  report: BenchReport,
  resultsDir: string,
  opts?: { gitSha?: string },
): Promise<{ markdownPath: string; jsonPath: string; baseline: BaselineReport }> => {
  await mkdir(resultsDir, { recursive: true })
  const stamp = report.generatedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const markdownPath = join(resultsDir, `${stamp}-report.md`)
  const jsonPath = join(resultsDir, `${stamp}-results.json`)

  const baseline = toBaseline(report, { gitSha: opts?.gitSha })
  const markdown = renderMarkdown(report)

  // Slim JSON only (no raw samples) — small enough for artifacts / local latest.
  await writeFile(markdownPath, markdown, 'utf8')
  await writeFile(jsonPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  await writeFile(join(resultsDir, 'latest-report.md'), markdown, 'utf8')
  await writeFile(join(resultsDir, 'latest-results.json'), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')

  return { markdownPath, jsonPath, baseline }
}
