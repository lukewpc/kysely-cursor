import { describe, expect, it } from "vitest";

import { base64UrlCodec } from "~/codec/base64Url.js";

describe("base64UrlCodec", () => {
  it("encodes a known string to base64", async () => {
    expect(await base64UrlCodec.encode("hello")).toBe("aGVsbG8");
  });

  it("decodes a known base64 string", async () => {
    expect(await base64UrlCodec.decode("aGVsbG8=")).toBe("hello");
  });

  it("roundtrips unicode strings", async () => {
    const input = "こんにちは 世界 🌍";
    const encoded = await base64UrlCodec.encode(input);
    const decoded = await base64UrlCodec.decode(encoded);
    expect(decoded).toBe(input);
  });

  it("handles empty string", async () => {
    expect(await base64UrlCodec.encode("")).toBe("");
    expect(await base64UrlCodec.decode("")).toBe("");
  });
});
