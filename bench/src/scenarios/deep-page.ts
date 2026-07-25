import { feedSorts } from '../schema.js'
import type { ScenarioContext, ScenarioResult } from '../types.js'
import {
  basePostsQuery,
  buildComparisons,
  fetchCursorPage,
  fetchOffsetPage,
  resolveCursorAtDepth,
  timeBothStrategies,
} from './helpers.js'

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
  const { handle, pageSize, deepPageDepths } = ctx
  const query = () => basePostsQuery(handle)
  const sorts = feedSorts
  const samples = []

  for (const depth of deepPageDepths) {
    const label = `depth=${depth}`
    process.stdout.write(`    deep-page ${label}…\n`)

    const token = await resolveCursorAtDepth(handle.paginator, query, sorts, pageSize, depth)
    const offset = depth * pageSize

    const batch = await timeBothStrategies({
      ctx,
      label,
      cursorFn: () => fetchCursorPage(handle.paginator, query, sorts, pageSize, token),
      offsetFn: () => fetchOffsetPage(handle.paginator, query, sorts, pageSize, offset),
    })
    samples.push(...batch)
  }

  return {
    scenario: 'deep-page',
    title: 'Deep page (single request at depth N)',
    description:
      'Library API: one page at increasing depths. Cursor tokens are pre-resolved so only the page query is timed. Offset uses OFFSET = depth × pageSize. Measures createPaginator cursor vs offset paths as the library emits them (null-safe keyset predicates + token codec).',
    samples,
    comparisons: buildComparisons(handle.name, 'deep-page', samples, deepPageDepths.map((d) => `depth=${d}`)),
  }
}
