import type { SelectQueryBuilder } from 'kysely'
import { sql } from 'kysely'

import type { DialectName } from '../config.js'
import { applyPageWindow } from '../dialects/query.js'
import { measure, samplesFor, summarize } from '../metrics.js'
import type { BenchDB, ComparisonRow, Post, Sample, ScenarioContext, ScenarioResult } from '../types.js'

/**
 * Raw SQL keyset matching library emission for feed sorts with `nullable: false`.
 *
 * | Dialect  | Library path                     | Ideal baseline SQL        |
 * |----------|----------------------------------|---------------------------|
 * | postgres | row_compare                      | `(created_at, id) < (?,?)`|
 * | sqlite   | row_compare                      | same                      |
 * | mysql    | null_safe_or                     | IS NOT NULL guards + OR   |
 * | mssql    | plain_or                         | classic OR, no null guards|
 */
export type IdealKeysetForm = 'row_compare' | 'null_safe_or' | 'plain_or'

export const idealKeysetFormFor = (dialect: DialectName): IdealKeysetForm => {
  switch (dialect) {
    case 'mysql':
      return 'null_safe_or'
    case 'mssql':
      return 'plain_or'
    case 'postgres':
    case 'sqlite':
      return 'row_compare'
  }
}

type PostsQuery = SelectQueryBuilder<BenchDB, 'posts', Post>

const applyIdealKeyset = (
  form: IdealKeysetForm,
  q: PostsQuery,
  boundary: { id: number; created_at: Date },
): PostsQuery => {
  const b = boundary

  if (form === 'row_compare') {
    return q.where(sql<boolean>`(created_at, id) < (${b.created_at}, ${b.id})`)
  }

  if (form === 'plain_or') {
    return q.where((eb) =>
      eb.or([eb('created_at', '<', b.created_at), eb.and([eb('created_at', '=', b.created_at), eb('id', '<', b.id)])]),
    )
  }

  // null_safe_or — matches library default / MySQL optimized path
  return q.where((eb) =>
    eb.or([
      eb.and([eb('created_at', 'is not', null), eb('created_at', '<', b.created_at)]),
      eb.and([
        eb('created_at', 'is not', null),
        eb('created_at', '=', b.created_at),
        eb('id', 'is not', null),
        eb('id', '<', b.id),
      ]),
    ]),
  )
}

const describeForm = (form: IdealKeysetForm): string => {
  switch (form) {
    case 'row_compare':
      return (
        'Raw keyset via row comparison `(created_at, id) < ($1, $2)` vs OFFSET — ' +
        'same shape as library deep-page with `nullable: false` (no token codec).'
      )
    case 'null_safe_or':
      return (
        'Raw keyset via null-safe OR (MySQL library path even with `nullable: false`) ' +
        'vs OFFSET — no library wrappers or token codec.'
      )
    case 'plain_or':
      return (
        'Raw keyset via classic OR (`created_at < $1 OR (created_at = $1 AND id < $2)`) ' +
        'vs OFFSET — same shape as library deep-page on MSSQL (no token codec).'
      )
  }
}

export const runIdealBaseline = async (ctx: ScenarioContext): Promise<ScenarioResult> => {
  const { handle, pageSize, deepPageDepths, iterations, warmup } = ctx
  const depths = deepPageDepths.filter((d) => d === 0 || d >= 50).slice(0, 6)
  const samples: Sample[] = []
  const labels: string[] = []
  const form = idealKeysetFormFor(handle.name)
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
      let q: PostsQuery = handle.db
        .selectFrom('posts')
        .select(['id', 'author_id', 'title', 'body', 'status', 'score', 'created_at'])
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')

      if (boundary) {
        q = applyIdealKeyset(form, q, boundary)
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
    title: `Ideal keyset baseline (raw SQL, ${form}, no library)`,
    description: describeForm(form),
    samples,
    comparisons,
  }
}
