import {
  base64UrlCodec,
  codecPipe,
  createAesCodec,
  createPaginator,
  PostgresPaginationDialect,
  superJsonCodec,
  type Paginator,
} from 'kysely-cursor'

/** SuperJSON → Base64 URL-safe (library default when `cursorCodec` is omitted). */
export const defaultCursorCodec = codecPipe(superJsonCodec, base64UrlCodec)

/** SuperJSON → AES-GCM → Base64 URL. Used when `PAGINATION_SECRET` is set. */
export function createEncryptedCursorCodec(secret: string) {
  return codecPipe(superJsonCodec, createAesCodec(secret), base64UrlCodec)
}

/** Shared paginator for the demos. */
export function createAppPaginator(options?: { secret?: string; keysetStrategy?: 'auto' | 'portable' }): Paginator {
  const cursorCodec = options?.secret ? createEncryptedCursorCodec(options.secret) : defaultCursorCodec

  return createPaginator({
    dialect: new PostgresPaginationDialect(),
    cursorCodec,
    keysetStrategy: options?.keysetStrategy ?? 'auto',
  })
}
