import type { Generated, Kysely, Selectable } from 'kysely'
import type { PaginationDialect, Paginator } from 'kysely-cursor'

import type { DialectName } from './config.js'

/** Realistic feed / listing table used by every dialect. */
export interface PostsTable {
  id: Generated<number>
  author_id: number
  title: string
  /** Non-indexed payload — forces heap fetches on skipped OFFSET rows. */
  body: string
  status: string
  score: number
  created_at: Date
}

export interface BenchDB {
  posts: PostsTable
}

export type Post = Selectable<PostsTable>

export type ScenarioId =
  | 'deep-page'
  | 'sequential-walk'
  | 'filtered-feed'
  | 'author-timeline'
  | 'ideal-baseline'

export type Strategy = 'cursor' | 'offset'

export type Sample = {
  strategy: Strategy
  /** Free-form label, e.g. "depth=100" or "walk=200 pages". */
  label: string
  /** Wall-clock milliseconds for one measured iteration. */
  ms: number
  /** Rows returned by the measured operation (sanity check). */
  rowCount: number
}

export type TimingStats = {
  n: number
  mean: number
  min: number
  max: number
  p50: number
  p95: number
  p99: number
  stdev: number
}

export type ComparisonRow = {
  dialect: DialectName
  scenario: ScenarioId
  label: string
  cursor: TimingStats
  offset: TimingStats
  /** How many times faster cursor is than offset (offset.mean / cursor.mean). */
  speedup: number
  /** Absolute mean delta in ms (offset.mean - cursor.mean). Positive => cursor faster. */
  deltaMs: number
}

export type ScenarioResult = {
  scenario: ScenarioId
  title: string
  description: string
  samples: Sample[]
  comparisons: ComparisonRow[]
}

export type DialectResult = {
  dialect: DialectName
  rowCount: number
  scenarios: ScenarioResult[]
  /** Optional plan snippets for qualitative reporting (postgres). */
  plans?: string[]
}

export type BenchReport = {
  generatedAt: string
  config: {
    rowCount: number
    pageSize: number
    deepPageDepths: number[]
    walkPages: number
    iterations: number
    warmup: number
    dialects: DialectName[]
  }
  dialects: DialectResult[]
}

export type DialectHandle = {
  name: DialectName
  db: Kysely<BenchDB>
  paginationDialect: PaginationDialect
  paginator: Paginator
  /** Tear down connections / containers. */
  dispose: () => Promise<void>
  /** Optional EXPLAIN helper used by the report (postgres only today). */
  explain?: (sql: string) => Promise<string>
}

export type ScenarioContext = {
  handle: DialectHandle
  pageSize: number
  iterations: number
  warmup: number
  deepPageDepths: number[]
  walkPages: number
  hotAuthorId: number
  totalRows: number
}
