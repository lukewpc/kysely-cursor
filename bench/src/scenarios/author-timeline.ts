import { feedSorts } from '../schema.js'
import type { ScenarioContext, ScenarioResult } from '../types.js'
import {
  authorPostsQuery,
  buildComparisons,
  runDepthSweep,
  timeBothStrategies,
  walkCursor,
  walkOffset,
} from './helpers.js'

/**
 * Per-author timeline: WHERE author_id = ? ORDER BY created_at DESC, id DESC.
 *
 * The seed plants hotAuthorId on every 50th row so this set has real depth
 * (~rowCount/50). Compares deep pages and a short sequential walk.
 */
export const runAuthorTimeline = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, pageSize, hotAuthorId } = ctx
  const query = () => authorPostsQuery(handle, hotAuthorId)
  const sorts = feedSorts

  // ~2% of rows belong to the hot author (every 50th).
  const authorRows = Math.floor(ctx.totalRows / 50)
  const maxDepth = Math.max(0, Math.floor(authorRows / pageSize) - 1)
  const depths = [0, 5, 10, 25, 50].filter((d) => d <= maxDepth)
  const walkPages = Math.min(ctx.walkPages, maxDepth + 1)

  const { samples, labels } = await runDepthSweep({
    ctx,
    query,
    sorts,
    depths,
    logPrefix: 'author-timeline',
  })

  if (walkPages > 1) {
    const label = `walk=${walkPages}`
    labels.push(label)
    process.stdout.write(`    author-timeline ${label}…\n`)
    const batch = await timeBothStrategies({
      ctx,
      label,
      cursorFn: () => walkCursor(handle.paginator, query, sorts, pageSize, walkPages),
      offsetFn: () => walkOffset(handle.paginator, query, sorts, pageSize, walkPages),
    })
    samples.push(...batch)
  }

  return {
    scenario: 'author-timeline',
    title: `Author timeline (author_id = ${hotAuthorId})`,
    description:
      'WHERE author_id = hotAuthor ORDER BY created_at DESC, id DESC. Models a user profile / activity feed over a selective secondary key. Index: (author_id, created_at, id).',
    samples,
    comparisons: buildComparisons(handle.name, 'author-timeline', samples, labels),
  }
}
