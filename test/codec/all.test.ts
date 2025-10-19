import { describe, expect, it } from "vitest";

import { base64UrlCodec } from "~/codec/base64Url.js";
import { codecPipe } from "~/codec/codec.js";
import { createAesCodec } from "~/codec/encrypt.js";
import { stashCodec } from "~/codec/stash.js";
import { superJsonCodec } from "~/codec/superJson.js";

describe("codec chain", () => {
  it("should encode and decode a string", async () => {
    const stash = new Map<string, string>();
    const codec = codecPipe(
      superJsonCodec,
      base64UrlCodec,
      createAesCodec("secret"),
      stashCodec({
        get: async (key) => stash.get(key)!,
        set: async (key, value) => void stash.set(key, value),
      }),
    );

    const data = { data: new Date() };
    const encoded = await codec.encode(data);
    const decoded = await codec.decode(encoded);
    expect(decoded).toEqual(data);
    console.log(encoded);
  });
});
