import type { Sample, Strategy, TimingStats } from './types.js'

export const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]!
  const w = rank - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

export const summarize = (values: number[]): TimingStats => {
  if (values.length === 0) {
    return { n: 0, mean: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, stdev: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n

  return {
    n,
    mean,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stdev: Math.sqrt(variance),
  }
}

export const samplesFor = (samples: Sample[], strategy: Strategy, label: string): number[] =>
  samples.filter((s) => s.strategy === strategy && s.label === label).map((s) => s.ms)

export const formatMs = (ms: number): string => {
  if (!Number.isFinite(ms)) return 'n/a'
  if (ms < 1) return `${ms.toFixed(3)}ms`
  if (ms < 10) return `${ms.toFixed(2)}ms`
  if (ms < 100) return `${ms.toFixed(1)}ms`
  return `${Math.round(ms)}ms`
}

export const formatSpeedup = (speedup: number): string => {
  if (!Number.isFinite(speedup) || speedup <= 0) return 'n/a'
  if (speedup >= 100) return `${speedup.toFixed(0)}×`
  if (speedup >= 10) return `${speedup.toFixed(1)}×`
  return `${speedup.toFixed(2)}×`
}

/**
 * Run `fn` once for warmup, then `iterations` timed runs.
 * Returns one Sample per measured iteration.
 */
export const measure = async (opts: {
  strategy: Strategy
  label: string
  iterations: number
  warmup: number
  fn: () => Promise<number>
}): Promise<Sample[]> => {
  const { strategy, label, iterations, warmup, fn } = opts

  for (let i = 0; i < warmup; i++) {
    await fn()
  }

  const samples: Sample[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const rowCount = await fn()
    const ms = performance.now() - start
    samples.push({ strategy, label, ms, rowCount })
  }
  return samples
}
