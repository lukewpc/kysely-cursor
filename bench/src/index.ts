#!/usr/bin/env node
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  DEFAULT_BASELINE_DIR,
  DEFAULT_BASELINE_JSON,
  loadBaseline,
  writeBaseline,
} from './baseline.js'
import {
  compareBaselines,
  DEFAULT_REGRESSION_THRESHOLD,
  hasRegressions,
  renderCompareMarkdown,
} from './compare.js'
import { describeConfig, parseArgs } from './config.js'
import { renderBaselineMarkdown, renderConsole, writeReports } from './report.js'
import { runBenchmarks } from './runner.js'
import type { BaselineReport } from './types.js'

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
  --rows <n>                 rows to seed                       (default: 200000, quick: 20000)
  --page-size <n>            page size                          (default: 25)
  --depths <n,n,…>           deep-page depths (0-based)
  --walk-pages <n>           sequential-walk page count
  --iterations <n>           timed iterations per measurement
  --warmup <n>               warmup iterations
  --out <dir>                ephemeral results directory        (default: ./bench/results)
  --quick                    smaller dataset / fewer iterations
  --update-baseline          write slim results to bench/baseline/ (committed)
  --baseline-dir <dir>       baseline directory                 (default: ./bench/baseline)
  --git-sha <sha>            record SHA into baseline JSON
  --compare                  after run (or with --current), diff vs baseline
  --current <path>           JSON to treat as current (implies --compare; skips run)
  --baseline <path>          baseline JSON path                 (default: bench/baseline/results.json)
  --threshold <n>            cursor-mean regression ratio       (default: 1.5)
  --fail-on-regression       exit 1 if any cell ≥ threshold
  --comment-out <path>       write compare markdown to path (for PR comments)
  --help                     show this help

Examples:
  pnpm bench --quick
  pnpm bench --update-baseline
  pnpm bench --dialect postgres,sqlite --compare --fail-on-regression
  pnpm bench --compare --current bench/results/latest-results.json
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

const main = async () => {
  const argv = process.argv.slice(2)
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    printHelp()
    return
  }

  const compareMode = hasFlag(argv, '--compare') || getFlag(argv, '--current') !== undefined
  const currentPath = getFlag(argv, '--current')
  const baselinePath =
    getFlag(argv, '--baseline') ?? resolve(DEFAULT_BASELINE_JSON)
  const baselineDir = getFlag(argv, '--baseline-dir') ?? DEFAULT_BASELINE_DIR
  const threshold = Number(getFlag(argv, '--threshold') ?? DEFAULT_REGRESSION_THRESHOLD)
  const failOnRegression = hasFlag(argv, '--fail-on-regression')
  const updateBaseline = hasFlag(argv, '--update-baseline')
  const commentOut = getFlag(argv, '--comment-out')
  const gitSha = getFlag(argv, '--git-sha') ?? process.env.GITHUB_SHA

  // Compare-only path: no containers / no run.
  if (currentPath) {
    const current = await loadBaseline(resolve(currentPath))
    await runCompare({
      current,
      baselinePath,
      threshold,
      failOnRegression,
      commentOut,
    })
    return
  }

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
      console.warn(
        `\nNo baseline at ${baselinePath} — skip compare (commit one with --update-baseline).`,
      )
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

  if (updateBaseline) {
    const summary = renderBaselineMarkdown(baseline, report)
    const paths = await writeBaseline(baseline, baselineDir, summary)
    console.log(`  baseline: ${paths.jsonPath}`)
    console.log(`  summary:  ${paths.mdPath}`)
  }
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
  const md = renderCompareMarkdown(result)

  process.stdout.write(`\n${md}\n`)

  if (opts.commentOut) {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(opts.commentOut), { recursive: true })
    await writeFile(opts.commentOut, md, 'utf8')
    console.log(`Compare comment written: ${opts.commentOut}`)
  }

  // Local/dev baselines have no gitSha. Absolute ms is not comparable to CI runners,
  // so only enforce --fail-on-regression when the baseline itself was CI-produced.
  const enforce =
    opts.failOnRegression &&
    (Boolean(baseline.gitSha) || process.env.CI !== 'true')

  if (opts.failOnRegression && !enforce) {
    console.warn(
      '\nSkipping fail-on-regression: baseline has no gitSha (not yet produced on CI). ' +
        'Comment/report only until main records a CI baseline.',
    )
  }

  if (enforce && hasRegressions(result)) {
    console.error(
      `\nBenchmark regression: ${result.regressions.length} cell(s) ≥ ${opts.threshold}× baseline cursor mean.`,
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nBenchmark failed:')
  console.error(err)
  process.exitCode = 1
})
