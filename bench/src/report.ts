import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatMs, formatSpeedup } from './metrics.js'
import type { BenchReport, ComparisonRow } from './types.js'

const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)

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
      lines.push(`│  ${scenario.description}`)
      lines.push(`│`)
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

  lines.push(renderSummaryTable(report))
  lines.push('')
  lines.push(renderTakeaways(report))
  lines.push('')
  return lines.join('\n')
}

const allComparisons = (report: BenchReport): ComparisonRow[] =>
  report.dialects.flatMap((d) => d.scenarios.flatMap((s) => s.comparisons))

const renderSummaryTable = (report: BenchReport): string => {
  const rows = allComparisons(report)
  if (rows.length === 0) return 'No comparisons recorded.'

  // Highlight the deepest deep-page per dialect — the headline number.
  const headlines = report.dialects.map((d) => {
    const deep = d.scenarios.find((s) => s.scenario === 'deep-page')
    if (!deep || deep.comparisons.length === 0) return null
    const deepest = deep.comparisons[deep.comparisons.length - 1]!
    return deepest
  }).filter((x): x is ComparisonRow => x !== null)

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

const renderTakeaways = (report: BenchReport): string => {
  const rows = allComparisons(report)
  if (rows.length === 0) return ''

  const speedups = rows.map((r) => r.speedup).filter((s) => Number.isFinite(s) && s > 0)
  const max = rows.reduce((a, b) => (b.speedup > a.speedup ? b : a), rows[0]!)
  const min = rows.reduce((a, b) => (b.speedup < a.speedup ? b : a), rows[0]!)
  const median = [...speedups].sort((a, b) => a - b)[Math.floor(speedups.length / 2)] ?? 0
  const cursorWins = rows.filter((r) => r.speedup > 1.05).length
  const offsetWins = rows.filter((r) => r.speedup < 0.95).length

  const growthNotes: string[] = []
  for (const d of report.dialects) {
    const deep = d.scenarios.find((s) => s.scenario === 'deep-page')
    if (!deep || deep.comparisons.length < 2) continue
    const first = deep.comparisons[0]!
    const last = deep.comparisons[deep.comparisons.length - 1]!
    const cursorGrowth = first.cursor.mean > 0 ? last.cursor.mean / first.cursor.mean : 0
    const offsetGrowth = first.offset.mean > 0 ? last.offset.mean / first.offset.mean : 0
    growthNotes.push(
      `  • ${d.dialect}: cursor ×${cursorGrowth.toFixed(2)} from ${first.label}→${last.label}; ` +
        `offset ×${offsetGrowth.toFixed(2)}  |  deepest speedup ${formatSpeedup(last.speedup)} ` +
        `(cursor ${formatMs(last.cursor.mean)} vs offset ${formatMs(last.offset.mean)})`,
    )
  }

  const lines: string[] = []
  lines.push('── Takeaways ──')
  lines.push(
    `  • ${cursorWins} measurement(s) favor cursor (>1.05×), ${offsetWins} favor offset (<0.95×)`,
  )
  lines.push(`  • Median cursor speedup across all cells: ${formatSpeedup(median)}`)
  lines.push(
    `  • Best cursor advantage: ${formatSpeedup(max.speedup)} (${max.dialect} / ${max.scenario} / ${max.label})`,
  )
  lines.push(
    `  • Worst cursor showing: ${formatSpeedup(min.speedup)} (${min.dialect} / ${min.scenario} / ${min.label})`,
  )
  if (growthNotes.length) {
    lines.push('  • Deep-page growth (mean latency) — the main signal:')
    lines.push(...growthNotes)
  }
  // Call out ideal-baseline vs library deep-page when both exist.
  for (const d of report.dialects) {
    const ideal = d.scenarios.find((s) => s.scenario === 'ideal-baseline')
    const deep = d.scenarios.find((s) => s.scenario === 'deep-page')
    if (!ideal?.comparisons.length || !deep?.comparisons.length) continue
    const idealDeep = ideal.comparisons[ideal.comparisons.length - 1]!
    const libDeep = deep.comparisons[deep.comparisons.length - 1]!
    lines.push(
      `  • ${d.dialect} at ${idealDeep.label}: ideal raw keyset speedup ${formatSpeedup(idealDeep.speedup)} ` +
        `vs library cursor speedup ${formatSpeedup(libDeep.speedup)}`,
    )
  }

  lines.push(
    '  • Shallow pages are often similar for both strategies (one page of work either way).',
  )
  lines.push(
    '  • Library keyset predicates are null-safe (`col IS NOT NULL AND col < $1` inside OR',
  )
  lines.push(
    '    trees). On some engines that shape is applied as a Filter over an index walk',
  )
  lines.push(
    '    (Rows Removed by Filter ≈ OFFSET), not as an Index Cond range seek — see plans.',
  )
  lines.push(
    '  • The ideal-baseline scenario shows textbook keyset SQL without the library’s',
  )
  lines.push(
    '    null-safe tree or token codec; use it as the theoretical ceiling.',
  )
  lines.push(
    '  • Cursor still wins on correctness under concurrent inserts/deletes (no skipped/',
  )
  lines.push(
    '    duplicated rows). Prefer cursor for infinite scroll; offset for jump-to-page-N.',
  )
  return lines.join('\n')
}

export const renderMarkdown = (report: BenchReport): string => {
  const lines: string[] = []
  lines.push('# kysely-cursor pagination benchmarks')
  lines.push('')
  lines.push(`Generated: **${report.generatedAt}**`)
  lines.push('')
  lines.push('## Configuration')
  lines.push('')
  lines.push('| Setting | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Rows | ${report.config.rowCount.toLocaleString()} |`)
  lines.push(`| Page size | ${report.config.pageSize} |`)
  lines.push(`| Deep-page depths | ${report.config.deepPageDepths.join(', ')} |`)
  lines.push(`| Sequential walk pages | ${report.config.walkPages} |`)
  lines.push(`| Iterations / warmup | ${report.config.iterations} / ${report.config.warmup} |`)
  lines.push(`| Dialects | ${report.config.dialects.join(', ')} |`)
  lines.push('')
  lines.push('## What is being measured')
  lines.push('')
  lines.push(
    'Both strategies use the same `createPaginator` API from **kysely-cursor**:',
  )
  lines.push('')
  lines.push('- **Cursor (keyset)** — `cursor: { nextPage: token }` (or first page with no cursor)')
  lines.push('- **Offset** — `cursor: { offset: n }` (built-in offset fallback)')
  lines.push('')
  lines.push(
    'The dataset is a realistic `posts` table with indexes matching each access pattern. ' +
      'For deep-page measurements, cursor tokens are resolved *outside* the timer so only the page query is timed.',
  )
  lines.push('')

  for (const dialect of report.dialects) {
    lines.push(`## ${dialect.dialect}`)
    lines.push('')
    lines.push(`Seeded rows: **${dialect.rowCount.toLocaleString()}**`)
    lines.push('')

    for (const scenario of dialect.scenarios) {
      lines.push(`### ${scenario.title}`)
      lines.push('')
      lines.push(scenario.description)
      lines.push('')
      lines.push(
        '| Label | Cursor mean | Cursor p50 | Cursor p95 | Offset mean | Offset p50 | Offset p95 | Speedup | Δ ms |',
      )
      lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
      for (const c of scenario.comparisons) {
        lines.push(
          `| ${c.label} | ${formatMs(c.cursor.mean)} | ${formatMs(c.cursor.p50)} | ${formatMs(c.cursor.p95)} | ${formatMs(c.offset.mean)} | ${formatMs(c.offset.p50)} | ${formatMs(c.offset.p95)} | ${formatSpeedup(c.speedup)} | ${formatMs(c.deltaMs)} |`,
        )
      }
      lines.push('')
    }

    if (dialect.plans?.length) {
      lines.push('### Query plans')
      lines.push('')
      lines.push(
        'Library-shaped keyset (null-safe OR tree), ideal textbook keyset, and OFFSET at the deepest measured page.',
      )
      lines.push('')
      for (const plan of dialect.plans) {
        lines.push('```')
        lines.push(plan)
        lines.push('```')
        lines.push('')
      }
    }
  }

  lines.push('## Summary')
  lines.push('')
  lines.push('```')
  lines.push(renderSummaryTable(report))
  lines.push('')
  lines.push(renderTakeaways(report))
  lines.push('```')
  lines.push('')
  lines.push('## Methodology notes')
  lines.push('')
  lines.push('- Containers: Postgres 17, MySQL 8.4, SQL Server 2022 via testcontainers; SQLite via better-sqlite3.')
  lines.push('- Each measurement runs a configurable warmup then N timed iterations; stats are mean / p50 / p95 / p99.')
  lines.push('- Indexes: `(created_at, id)`, `(status, created_at, id)`, `(author_id, created_at, id)`, `(score, id)`.')
  lines.push('- Results are wall-clock from the Node process (includes network RTT to the container).')
  lines.push('- Absolute numbers vary by machine/Docker; the **relative** cursor vs offset gap is the useful signal.')
  lines.push('')

  return lines.join('\n')
}

export const writeReports = async (
  report: BenchReport,
  resultsDir: string,
): Promise<{ markdownPath: string; jsonPath: string }> => {
  await mkdir(resultsDir, { recursive: true })
  const stamp = report.generatedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const markdownPath = join(resultsDir, `${stamp}-report.md`)
  const jsonPath = join(resultsDir, `${stamp}-results.json`)

  await writeFile(markdownPath, renderMarkdown(report), 'utf8')
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')

  // Also refresh a stable "latest" pointer for CI/docs.
  await writeFile(join(resultsDir, 'latest-report.md'), renderMarkdown(report), 'utf8')
  await writeFile(join(resultsDir, 'latest-results.json'), JSON.stringify(report, null, 2), 'utf8')

  return { markdownPath, jsonPath }
}


