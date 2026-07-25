import type { ScenarioContext, ScenarioResult } from '../types.js'
import { runAuthorTimeline } from './author-timeline.js'
import { runDeepPage } from './deep-page.js'
import { runFilteredFeed } from './filtered-feed.js'
import { runIdealBaseline } from './ideal-baseline.js'
import { runScoreboard } from './scoreboard.js'
import { runSequentialWalk } from './sequential-walk.js'

export const runAllScenarios = async (ctx: ScenarioContext): Promise<ScenarioResult[]> => {
  const results: ScenarioResult[] = []

  process.stdout.write('  scenario: deep-page\n')
  results.push(await runDeepPage(ctx))

  process.stdout.write('  scenario: sequential-walk\n')
  results.push(await runSequentialWalk(ctx))

  process.stdout.write('  scenario: filtered-feed\n')
  results.push(await runFilteredFeed(ctx))

  process.stdout.write('  scenario: author-timeline\n')
  results.push(await runAuthorTimeline(ctx))

  process.stdout.write('  scenario: scoreboard\n')
  results.push(await runScoreboard(ctx))

  process.stdout.write('  scenario: ideal-baseline\n')
  results.push(await runIdealBaseline(ctx))

  return results
}
