import { randomUUID } from "crypto";

import type { Codec } from "./codec.js";

/**
 * A simple asynchronous key-value storage interface.
 *
 * Each key and value must be a string.
 * Implementations could be in-memory, filesystem-based, Redis-backed, etc.
 */
export type Stash = {
  /**
   * Retrieve a value by key.
   * @param key The key to retrieve.
   * @returns The value.
   */
  get: (key: string) => Promise<string>;
  /**
   * Store a value under a specific key.
   * @param key The key to store the value under.
   * @param value The value to store.
   */
  set: (key: string, value: string) => Promise<void>;
};

/**
 * Creates a {@link Codec} that encodes strings into stash keys and decodes keys back into their stored strings.
 *
 * - **encode(value)**: stores the given string `value` in the provided {@link Stash} under a randomly generated UUID key.
 *   Returns the generated key.
 * - **decode(key)**: retrieves and returns the original string value stored under `key`.
 *
 * This is useful for scenarios where you want to replace large or sensitive strings
 * with short unique identifiers and retrieve them later.
 *
 * @param stash The stash instance to use for storage and retrieval.
 */
export const stashCodec = (stash: Stash): Codec<string, string> => ({
  decode: (value) => stash.get(value),
  encode: async (value) => {
    const key = randomUUID();
    await stash.set(key, value);
    return key;
  },
});
