import type { ScenarioContext, ScenarioId, ScenarioResult } from '../types.js'
import { runAuthorTimeline } from './author-timeline.js'
import { runDeepPage } from './deep-page.js'
import { runFilteredFeed } from './filtered-feed.js'
import { runIdealBaseline } from './ideal-baseline.js'
import { runScoreboard } from './scoreboard.js'
import { runSequentialWalk } from './sequential-walk.js'

type Runner = (ctx: ScenarioContext) => Promise<ScenarioResult>

const RUNNERS: Record<ScenarioId, Runner> = {
  'deep-page': runDeepPage,
  'sequential-walk': runSequentialWalk,
  'filtered-feed': runFilteredFeed,
  'author-timeline': runAuthorTimeline,
  scoreboard: runScoreboard,
  'ideal-baseline': runIdealBaseline,
}

export const runScenarios = async (ctx: ScenarioContext, scenarios: ScenarioId[]): Promise<ScenarioResult[]> => {
  const results: ScenarioResult[] = []

  for (const id of scenarios) {
    const run = RUNNERS[id]
    if (!run) throw new Error(`No runner registered for scenario "${id}"`)
    process.stdout.write(`  scenario: ${id}\n`)
    results.push(await run(ctx))
  }

  return results
}
