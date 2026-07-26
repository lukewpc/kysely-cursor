import { applyPageWindow } from './dialects/query.js'
import type { DialectHandle } from './types.js'

/**
 * Capture EXPLAIN output at a deep page (Postgres only via DialectHandle.explain):
 * 1. Library seek path (`notNull: true` → row compare) — matches timed deep-page
 * 2. Library default null-safe OR — untimed reference (often Filter ≈ OFFSET)
 * 3. OFFSET — baseline skip plan
 */
export const captureDeepPlans = async (handle: DialectHandle, pageSize: number, depth: number): Promise<string[]> => {
  if (!handle.explain || depth <= 0) return []

  const boundaryQ = handle.db
    .selectFrom('posts')
    .select(['id', 'created_at'])
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
  const boundary = await applyPageWindow(handle.name, boundaryQ, 1, depth * pageSize - 1).executeTakeFirst()

  if (!boundary) return []

  const offset = depth * pageSize
  const createdAtLiteral = toPgTimestamptz(boundary.created_at)
  const plans: string[] = []

  // Library default for unmarked leading sorts (still available as fallback).
  const nullSafeSql = `
SELECT id, author_id, title, body, status, score, created_at
FROM posts
WHERE (
  (created_at IS NOT NULL AND created_at < ${createdAtLiteral})
  OR (
    created_at IS NOT NULL AND created_at = ${createdAtLiteral}
    AND (id IS NOT NULL AND id < ${boundary.id})
  )
)
ORDER BY created_at DESC, id DESC
LIMIT ${pageSize + 1}`

  // Library path for feedSorts with notNull: true on Postgres (auto → row_compare).
  const librarySeekSql = `
SELECT id, author_id, title, body, status, score, created_at
FROM posts
WHERE (created_at, id) < (${createdAtLiteral}, ${boundary.id})
ORDER BY created_at DESC, id DESC
LIMIT ${pageSize + 1}`

  const offsetSql = `
SELECT id, author_id, title, body, status, score, created_at
FROM posts
ORDER BY created_at DESC, id DESC
OFFSET ${offset}
LIMIT ${pageSize + 1}`

  for (const [title, q] of [
    [`library keyset (notNull: true → row compare) at depth=${depth}`, librarySeekSql],
    [`library keyset (default null-safe OR) at depth=${depth}`, nullSafeSql],
    [`offset at depth=${depth} (OFFSET ${offset})`, offsetSql],
  ] as const) {
    try {
      const plan = await handle.explain(q.trim())
      plans.push(`-- ${title}\n${plan}`)
    } catch (err) {
      plans.push(`-- ${title}\n(explain failed: ${(err as Error).message})`)
    }
  }

  return plans
}

const toPgTimestamptz = (d: Date | string): string => {
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString()
  return `TIMESTAMPTZ '${iso}'`
}
