import type { BenchConfig } from './config.js'
import { getFactory } from './dialects/index.js'
import { captureDeepPlans } from './plans.js'
import { runScenarios } from './scenarios/index.js'
import { countPosts } from './seed.js'
import type { BenchReport, DialectResult, ScenarioContext } from './types.js'

export const runBenchmarks = async (cfg: BenchConfig): Promise<BenchReport> => {
  const dialects: DialectResult[] = []

  for (const name of cfg.dialects) {
    process.stdout.write(`\n▶ dialect: ${name}\n`)
    const factory = getFactory(name)
    const handle = await factory.setup({
      rowCount: cfg.rowCount,
      hotAuthorId: cfg.hotAuthorId,
    })

    try {
      const totalRows = await countPosts(handle.db)
      process.stdout.write(`  ready — ${totalRows.toLocaleString()} rows\n`)

      const ctx: ScenarioContext = {
        handle,
        pageSize: cfg.pageSize,
        iterations: cfg.iterations,
        warmup: cfg.warmup,
        deepPageDepths: cfg.deepPageDepths,
        walkPages: cfg.walkPages,
        hotAuthorId: cfg.hotAuthorId,
        totalRows,
      }

      const scenarios = await runScenarios(ctx, cfg.scenarios)

      // Plans only when deep-page (or any depth sweep) ran — skip ideal-only / walk-only noise.
      const deepest = cfg.deepPageDepths[cfg.deepPageDepths.length - 1] ?? 0
      let plans: string[] | undefined
      if (cfg.scenarios.includes('deep-page') || cfg.scenarios.includes('ideal-baseline')) {
        process.stdout.write(`  capturing query plans at depth=${deepest}…\n`)
        plans = await captureDeepPlans(handle, cfg.pageSize, deepest)
        if (!plans.length) plans = undefined
      }

      dialects.push({
        dialect: name,
        rowCount: totalRows,
        scenarios,
        plans,
      })
    } finally {
      process.stdout.write(`  disposing ${name}…\n`)
      await handle.dispose()
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    config: {
      rowCount: cfg.rowCount,
      pageSize: cfg.pageSize,
      deepPageDepths: cfg.deepPageDepths,
      walkPages: cfg.walkPages,
      iterations: cfg.iterations,
      warmup: cfg.warmup,
      dialects: cfg.dialects,
      scenarios: cfg.scenarios,
    },
    dialects,
  }
}
