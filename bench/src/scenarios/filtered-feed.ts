import { feedSorts } from '../schema.js'
import type { ScenarioContext, ScenarioResult } from '../types.js'
import { buildComparisons, publishedPostsQuery, runDepthSweep } from './helpers.js'

/**
 * Filtered product feed: WHERE status = 'published' ORDER BY created_at DESC, id DESC.
 *
 * Uses a composite index on (status, created_at, id). Still compares cursor vs
 * offset at several depths inside the filtered set.
 */
export const runFilteredFeed = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, pageSize, deepPageDepths } = ctx

  // Fewer depths than deep-page — filtered set is ~70% of total.
  const depths = deepPageDepths.filter((d) => d <= Math.floor(ctx.totalRows * 0.7) / pageSize - 1).slice(0, 6)

  const { samples, labels } = await runDepthSweep({
    ctx,
    query: () => publishedPostsQuery(handle),
    sorts: feedSorts,
    depths,
    logPrefix: 'filtered-feed',
  })

  return {
    scenario: 'filtered-feed',
    title: 'Filtered feed (status = published)',
    description:
      "WHERE status = 'published' with the same created_at/id keyset. Models a product listing that filters a large table before paginating. Index: (status, created_at, id).",
    samples,
    comparisons: buildComparisons(handle.name, 'filtered-feed', samples, labels),
  }
}
