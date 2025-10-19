import superjson from "superjson";

import type { Codec } from "./codec.js";

/**
 * SuperJSON object codec.
 * Superjson is used to preserve types like Date & BigInt
 */
export const superJsonCodec: Codec<unknown, string> = {
  encode: (value) => superjson.stringify(value),
  decode: (value) => superjson.parse(value),
};
