import { feedSorts } from '../schema.js'
import type { ScenarioContext, ScenarioResult } from '../types.js'
import { basePostsQuery, buildComparisons, timeBothStrategies, walkCursor, walkOffset } from './helpers.js'

/**
 * End-to-end multi-page walk — the “infinite scroll” / API crawl pattern.
 *
 * Each measured sample walks `walkPages` consecutive pages using either
 * chained keyset tokens or increasing offsets. Total wall time is reported.
 *
 * Expectation: cursor walk grows roughly O(pages); offset walk grows worse
 * because later pages each re-skip an ever-larger prefix.
 */
export const runSequentialWalk = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, pageSize, walkPages } = ctx
  const query = () => basePostsQuery(handle)
  const sorts = feedSorts
  const label = `walk=${walkPages}`

  process.stdout.write(`    sequential-walk ${label}…\n`)

  const samples = await timeBothStrategies({
    ctx,
    label,
    cursorFn: () => walkCursor(handle.paginator, query, sorts, pageSize, walkPages),
    offsetFn: () => walkOffset(handle.paginator, query, sorts, pageSize, walkPages),
  })

  return {
    scenario: 'sequential-walk',
    title: 'Sequential walk (N consecutive pages)',
    description:
      'Walks N pages end-to-end. Cursor chains nextPage tokens; offset uses page×limit. Models infinite-scroll feeds and bulk crawlers. Offset pays the cumulative skip cost on every later page.',
    samples,
    comparisons: buildComparisons(handle.name, 'sequential-walk', samples, [label]),
  }
}
