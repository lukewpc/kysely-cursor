#!/usr/bin/env node
import { describeConfig, parseArgs } from './config.js'
import { renderConsole, writeReports } from './report.js'
import { runBenchmarks } from './runner.js'

const printHelp = () => {
  console.log(
    `
kysely-cursor benchmarks — cursor vs offset pagination

Usage:
  pnpm bench [options]
  pnpm --filter kysely-cursor-bench bench [options]

Options:
  --dialect <name[,name…]>   postgres | mysql | mssql | sqlite  (default: all)
  --rows <n>                 rows to seed                       (default: 200000, quick: 20000)
  --page-size <n>            page size                          (default: 25)
  --depths <n,n,…>           deep-page depths (0-based)
                             default: 0,10,50,100,500,1000,2000,4000
                             quick:   0,10,50,200,400
  --walk-pages <n>           sequential-walk page count         (default: 150, quick: 40)
  --iterations <n>           timed iterations per measurement   (default: 12, quick: 5)
  --warmup <n>               warmup iterations                  (default: 3, quick: 1)
  --out <dir>                results directory                  (default: ./bench/results)
  --quick                    smaller dataset / fewer iterations
  --help                     show this help

Examples:
  pnpm bench --quick
  pnpm bench --dialect postgres,sqlite --rows 50000
  pnpm bench --dialect sqlite --depths 0,10,50,100 --iterations 20
`.trim(),
  )
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
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

  const { markdownPath, jsonPath } = await writeReports(report, cfg.resultsDir)
  console.log(`\nReports written:`)
  console.log(`  markdown: ${markdownPath}`)
  console.log(`  json:     ${jsonPath}`)
  console.log(`  total wall time: ${elapsed}s`)
}

main().catch((err) => {
  console.error('\nBenchmark failed:')
  console.error(err)
  process.exitCode = 1
})
