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
  | 'scoreboard'
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

export type BenchReportConfig = {
  rowCount: number
  pageSize: number
  deepPageDepths: number[]
  walkPages: number
  iterations: number
  warmup: number
  dialects: DialectName[]
}

export type BenchReport = {
  generatedAt: string
  config: BenchReportConfig
  dialects: DialectResult[]
}

/** One measurement cell used for baselining and PR diffs (no raw samples). */
export type BaselineCell = {
  dialect: DialectName
  scenario: ScenarioId
  label: string
  cursorMean: number
  cursorP50: number
  cursorP95: number
  offsetMean: number
  offsetP50: number
  offsetP95: number
  speedup: number
  deltaMs: number
}

/**
 * Committed / CI-facing artifact. Small enough to keep in git and comment on PRs.
 * Version bumps if the shape changes incompatibly.
 */
export type BaselineReport = {
  version: 1
  generatedAt: string
  /** Optional git SHA when produced in CI. */
  gitSha?: string
  config: BenchReportConfig
  cells: BaselineCell[]
}

export type CellDelta = {
  key: string
  dialect: DialectName
  scenario: ScenarioId
  label: string
  baseline: BaselineCell
  current: BaselineCell
  /** current.cursorMean / baseline.cursorMean */
  cursorRatio: number
  /** current.speedup / baseline.speedup (if both finite) */
  speedupRatio: number | null
  status: 'regression' | 'improvement' | 'stable'
}

export type CompareResult = {
  baseline: BaselineReport
  current: BaselineReport
  /** Absolute cursor-mean ratio above which a cell is a regression (e.g. 1.5). */
  threshold: number
  matched: CellDelta[]
  missingInCurrent: BaselineCell[]
  newInCurrent: BaselineCell[]
  regressions: CellDelta[]
  improvements: CellDelta[]
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
