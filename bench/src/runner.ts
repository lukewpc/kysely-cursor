import type { BenchConfig } from './config.js'
import { getFactory } from './dialects/index.js'
import { captureDeepPlans } from './plans.js'
import { runAllScenarios } from './scenarios/index.js'
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

      const scenarios = await runAllScenarios(ctx)

      const deepest = cfg.deepPageDepths[cfg.deepPageDepths.length - 1] ?? 0
      process.stdout.write(`  capturing query plans at depth=${deepest}…\n`)
      const plans = await captureDeepPlans(handle, cfg.pageSize, deepest)

      dialects.push({
        dialect: name,
        rowCount: totalRows,
        scenarios,
        plans: plans.length ? plans : undefined,
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
    },
    dialects,
  }
}
