import { sql } from 'kysely'

import { applyPageWindow } from '../dialects/query.js'
import { measure, samplesFor, summarize } from '../metrics.js'
import type { ComparisonRow, Sample, ScenarioContext, ScenarioResult } from '../types.js'

/**
 * Educational baseline: pure SQL ideal keyset vs OFFSET, bypassing the library.
 *
 * Ideal keyset uses row comparison so planners can emit Index Cond seeks:
 *   WHERE (created_at, id) < ($1, $2)
 *   ORDER BY created_at DESC, id DESC LIMIT n
 *
 * Library deep-page / scoreboard sorts set `nullable: false` so they can emit
 * the same seek-friendly shape (row compare or plain OR) plus token codec cost.
 * Default (unmarked) library sorts still use null-safe OR trees
 * (`col IS NOT NULL AND col < $1 OR …`), which Postgres often plans as a Filter
 * over an index walk — comparable to OFFSET. Compare this scenario with
 * deep-page to isolate codec + library overhead on the optimized path.
 *
 * MSSQL has no row-value constructor comparison; we fall back to the classic
 * OR form there (still without the library’s IS NOT NULL wrappers).
 */
export const runIdealBaseline = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, pageSize, deepPageDepths, iterations, warmup } = ctx
  const depths = deepPageDepths.filter((d) => d === 0 || d >= 50).slice(0, 6)
  const samples: Sample[] = []
  const labels: string[] = []
  const useRowCompare = handle.name !== 'mssql'
  const dialect = handle.name

  for (const depth of depths) {
    const label = `depth=${depth}`
    labels.push(label)
    process.stdout.write(`    ideal-baseline ${label}…\n`)

    let boundary: { id: number; created_at: Date } | undefined
    if (depth > 0) {
      const boundaryQ = handle.db
        .selectFrom('posts')
        .select(['id', 'created_at'])
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
      boundary = await applyPageWindow(dialect, boundaryQ, 1, depth * pageSize - 1).executeTakeFirst()
      if (!boundary) continue
    }

    const idealFn = async () => {
      let q = handle.db
        .selectFrom('posts')
        .select(['id', 'author_id', 'title', 'body', 'status', 'score', 'created_at'])
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')

      if (boundary) {
        const b = boundary
        if (useRowCompare) {
          q = q.where(sql<boolean>`(created_at, id) < (${b.created_at}, ${b.id})`)
        } else {
          q = q.where((eb) =>
            eb.or([
              eb('created_at', '<', b.created_at),
              eb.and([eb('created_at', '=', b.created_at), eb('id', '<', b.id)]),
            ]),
          )
        }
      }

      const rows = await applyPageWindow(dialect, q, pageSize).execute()
      return rows.length
    }

    const offsetFn = async () => {
      const q = handle.db
        .selectFrom('posts')
        .select(['id', 'author_id', 'title', 'body', 'status', 'score', 'created_at'])
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
      const rows = await applyPageWindow(dialect, q, pageSize, depth * pageSize).execute()
      return rows.length
    }

    const cursorSamples = await measure({
      strategy: 'cursor',
      label,
      iterations,
      warmup,
      fn: idealFn,
    })
    const offsetSamples = await measure({
      strategy: 'offset',
      label,
      iterations,
      warmup,
      fn: offsetFn,
    })
    samples.push(...cursorSamples, ...offsetSamples)
  }

  const comparisons: ComparisonRow[] = []
  for (const label of labels) {
    const cursor = summarize(samplesFor(samples, 'cursor', label))
    const offset = summarize(samplesFor(samples, 'offset', label))
    if (cursor.n === 0 || offset.n === 0) continue
    comparisons.push({
      dialect: handle.name,
      scenario: 'ideal-baseline',
      label,
      cursor,
      offset,
      speedup: cursor.mean > 0 ? offset.mean / cursor.mean : Number.POSITIVE_INFINITY,
      deltaMs: offset.mean - cursor.mean,
    })
  }

  return {
    scenario: 'ideal-baseline',
    title: 'Ideal keyset baseline (raw SQL, no library)',
    description: useRowCompare
      ? 'Textbook keyset via row comparison `(created_at, id) < ($1, $2)` vs OFFSET — no library, no token codec. On Postgres this becomes an Index Cond seek (buffers ≪ OFFSET). Compare with library deep-page (`nullable: false`) to isolate codec/wrapper overhead on the same seek shape.'
      : 'Classic OR keyset (`created_at < $1 OR (created_at = $1 AND id < $2)`) vs OFFSET on MSSQL (no row-value comparison). No library wrappers or token codec.',
    samples,
    comparisons,
  }
}
