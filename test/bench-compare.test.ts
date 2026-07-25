/**
 * Unit tests for bench CI gate (ratio + absolute Δ).
 * Pure predicate only — no Docker / DB.
 *
 * Imports `bench/src/gate` (not compare/types) so root `tsc` does not need a
 * built `kysely-cursor` dist (CI typechecks before build).
 */
import type { DialectName } from '../bench/src/config.js'
import {
  cursorDeltaMs,
  DEFAULT_REGRESSION_THRESHOLD,
  type GateCell,
  GATING_SCENARIOS,
  isGatingRegression,
  MIN_ABS_MS,
  MIN_GATE_DEPTH,
} from '../bench/src/gate.js'

const delta = (opts: {
  dialect?: DialectName
  scenario?: string
  label?: string
  baseMs: number
  currMs: number
  status?: GateCell['status']
}): GateCell => ({
  dialect: opts.dialect ?? 'postgres',
  scenario: opts.scenario ?? 'deep-page',
  label: opts.label ?? 'depth=500',
  baseline: { cursorMean: opts.baseMs },
  current: { cursorMean: opts.currMs },
  status: opts.status ?? 'regression',
})

describe('isGatingRegression', () => {
  it('exposes the documented constants', () => {
    expect(DEFAULT_REGRESSION_THRESHOLD).toBe(1.5)
    expect(MIN_GATE_DEPTH).toBe(100)
    expect(MIN_ABS_MS.postgres).toBe(2)
    expect(MIN_ABS_MS.mysql).toBe(2)
    expect(MIN_ABS_MS.mssql).toBe(2)
    expect(MIN_ABS_MS.sqlite).toBe(0.5)
    expect([...GATING_SCENARIOS].sort()).toEqual(['deep-page', 'sequential-walk'])
  })

  it.each([
    {
      name: 'scoreboard never gates (secondary scenario)',
      d: delta({ baseMs: 0.38, currMs: 10, label: 'depth=500', scenario: 'scoreboard' }),
      gate: false,
    },
    {
      name: 'author-timeline walk does not gate (CI false positive shape)',
      d: delta({
        dialect: 'sqlite',
        baseMs: 7.28,
        currMs: 11.4,
        label: 'walk=40',
        scenario: 'author-timeline',
      }),
      gate: false,
    },
    {
      name: 'deep page under ratio: 0.8 → 1.1ms (1.38×) is not a regression status',
      d: delta({ baseMs: 0.8, currMs: 1.1, label: 'depth=500', scenario: 'deep-page', status: 'stable' }),
      gate: false,
    },
    {
      name: 'deep page real: 2ms → 4ms (2×, +2) gates',
      d: delta({ baseMs: 2, currMs: 4, label: 'depth=500', scenario: 'deep-page' }),
      gate: true,
    },
    {
      name: 'sequential-walk real: 25ms → 40ms (1.6×, +15) gates',
      d: delta({ baseMs: 25, currMs: 40, label: 'walk=200', scenario: 'sequential-walk' }),
      gate: true,
    },
    {
      name: 'sqlite deep-page below floor: 0.15 → 0.40ms (+0.25 < 0.5) does not gate',
      d: delta({ dialect: 'sqlite', baseMs: 0.15, currMs: 0.4, label: 'depth=500', scenario: 'deep-page' }),
      gate: false,
    },
    {
      name: 'sqlite deep-page at floor: 0.15 → 0.65ms (+0.5, 4.3×) gates',
      d: delta({ dialect: 'sqlite', baseMs: 0.15, currMs: 0.65, label: 'depth=500', scenario: 'deep-page' }),
      gate: true,
    },
    {
      name: 'shallow deep-page does not gate',
      d: delta({ baseMs: 1, currMs: 3, label: 'depth=10', scenario: 'deep-page' }),
      gate: false,
    },
    {
      name: 'ideal-baseline never gates',
      d: delta({ baseMs: 2, currMs: 10, label: 'depth=500', scenario: 'ideal-baseline' }),
      gate: false,
    },
    {
      name: 'filtered-feed never gates even at deep depth',
      d: delta({ baseMs: 2, currMs: 4, label: `depth=${MIN_GATE_DEPTH}`, scenario: 'filtered-feed' }),
      gate: false,
    },
    {
      name: 'ratio hit but Δ just under 2ms does not gate (postgres deep-page)',
      d: delta({ baseMs: 1, currMs: 2.9, label: 'depth=200', scenario: 'deep-page' }),
      gate: false,
    },
    {
      name: 'ratio hit and Δ ≥ 2ms gates (postgres deep-page)',
      d: delta({ baseMs: 1, currMs: 3, label: 'depth=200', scenario: 'deep-page' }),
      gate: true,
    },
    {
      name: 'improvement status never gates',
      d: delta({ baseMs: 4, currMs: 2, label: 'depth=500', scenario: 'deep-page', status: 'improvement' }),
      gate: false,
    },
  ])('$name', ({ d, gate }) => {
    expect(isGatingRegression(d)).toBe(gate)
  })

  it('cursorDeltaMs is current − baseline', () => {
    const d = delta({ baseMs: 1.5, currMs: 4 })
    expect(cursorDeltaMs(d)).toBeCloseTo(2.5)
  })
})
