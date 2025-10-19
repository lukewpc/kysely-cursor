import { describe, expect, it } from "vitest";

import { superJsonCodec } from "~/codec/superJson.js";

describe("superJsonCodec", () => {
  it("roundtrips Date and BigInt", async () => {
    const input = { when: new Date("2020-01-02T03:04:05.678Z"), count: 123n };
    const encoded = await superJsonCodec.encode(input);
    const decoded = await superJsonCodec.decode(encoded);
    expect(decoded).toEqual(input);
    expect(typeof (decoded as any).count).toBe("bigint");
    expect((decoded as any).when instanceof Date).toBe(true);
  });

  it("roundtrips Map and Set", async () => {
    const input = { map: new Map([["a", 1]]), set: new Set([1, 2, 3]) };
    const encoded = await superJsonCodec.encode(input);
    const decoded = await superJsonCodec.decode(encoded);
    expect(decoded).toEqual(input);
  });

  it("throws on invalid payload", () => {
    expect(() => superJsonCodec.decode("not:json")).toThrow();
  });
});
