import { randomUUID } from 'crypto'

import type { Codec } from './codec.js'

/** Async string key-value store (in-memory, Redis, filesystem, …). */
export type Stash = {
  /**
   * Return the stored value, or `null`/`undefined` when missing.
   * Missing keys surface as `INVALID_TOKEN` via the cursor codec chain.
   */
  get: (key: string) => Promise<string | null | undefined>
  set: (key: string, value: string) => Promise<void>
}

/**
 * Codec that stores the payload in external storage and returns a random UUID key.
 * Useful for short tokens when payloads are large or sensitive.
 */
export const stashCodec = (stash: Stash): Codec<string, string> => ({
  decode: async (value) => {
    const stored = await stash.get(value)
    if (stored == null) throw new Error('Stash key not found')
    return stored
  },
  encode: async (value) => {
    const key = randomUUID()
    await stash.set(key, value)
    return key
  },
})
