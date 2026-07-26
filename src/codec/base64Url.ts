import type { Codec } from './codec.js'

/** URL-safe Base64 alphabet (no padding). */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

/**
 * Base64 string codec. URL friendly (no padding).
 * Decode rejects empty strings and characters outside the base64url alphabet.
 */
export const base64UrlCodec: Codec<string, string> = {
  encode: (s) => Buffer.from(s, 'utf8').toString('base64url'),
  decode: (s) => {
    if (typeof s !== 'string' || s.length === 0 || !BASE64URL_RE.test(s)) {
      throw new Error('Invalid base64url payload')
    }
    return Buffer.from(s, 'base64url').toString('utf8')
  },
}
