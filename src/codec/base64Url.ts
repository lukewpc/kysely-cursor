import type { Codec } from "./codec.js";

/**
 * Base64 string codec. URL friendly
 */
export const base64UrlCodec: Codec<string, string> = {
  encode: (s) => Buffer.from(s, "utf8").toString("base64url"),
  decode: (s) => Buffer.from(s, "base64url").toString("utf8"),
};
