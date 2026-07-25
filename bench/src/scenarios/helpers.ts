import type { SelectQueryBuilder } from 'kysely'
import type { Paginator } from 'kysely-cursor'

import { measure, samplesFor, summarize } from '../metrics.js'
import type {
  ComparisonRow,
  DialectHandle,
  Post,
  Sample,
  ScenarioContext,
  ScenarioId,
  Strategy,
} from '../types.js'

export type QueryFactory = () => SelectQueryBuilder<any, any, Post>

export type SortSpec = readonly { col: any; dir?: any; output?: any; nulls?: any }[]

/**
 * Walk forward `depth` pages with keyset cursors and return the nextPage token
 * for the page at that depth (i.e. the token needed to fetch page `depth`).
 * depth=0 => no token (first page).
 */
export const resolveCursorAtDepth = async (
  paginator: Paginator,
  query: QueryFactory,
  sorts: SortSpec,
  limit: number,
  depth: number,
): Promise<string | undefined> => {
  if (depth <= 0) return undefined

  let token: string | undefined
  for (let i = 0; i < depth; i++) {
    const page = await paginator.paginate({
      query: query(),
      sorts: sorts as any,
      limit,
      cursor: token ? { nextPage: token } : undefined,
    })
    if (!page.nextPage) {
      throw new Error(`Ran out of pages while resolving cursor at depth ${depth} (stopped at ${i})`)
    }
    token = page.nextPage
  }
  return token
}

/** Single page fetch via keyset cursor (token pre-resolved outside the timer). */
export const fetchCursorPage = async (
  paginator: Paginator,
  query: QueryFactory,
  sorts: SortSpec,
  limit: number,
  nextPageToken: string | undefined,
): Promise<number> => {
  const page = await paginator.paginate({
    query: query(),
    sorts: sorts as any,
    limit,
    cursor: nextPageToken ? { nextPage: nextPageToken } : undefined,
  })
  return page.items.length
}

/** Single page fetch via offset. */
export const fetchOffsetPage = async (
  paginator: Paginator,
  query: QueryFactory,
  sorts: SortSpec,
  limit: number,
  offset: number,
): Promise<number> => {
  const page = await paginator.paginate({
    query: query(),
    sorts: sorts as any,
    limit,
    cursor: { offset },
  })
  return page.items.length
}

/** Walk `pages` pages using keyset nextPage tokens. Returns total rows seen. */
export const walkCursor = async (
  paginator: Paginator,
  query: QueryFactory,
  sorts: SortSpec,
  limit: number,
  pages: number,
): Promise<number> => {
  let token: string | undefined
  let total = 0
  for (let i = 0; i < pages; i++) {
    const page = await paginator.paginate({
      query: query(),
      sorts: sorts as any,
      limit,
      cursor: token ? { nextPage: token } : undefined,
    })
    total += page.items.length
    if (!page.nextPage) break
    token = page.nextPage
  }
  return total
}

/** Walk `pages` pages using increasing offsets. Returns total rows seen. */
export const walkOffset = async (
  paginator: Paginator,
  query: QueryFactory,
  sorts: SortSpec,
  limit: number,
  pages: number,
): Promise<number> => {
  let total = 0
  for (let i = 0; i < pages; i++) {
    const page = await paginator.paginate({
      query: query(),
      sorts: sorts as any,
      limit,
      cursor: { offset: i * limit },
    })
    total += page.items.length
    if (page.items.length < limit) break
  }
  return total
}

/** Select list includes non-indexed `body` so deep OFFSET cannot be index-only. */
const POST_COLUMNS = ['id', 'author_id', 'title', 'body', 'status', 'score', 'created_at'] as const

export const basePostsQuery = (handle: DialectHandle) =>
  handle.db.selectFrom('posts').select(POST_COLUMNS)

export const publishedPostsQuery = (handle: DialectHandle) =>
  handle.db.selectFrom('posts').select(POST_COLUMNS).where('status', '=', 'published')

export const authorPostsQuery = (handle: DialectHandle, authorId: number) =>
  handle.db.selectFrom('posts').select(POST_COLUMNS).where('author_id', '=', authorId)

export const buildComparisons = (
  dialect: ScenarioContext['handle']['name'],
  scenario: ScenarioId,
  samples: Sample[],
  labels: string[],
): ComparisonRow[] => {
  const rows: ComparisonRow[] = []
  for (const label of labels) {
    const cursor = summarize(samplesFor(samples, 'cursor', label))
    const offset = summarize(samplesFor(samples, 'offset', label))
    if (cursor.n === 0 || offset.n === 0) continue
    const speedup = cursor.mean > 0 ? offset.mean / cursor.mean : Number.POSITIVE_INFINITY
    rows.push({
      dialect,
      scenario,
      label,
      cursor,
      offset,
      speedup,
      deltaMs: offset.mean - cursor.mean,
    })
  }
  return rows
}

export const timeBothStrategies = async (opts: {
  ctx: ScenarioContext
  label: string
  cursorFn: () => Promise<number>
  offsetFn: () => Promise<number>
}): Promise<Sample[]> => {
  const { ctx, label, cursorFn, offsetFn } = opts
  const cursorSamples = await measure({
    strategy: 'cursor',
    label,
    iterations: ctx.iterations,
    warmup: ctx.warmup,
    fn: cursorFn,
  })
  const offsetSamples = await measure({
    strategy: 'offset',
    label,
    iterations: ctx.iterations,
    warmup: ctx.warmup,
    fn: offsetFn,
  })
  return [...cursorSamples, ...offsetSamples]
}

export type { Strategy }
