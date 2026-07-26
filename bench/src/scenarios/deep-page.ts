import { feedSorts } from '../schema.js'
import type { ScenarioContext, ScenarioResult } from '../types.js'
import { basePostsQuery, buildComparisons, runDepthSweep } from './helpers.js'

/**
 * Fair single-page comparison at increasing depths.
 *
 * Cursor tokens for each depth are pre-resolved *outside* the timer so we
 * measure only the page fetch itself — the cost users pay on every request
 * when the client already holds a page token.
 *
 * Offset is given the equivalent skip: `depth * pageSize`.
 *
 * Expectation: cursor stays flat; offset grows with depth.
 */
export const runDeepPage = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, deepPageDepths } = ctx
  const { samples, labels } = await runDepthSweep({
    ctx,
    query: () => basePostsQuery(handle),
    sorts: feedSorts,
    depths: deepPageDepths,
    logPrefix: 'deep-page',
  })

  return {
    scenario: 'deep-page',
    title: 'Deep page (single request at depth N)',
    description:
      'Library API: one page at increasing depths. Cursor tokens are pre-resolved so only the page query is timed. Offset uses OFFSET = depth × pageSize. Feed sorts use notNull: true; emission is dialect-specific (PG/SQLite row compare, MSSQL plain OR, MySQL null-safe OR) plus the token codec.',
    samples,
    comparisons: buildComparisons(handle.name, 'deep-page', samples, labels),
  }
}
