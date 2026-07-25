/**
 * Pure CI-gate predicate for bench compare.
 * Intentionally free of kysely / kysely-cursor imports so unit tests can
 * typecheck from the root package without a built dist/.
 */
import type { DialectName } from './config.js'

export const DEFAULT_REGRESSION_THRESHOLD = 1.5

/**
 * Shallow depths and sub-ms cells are dominated by runner noise on GHA.
 * Only enforce fail-on-regression for library pages at this depth and deeper.
 */
export const MIN_GATE_DEPTH = 100

/**
 * Minimum absolute cursor-mean slowdown (ms) required to fail CI, in addition
 * to the ratio threshold. Ratio-only spikes on flat sub-ms cells (e.g. +0.28ms
 * at 1.73×) are runner noise, not library regressions.
 *
 * Remote dialects (Docker RTT on GHA) use 2ms; in-process sqlite uses 0.5ms.
 */
export const MIN_ABS_MS: Record<DialectName, number> = {
  postgres: 2,
  mysql: 2,
  mssql: 2,
  sqlite: 0.5,
}

/**
 * Scenarios that can fail CI. Others (scoreboard, filtered-feed, author-timeline,
 * ideal-baseline) stay informational — noisier on GHA and secondary signals.
 */
export const GATING_SCENARIOS = new Set(['deep-page', 'sequential-walk'])

/** Minimal cell shape for gating (structurally satisfied by CellDelta). */
export type GateCell = {
  status: 'regression' | 'improvement' | 'stable'
  scenario: string
  label: string
  dialect: DialectName
  baseline: { cursorMean: number }
  current: { cursorMean: number }
}

/** Absolute cursor-mean delta in ms (current − baseline). */
export const cursorDeltaMs = (d: GateCell): number => d.current.cursorMean - d.baseline.cursorMean

/**
 * Whether a cell regression should fail CI (`--fail-on-regression`).
 * Still listed in the report when true or false; only gating ones set exit 1.
 *
 * Fail only when all hold:
 * 1. status is regression (ratio ≥ threshold)
 * 2. scenario is deep-page or sequential-walk
 * 3. depth ≥ MIN_GATE_DEPTH or walk label
 * 4. absolute delta ≥ MIN_ABS_MS[dialect]
 */
export const isGatingRegression = (d: GateCell): boolean => {
  if (d.status !== 'regression') return false
  if (!GATING_SCENARIOS.has(d.scenario)) return false
  if (cursorDeltaMs(d) < MIN_ABS_MS[d.dialect]) return false

  const depthMatch = /^depth=(\d+)$/.exec(d.label)
  if (depthMatch) {
    return Number(depthMatch[1]) >= MIN_GATE_DEPTH
  }

  // sequential-walk labels (`walk=N`).
  if (d.label.startsWith('walk=')) return true

  return false
}
