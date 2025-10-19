import type { SelectQueryBuilder } from "kysely";
import { describe, expect, it } from "vitest";

import { base64UrlCodec } from "~/codec/base64Url.js";
import { codecPipe } from "~/codec/codec.js";
import { superJsonCodec } from "~/codec/superJson.js";
import { decodeCursor, resolveCursor } from "~/cursor.js";
import { paginate } from "~/paginator.js";
import type { SortSet } from "~/sorting.js";
import type { PaginationDialect } from "~/types.js";

type UserRow = {
  id: number;
  name: string | null;
  created_at: Date;
  is_active: boolean;
  orders_count: bigint;
};

type DB = {
  users: UserRow;
};

function makeBuilder<DB, TB extends keyof DB, O>(
  rows: O[],
): SelectQueryBuilder<DB, TB, O> {
  const self = {
    // postgres
    limit(_: number) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>;
    },
    // mssql
    top(_: number) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>;
    },
    orderBy(_: any, __?: any) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>;
    },
    where(_: any) {
      return self as unknown as SelectQueryBuilder<DB, TB, O>;
    },
    execute() {
      return Promise.resolve(rows) as Promise<O[]>;
    },
  };
  return self as unknown as SelectQueryBuilder<DB, TB, O>;
}

const TestDialect: PaginationDialect = {
  applyLimit: (builder, limit) =>
    (builder as any).limit ? (builder as any).limit(limit) : builder,
  applyOffset: (builder) => builder,
  applySort: (builder, sorts) =>
    sorts.reduce(
      (acc, s) => (acc as any).orderBy(s.col as any, s.dir ?? "asc"),
      builder as any,
    ),
  applyCursor: (builder) => builder,
};

const cursorCodec = codecPipe(superJsonCodec, base64UrlCodec);

const validSortsQualifiedOnly: SortSet<DB, "users", UserRow> = [
  { col: "users.created_at", dir: "asc" },
  { col: "users.id", dir: "asc" },
];

describe("paginate (runtime)", () => {
  it("encodes/decodes bigint values in nextPage tokens", async () => {
    const sorts: SortSet<DB, "users", UserRow> = [
      { col: "users.orders_count", output: "orders_count", dir: "desc" },
      { col: "users.id", output: "id", dir: "asc" },
    ];

    const item: UserRow = {
      id: 42,
      name: null,
      created_at: new Date("2023-01-01T00:00:00Z"),
      is_active: true,
      orders_count: BigInt("1234567890123456789"),
    };

    const payload = resolveCursor(item, sorts);
    const token = await cursorCodec.encode(payload);
    const decoded = await decodeCursor({ nextPage: token }, cursorCodec);
    expect(typeof (decoded as any).payload.k.orders_count).toBe("bigint");
    expect((decoded as any).payload.k.orders_count).toEqual(
      BigInt("1234567890123456789"),
    );
  });

  it("handles empty result sets (no nextPage)", async () => {
    const builder = makeBuilder<DB, "users", UserRow>([]); // no rows
    const res = await paginate({
      query: builder,
      sorts: validSortsQualifiedOnly,
      limit: 10,
      dialect: TestDialect,
    });
    expect(res.items).toEqual([]);
    expect(res.nextPage).toBeUndefined();
  });

  it("throws on empty sorts at runtime", async () => {
    const builder = makeBuilder<DB, "users", UserRow>([]);
    await expect(
      paginate({
        query: builder,
        sorts: [] as any,
        limit: 5,
        dialect: TestDialect,
      }),
    ).rejects.toThrow(/Cannot paginate without sorting/i);
  });

  it("throws on invalid cursor", async () => {
    await expect(
      decodeCursor({ invalid: "invalid" } as any, cursorCodec),
    ).rejects.toThrow(/Invalid cursor/i);
  });
});
