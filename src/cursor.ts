import { createHash } from "crypto";
import type {
  ExpressionBuilder,
  ExpressionWrapper,
  ReferenceExpression,
  SelectQueryBuilder,
  SqlBool,
} from "kysely";
import { z } from "zod";

import type { Codec } from "./codec/codec.js";
import { PaginationError } from "./error.js";
import type { SortItem, SortSet } from "./sorting.js";
import { applyDefaultDirection } from "./sorting.js";

const CursorPayloadSchema = z.object({
  sig: z.string(),
  k: z.record(z.string(), z.any()),
});
export type CursorPayload = z.output<typeof CursorPayloadSchema>;

export type CursorIncoming =
  | { nextPage: string }
  | { prevPage: string }
  | { offset: number };

export type DecodedCursorNextPrev = {
  type: "next" | "prev";
  payload: CursorPayload;
};

export type DecodedOffset = {
  type: "offset";
  offset: number;
};

export type DecodedCursor = DecodedCursorNextPrev | DecodedOffset;

export type CursorOutgoing = {
  startCursor?: string;
  endCursor?: string;
  nextPage?: string;
  prevPage?: string;
};

export const decodeCursor = async (
  cursor: CursorIncoming,
  keysetCodec: Codec<any, string>,
): Promise<DecodedCursor> => {
  if ("nextPage" in cursor)
    return {
      type: "next",
      payload: await decodeCursorPayload(cursor.nextPage, keysetCodec),
    };
  if ("prevPage" in cursor)
    return {
      type: "prev",
      payload: await decodeCursorPayload(cursor.prevPage, keysetCodec),
    };
  if ("offset" in cursor) return { type: "offset", offset: cursor.offset };

  throw new PaginationError("Invalid cursor");
};

const decodeCursorPayload = async (
  token: string,
  keysetCodec: Codec<any, string>,
) => {
  const decoded = await keysetCodec.decode(token);
  return CursorPayloadSchema.parse(decoded);
};

export const resolvePageTokens = async (
  rows: object[],
  sorts: SortSet<any, any, any>,
  cursorCodec: Codec<any, string>,
  decodedCursor: DecodedCursor | null,
  overFetched: boolean,
): Promise<CursorOutgoing> => {
  // if no rows, we return no tokens
  if (rows.length === 0) return {};

  const inverted = decodedCursor?.type === "prev";
  const isFirst =
    !decodedCursor ||
    (decodedCursor.type === "offset" && decodedCursor.offset === 0);

  const first = rows.at(0);
  const last = rows.at(-1);

  const startCursor = first
    ? await cursorCodec.encode(resolveCursor(first, sorts))
    : undefined;
  const endCursor = last
    ? await cursorCodec.encode(resolveCursor(last, sorts))
    : undefined;

  return {
    startCursor,
    endCursor,
    prevPage: (!inverted || overFetched) && !isFirst ? startCursor : undefined,
    nextPage: inverted || overFetched ? endCursor : undefined,
  };
};

export const getSortOutput = (sort: SortItem<any, any, any, any>) =>
  "output" in sort ? sort.output : sort.col.split(".").at(-1)!;

export const sortSignature = (sorts: SortSet<any, any, any>) => {
  const sig = sorts
    .map((s) => `${"output" in s ? s.output : s.col}:${s.dir ?? "asc"}`)
    .join("|");
  return createHash("sha256").update(sig).digest("hex").slice(0, 8);
};

export const resolveCursor = (item: any, sorts: SortSet<any, any, any>) => {
  const sig = sortSignature(sorts);

  const k = Object.fromEntries(
    sorts.map((s) => {
      const key = getSortOutput(s);
      return [key, item[key]];
    }),
  );

  return { sig, k };
};

export const buildCursorPredicateRecursive = <
  DB,
  TB extends keyof DB,
  S extends SortSet<any, any, any>,
>(
  eb: ExpressionBuilder<DB, TB>,
  sorts: S,
  decoded: CursorPayload,
  idx = 0,
): ExpressionWrapper<DB, TB, SqlBool> => {
  const sort = sorts[idx];
  if (!sort) throw new PaginationError("Sort index out of bounds");

  const dir = applyDefaultDirection(sort.dir);
  const col = sort.col as ReferenceExpression<DB, TB>;
  const key = getSortOutput(sort);
  if (!(key in decoded.k))
    throw new PaginationError(`Missing pagination cursor value for "${key}"`);

  const value = decoded.k[key];
  const cmp = dir === "desc" ? "<" : ">";

  if (idx === sorts.length - 1) {
    // last sort: tie-breaker
    return eb(col, cmp, value);
  }

  // recursively build predicate for the next sort field
  const next = buildCursorPredicateRecursive(eb, sorts, decoded, idx + 1);

  if (value === null)
    // handle NULLs explicitly since SQL ordering treats them specially
    return dir === "asc"
      ? eb.or([eb(col, "is", null).and(next), eb(col, "is not", null)])
      : eb.and([eb(col, "is", null), next]);

  // combine current column comparison with recursion for tie-breaking
  return eb.or([
    eb(col, cmp, value), // current column moves cursor forward
    eb.and([eb(col, "=", value), next]), // tie on current col → check next one
    ...(dir === "desc" ? [eb(col, "is", null)] : []), // include NULLs in DESC order
  ]);
};

export const baseApplyCursor = <DB, TB extends keyof DB, O>(
  builder: SelectQueryBuilder<DB, TB, O>,
  sorts: SortSet<DB, TB, O>,
  cursor: DecodedCursorNextPrev,
) =>
  builder.where((eb) =>
    buildCursorPredicateRecursive(eb, sorts, cursor.payload),
  );
