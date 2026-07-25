import { randomUUID } from 'crypto'

import type { Codec } from './codec.js'

/** Async string key-value store (in-memory, Redis, filesystem, …). */
export type Stash = {
  get: (key: string) => Promise<string>
  set: (key: string, value: string) => Promise<void>
}

/**
 * Codec that stores the payload in external storage and returns a random UUID key.
 * Useful for short tokens when payloads are large or sensitive.
 */
export const stashCodec = (stash: Stash): Codec<string, string> => ({
  decode: (value) => stash.get(value),
  encode: async (value) => {
    const key = randomUUID()
    await stash.set(key, value)
    return key
  },
})
