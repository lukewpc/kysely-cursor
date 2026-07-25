#!/usr/bin/env node
import { access, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { DEFAULT_BASELINE_DIR, DEFAULT_BASELINE_JSON, loadBaseline, mergeBaselines, writeBaseline } from './baseline.js'
import {
  compareBaselines,
  deepPageSeries,
  DEFAULT_REGRESSION_THRESHOLD,
  gatingRegressions,
  hasRegressions,
  renderCompareMarkdown,
} from './compare.js'
import { writeDeepPageCharts } from './chart.js'
import { describeConfig, parseArgs } from './config.js'
import { renderBaselineMarkdown, renderConsole, writeReports } from './report.js'
import type { BaselineReport, BenchReport } from './types.js'

const printHelp = () => {
  console.log(
    `
kysely-cursor benchmarks — cursor vs offset pagination

Usage:
  pnpm bench [options]
  pnpm --filter kysely-cursor-bench bench [options]
  pnpm --filter kysely-cursor-bench bench -- --compare [options]

Run options:
  --dialect <name[,name…]>   postgres | mysql | mssql | sqlite  (default: all)
  --scenarios <id[,…]|all>   default: deep-page,sequential-walk  (CI); all with --full
  --rows <n>                 rows to seed                       (default: 50000, quick: 10000)
  --page-size <n>            page size                          (default: 25)
  --depths <n,n,…>           deep-page depths (0-based)
  --walk-pages <n>           sequential-walk page count
  --iterations <n>           timed iterations per measurement
  --warmup <n>               warmup iterations
  --out <dir>                ephemeral results directory        (default: ./bench/results)
  --quick                    smoke: smaller seed / fewer iters
  --full                     poster matrix: all scenarios, dense depths
  --update-baseline          write slim results to bench/baseline/ (skipped if compare failed)
  --baseline-dir <dir>       baseline directory                 (default: ./bench/baseline)
  --git-sha <sha>            record SHA into baseline JSON
  --compare                  after run (or with --current/--merge), diff vs baseline
  --current <path>           JSON to treat as current (implies --compare; skips run; can pair with --update-baseline)
  --merge <path[,path…]>     merge partial baseline JSON files or dirs (CI matrix); implies --compare; skips run
  --baseline <path>          baseline JSON path                 (default: bench/baseline/results.json)
  --threshold <n>            cursor-mean regression ratio       (default: 1.5)
  --fail-on-regression       exit 1 on CI-gating regressions (ratio + abs Δ floor)
  --comment-out <path>       write compare markdown to path (for PR comments)
  --help                     show this help

Examples:
  pnpm bench                     # CI profile (deep-page + walk, sparse depths)
  pnpm bench --quick             # faster smoke
  pnpm bench --full              # all scenarios, dense depths
  pnpm bench --update-baseline
  pnpm bench --dialect postgres,sqlite --compare --fail-on-regression
  pnpm bench --compare --current bench/results/latest-results.json
  pnpm bench --merge artifacts/bench-postgres,artifacts/bench-mysql --update-baseline
`.trim(),
  )
}

const hasFlag = (argv: string[], flag: string) => argv.includes(flag)

const getFlag = (argv: string[], flag: string): string | undefined => {
  const idx = argv.indexOf(flag)
  if (idx === -1) return undefined
  return argv[idx + 1]
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Collect baseline JSON paths from files and directories (recursive for dirs). */
const collectMergePaths = async (spec: string): Promise<string[]> => {
  const parts = spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const files: string[] = []

  const walk = async (p: string): Promise<void> => {
    const abs = resolve(p)
    const st = await stat(abs)
    if (st.isFile()) {
      if (abs.endsWith('.json')) files.push(abs)
      return
    }
    if (!st.isDirectory()) return
    const entries = await readdir(abs, { withFileTypes: true })
    for (const e of entries) {
      const child = join(abs, e.name)
      if (e.isDirectory()) await walk(child)
      else if (e.isFile() && e.name.endsWith('.json') && e.name.includes('results')) {
        files.push(child)
      }
    }
  }

  for (const part of parts) await walk(part)
  // Prefer latest-results.json when both stamped and latest exist under same dir.
  const preferred = files.filter((f) => f.endsWith('latest-results.json'))
  const rest = files.filter((f) => !f.endsWith('latest-results.json'))
  // If any latest-* found, use only those (one per dialect job); else use all.
  return preferred.length > 0 ? preferred : rest
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    printHelp()
    return
  }

  const currentPath = getFlag(argv, '--current')
  const mergeSpec = getFlag(argv, '--merge')
  const compareMode = hasFlag(argv, '--compare') || currentPath !== undefined || mergeSpec !== undefined
  const baselinePath = getFlag(argv, '--baseline') ?? resolve(DEFAULT_BASELINE_JSON)
  const baselineDir = getFlag(argv, '--baseline-dir') ?? DEFAULT_BASELINE_DIR
  const threshold = Number(getFlag(argv, '--threshold') ?? DEFAULT_REGRESSION_THRESHOLD)
  const failOnRegression = hasFlag(argv, '--fail-on-regression')
  const updateBaseline = hasFlag(argv, '--update-baseline')
  const commentOut = getFlag(argv, '--comment-out')
  const gitSha = getFlag(argv, '--git-sha') ?? process.env.GITHUB_SHA

  const maybeWriteBaseline = async (baseline: BaselineReport, full?: BenchReport) => {
    if (!updateBaseline) return
    // Never promote a baseline from a run that already failed compare / set exitCode.
    if (process.exitCode) {
      console.warn('\nSkipping --update-baseline because the run reported a regression or failure.')
      return
    }
    const summary = renderBaselineMarkdown(baseline, full)
    const paths = await writeBaseline(baseline, baselineDir, summary)
    console.log(`  baseline: ${paths.jsonPath}`)
    console.log(`  summary:  ${paths.mdPath}`)
  }

  // Merge partial matrix artifacts (or promote a single --current file).
  if (currentPath || mergeSpec) {
    let current: BaselineReport
    if (mergeSpec) {
      const paths = await collectMergePaths(mergeSpec)
      if (paths.length === 0) {
        throw new Error(`--merge: no *results*.json files under: ${mergeSpec}`)
      }
      console.log(`Merging ${paths.length} baseline file(s):`)
      for (const p of paths) console.log(`  ${p}`)
      const parts = await Promise.all(paths.map((p) => loadBaseline(p)))
      current = mergeBaselines(parts)
    } else {
      current = await loadBaseline(resolve(currentPath!))
    }
    if (gitSha) current = { ...current, gitSha }
    if (compareMode) {
      await runCompare({
        current,
        baselinePath,
        threshold,
        failOnRegression,
        commentOut,
      })
    }
    await maybeWriteBaseline(current)
    return
  }

  // Lazy-load runner (and thus dialect drivers / kysely-cursor) only for live runs.
  // --merge / --current must work without a built library dist (CI bench-report job).
  const { runBenchmarks } = await import('./runner.js')

  const cfg = parseArgs(argv)
  console.log('kysely-cursor benchmarks')
  console.log(describeConfig(cfg))
  console.log('')

  const started = performance.now()
  const report = await runBenchmarks(cfg)
  const elapsed = ((performance.now() - started) / 1000).toFixed(1)

  const consoleOut = renderConsole(report)
  process.stdout.write(consoleOut)

  const { markdownPath, jsonPath, baseline } = await writeReports(report, cfg.resultsDir, {
    gitSha,
  })
  console.log(`\nReports written:`)
  console.log(`  markdown: ${markdownPath}`)
  console.log(`  json:     ${jsonPath}`)
  console.log(`  total wall time: ${elapsed}s`)

  // Compare against the *committed* baseline before overwriting it.
  if (compareMode) {
    if (!(await fileExists(baselinePath))) {
      console.warn(`\nNo baseline at ${baselinePath} — skip compare (commit one with --update-baseline).`)
    } else {
      await runCompare({
        current: baseline,
        baselinePath,
        threshold,
        failOnRegression,
        commentOut,
      })
    }
  }

  await maybeWriteBaseline(baseline, report)
}

const runCompare = async (opts: {
  current: BaselineReport
  baselinePath: string
  threshold: number
  failOnRegression: boolean
  commentOut?: string
}) => {
  const baseline = await loadBaseline(opts.baselinePath)
  const result = compareBaselines(baseline, opts.current, opts.threshold)

  // Chart.js PNG deep-page plots (baseline vs current) next to the comment / results.
  const { writeFile, mkdir } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const chartDir = opts.commentOut ? join(dirname(opts.commentOut), 'charts') : join(process.cwd(), 'results', 'charts')
  const dialects = [...new Set(result.matched.map((m) => m.dialect))].sort()
  const deepCharts = dialects
    .map((dialect) => ({ dialect, points: deepPageSeries(result.matched, dialect) }))
    .filter((c) => c.points.length > 0)
  if (deepCharts.length) {
    await writeDeepPageCharts(deepCharts, chartDir)
    console.log(`Deep-page charts written: ${chartDir}`)
  }

  // Relative `charts/` works for local preview; CI rewrites to raw.githubusercontent.com.
  const chartUrlBase = process.env.BENCH_CHART_URL_BASE?.replace(/\/$/, '') || 'charts'
  const md = renderCompareMarkdown(result, { chartUrlBase })

  process.stdout.write(`\n${md}\n`)

  if (opts.commentOut) {
    await mkdir(dirname(opts.commentOut), { recursive: true })
    await writeFile(opts.commentOut, md, 'utf8')
    console.log(`Compare comment written: ${opts.commentOut}`)
  }

  // Local/dev baselines have no gitSha. Absolute ms is not comparable to CI runners,
  // so only enforce --fail-on-regression when the baseline itself was CI-produced.
  const enforce = opts.failOnRegression && (Boolean(baseline.gitSha) || process.env.CI !== 'true')

  if (opts.failOnRegression && !enforce) {
    console.warn(
      '\nSkipping fail-on-regression: baseline has no gitSha (not yet produced on CI). ' +
        'Comment/report only until main records a CI baseline.',
    )
  }

  if (enforce && hasRegressions(result)) {
    const n = gatingRegressions(result).length
    console.error(
      `\nBenchmark regression: ${n} CI-gating cell(s) ≥ ${opts.threshold}× baseline cursor mean ` +
        `and ≥ dialect abs floor (2ms remote / 0.5ms sqlite; deep-page / sequential-walk only, ` +
        `depth ≥ 100 or walks; other scenarios / shallow / sub-floor Δ ignored).`,
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nBenchmark failed:')
  console.error(err)
  process.exitCode = 1
})
