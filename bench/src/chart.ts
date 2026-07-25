/**
 * Deep-page compare charts as real PNG images (Chart.js + @napi-rs/canvas).
 * Kept free of kysely-cursor imports so unit tests typecheck without dist/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createCanvas } from '@napi-rs/canvas'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Title, Filler)

export type DepthSeriesPoint = {
  depth: number
  baselineMs: number
  currentMs: number
}

export type DialectDeepPageChart = {
  dialect: string
  points: DepthSeriesPoint[]
}

/** Round for table legends. */
export const chartNum = (ms: number): string => {
  if (!Number.isFinite(ms)) return '0'
  if (ms >= 100) return ms.toFixed(0)
  if (ms >= 10) return ms.toFixed(1)
  if (ms >= 1) return ms.toFixed(2)
  return ms.toFixed(3)
}

const CHART_W = 360
const CHART_H = 200

/** Render one dialect deep-page baseline-vs-current line chart to PNG. */
export const renderDeepPagePng = async (dialect: string, points: DepthSeriesPoint[]): Promise<Buffer> => {
  const ordered = [...points].sort((a, b) => a.depth - b.depth)
  const canvas = createCanvas(CHART_W, CHART_H)
  const ctx = canvas.getContext('2d')

  // Opaque white background (GitHub / dark mode friendly borders).
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CHART_W, CHART_H)

  const chart = new Chart(ctx as unknown as CanvasRenderingContext2D, {
    type: 'line',
    data: {
      labels: ordered.map((p) => String(p.depth)),
      datasets: [
        {
          label: 'baseline',
          data: ordered.map((p) => p.baselineMs),
          borderColor: '#6b7280',
          backgroundColor: 'rgba(107, 114, 128, 0.06)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 4,
          tension: 0.25,
          fill: false,
        },
        {
          label: 'current',
          data: ordered.map((p) => p.currentMs),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.06)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 4,
          tension: 0.25,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
      layout: { padding: { top: 4, right: 8, bottom: 0, left: 4 } },
      plugins: {
        title: {
          display: true,
          text: `${dialect} · deep-page (ms)`,
          font: { size: 12, weight: 'bold' },
          color: '#111827',
          padding: { bottom: 6 },
        },
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 }, color: '#374151', padding: 8 },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'depth', font: { size: 10 }, color: '#6b7280' },
          ticks: { font: { size: 10 }, color: '#4b5563' },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'ms', font: { size: 10 }, color: '#6b7280' },
          ticks: { font: { size: 10 }, color: '#4b5563' },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    },
  })

  chart.update('none')
  const buf = Buffer.from(canvas.toBuffer('image/png'))
  chart.destroy()
  return buf
}

/** Write one PNG per dialect; returns map dialect → absolute file path. */
export const writeDeepPageCharts = async (
  charts: DialectDeepPageChart[],
  outDir: string,
): Promise<Map<string, string>> => {
  await mkdir(outDir, { recursive: true })
  const paths = new Map<string, string>()
  for (const { dialect, points } of charts) {
    if (points.length === 0) continue
    const file = join(outDir, `${dialect}.png`)
    const png = await renderDeepPagePng(dialect, points)
    await writeFile(file, png)
    paths.set(dialect, file)
  }
  return paths
}

/**
 * 2×2 markdown image grid. `urlFor(dialect)` must return an https URL for
 * GitHub sticky comments (relative paths do not load there).
 */
export const renderDeepPageImageGrid = (dialects: string[], urlFor: (dialect: string) => string): string => {
  if (dialects.length === 0) return ''

  const cell = (d: string | undefined): string => (d ? `![${d} deep-page](${urlFor(d)})` : ' ')

  const rows: string[] = ['| | |', '| :---: | :---: |']
  for (let i = 0; i < dialects.length; i += 2) {
    rows.push(`| ${cell(dialects[i])} | ${cell(dialects[i + 1])} |`)
  }
  return rows.join('\n')
}
