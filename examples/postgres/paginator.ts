import {
  base64UrlCodec,
  codecPipe,
  createAesCodec,
  createPaginator,
  PostgresPaginationDialect,
  superJsonCodec,
  type Paginator,
} from 'kysely-cursor'

/**
 * Default opaque tokens: SuperJSON (Dates, BigInts, …) → Base64 URL-safe string.
 * This is also the library default when you omit `cursorCodec`.
 */
export const defaultCursorCodec = codecPipe(superJsonCodec, base64UrlCodec)

/**
 * Production-style tokens: SuperJSON → AES-GCM → Base64 URL.
 * Set `PAGINATION_SECRET` to try the encrypted demo path.
 */
export function createEncryptedCursorCodec(secret: string) {
  return codecPipe(superJsonCodec, createAesCodec(secret), base64UrlCodec)
}

/**
 * One paginator per app (or per token policy). Reuse it for every page request —
 * dialect + codec + keyset strategy stay fixed; only the query / sorts / cursor change.
 */
export function createAppPaginator(options?: {
  /** Prefer encrypted tokens when a secret is available. */
  secret?: string
  /**
   * `auto` (default) uses Postgres row-value compare `(a, b) < ($1, $2)` when
   * every non-final sort is `nullable: false` and directions are uniform.
   * Use `portable` to force plain multi-column OR instead.
   */
  keysetStrategy?: 'auto' | 'portable'
}): Paginator {
  const cursorCodec = options?.secret ? createEncryptedCursorCodec(options.secret) : defaultCursorCodec

  return createPaginator({
    dialect: new PostgresPaginationDialect(),
    cursorCodec,
    keysetStrategy: options?.keysetStrategy ?? 'auto',
  })
}
