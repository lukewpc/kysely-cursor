import { scoreSorts } from '../schema.js'
import type { ScenarioContext, ScenarioResult } from '../types.js'
import { basePostsQuery, buildComparisons, runDepthSweep } from './helpers.js'

/**
 * Ranking / leaderboard: ORDER BY score DESC, id DESC.
 *
 * Uses the `(score, id)` index. Same depth-sweep shape as deep-page, but a
 * non-time secondary sort so we exercise scoreSorts (not only chronological).
 */
export const runScoreboard = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, deepPageDepths } = ctx

  // Score values are denser than unique timestamps; cap depth list like filtered-feed.
  const depths = deepPageDepths.slice(0, 6)

  const { samples, labels } = await runDepthSweep({
    ctx,
    query: () => basePostsQuery(handle),
    sorts: scoreSorts,
    depths,
    logPrefix: 'scoreboard',
  })

  return {
    scenario: 'scoreboard',
    title: 'Scoreboard (ORDER BY score DESC, id DESC)',
    description:
      'Full-table ranking by score with id as tie-breaker. Models leaderboards and “top N” feeds. Index: (score, id). Sorts use nullable: false (score and id are NOT NULL).',
    samples,
    comparisons: buildComparisons(handle.name, 'scoreboard', samples, labels),
  }
}
