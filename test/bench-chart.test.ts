import { chartNum, renderDeepPageImageGrid, renderDeepPagePng } from '../bench/src/chart.js'

describe('chartNum', () => {
  it('formats chart numbers by magnitude', () => {
    expect(chartNum(0.294)).toBe('0.294')
    expect(chartNum(1.5)).toBe('1.50')
    expect(chartNum(12.34)).toBe('12.3')
    expect(chartNum(150.2)).toBe('150')
  })
})

describe('renderDeepPageImageGrid', () => {
  it('lays out four dialects in a 2×2 markdown image table', () => {
    const md = renderDeepPageImageGrid(['mssql', 'mysql', 'postgres', 'sqlite'], (d) => `charts/${d}.png`)

    expect(md).toContain('| :---: | :---: |')
    expect(md).toContain('![mssql deep-page](charts/mssql.png)')
    expect(md).toContain('![sqlite deep-page](charts/sqlite.png)')
    expect(md.split('\n').filter((l) => l.startsWith('| ![') || l.startsWith('|  ')).length).toBeGreaterThanOrEqual(2)
  })

  it('pads an odd last cell', () => {
    const md = renderDeepPageImageGrid(['postgres'], (d) => `https://example.com/${d}.png`)
    expect(md).toContain('![postgres deep-page](https://example.com/postgres.png)')
    expect(md).toMatch(/\| {1,3}\|$/)
  })

  it('returns empty when no dialects', () => {
    expect(renderDeepPageImageGrid([], () => '')).toBe('')
  })
})

describe('renderDeepPagePng', () => {
  it('renders a PNG buffer for dual series', async () => {
    const buf = await renderDeepPagePng('postgres', [
      { depth: 0, baselineMs: 1.18, currentMs: 1.25 },
      { depth: 100, baselineMs: 0.757, currentMs: 0.729 },
      { depth: 500, baselineMs: 0.594, currentMs: 0.587 },
    ])

    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(1000)
    // PNG signature
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })
})
