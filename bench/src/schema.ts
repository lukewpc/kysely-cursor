import type { Post } from './types.js'

/**
 * Sort sets mirror common product patterns:
 * - chronological feed (created_at + id) — deep-page, walks, filtered, author
 * - scoreboard / ranking (score + id) — scoreboard scenario
 *
 * The final key is always non-null unique `id`.
 * `notNull: true` opts into seek-friendly keyset emission (row compare / plain OR);
 * created_at and score are NOT NULL in the bench schema.
 */
export const feedSorts = [
  {
    col: 'posts.created_at' as const,
    dir: 'desc' as const,
    output: 'created_at' as const,
    notNull: true as const,
  },
  { col: 'posts.id' as const, dir: 'desc' as const, output: 'id' as const },
]

export const scoreSorts = [
  {
    col: 'posts.score' as const,
    dir: 'desc' as const,
    output: 'score' as const,
    notNull: true as const,
  },
  { col: 'posts.id' as const, dir: 'desc' as const, output: 'id' as const },
]

export const STATUSES = ['published', 'draft', 'archived'] as const
export type Status = (typeof STATUSES)[number]

/** ~70% published so filtered-feed still has a large working set. */
export const statusForIndex = (i: number): Status => {
  const r = i % 10
  if (r < 7) return 'published'
  if (r < 9) return 'draft'
  return 'archived'
}

/** ~800 bytes of non-indexed payload so OFFSET must heap-fetch skipped rows. */
export const bodyForIndex = (i: number): string => {
  const unit = `lorem-post-${i.toString(16)}-content-block|`
  // 20 repeats ≈ 400–500 chars; pad to ~800B so deep OFFSET pays for real row materialization
  return unit.repeat(20)
}

/**
 * Deterministic row factory — same data shape on every dialect so results are comparable.
 * Hot author (id=1) owns every 50th row so the author-timeline scenario has real depth.
 */
export const makePost = (i: number, hotAuthorId: number): Omit<Post, 'id'> => {
  const authorId = i % 50 === 0 ? hotAuthorId : 2 + (i % 499)
  // spread created_at over time so btree range scans matter
  const createdAt = new Date(Date.UTC(2024, 0, 1) + i * 60_000)

  return {
    author_id: authorId,
    title: `Post ${i.toString().padStart(7, '0')}`,
    body: bodyForIndex(i),
    status: statusForIndex(i),
    score: (i * 17) % 10_000,
    created_at: createdAt,
  }
}
