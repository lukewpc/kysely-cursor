import type {
  OrderByDirection,
  ReferenceExpression,
  StringReference,
} from "kysely";

type MatchingKeys<Obj, M> = Extract<
  {
    [K in keyof Obj]-?: Obj[K] extends M ? K : never;
  }[keyof Obj],
  string
>;

type OptionallyQualified<TB, O, Allowed> = TB extends string
  ? MatchingKeys<O, Allowed> | `${TB}.${MatchingKeys<O, Allowed>}`
  : never;

export const applyDefaultDirection = (
  dir: OrderByDirection | undefined | null,
): OrderByDirection => dir ?? "asc";

export type SortItem<DB, TB extends keyof DB, O, Allowed> = {
  dir?: OrderByDirection;
} & (
  | {
      col: ReferenceExpression<DB, TB>;
      output: MatchingKeys<O, Allowed>;
    }
  | {
      col: StringReference<DB, TB> & OptionallyQualified<TB, O, Allowed>;
    }
);

type Sortable = string | number | boolean | Date | bigint;

export type SortSet<DB, TB extends keyof DB, O> = [
  ...SortItem<DB, TB, O, Sortable | null>[], // nullable leading sorts
  SortItem<DB, TB, O, Sortable>, // non-null final sort
];
