import type { OrderByDirection, ReferenceExpression, StringReference } from 'kysely'

type MatchingKeys<Obj, M> = Extract<
  {
    [K in keyof Obj]-?: Obj[K] extends M ? K : never
  }[keyof Obj],
  string
>

type OptionallyQualified<TB, O, Allowed> = TB extends string
  ? MatchingKeys<O, Allowed> | `${TB}.${MatchingKeys<O, Allowed>}`
  : never

export const applyDefaultDirection = (dir: OrderByDirection | undefined | null): OrderByDirection => dir ?? 'asc'

export type NullsDirection = 'first' | 'last'

export type SortItem<DB, TB extends keyof DB, O, Allowed> = {
  dir?: OrderByDirection
  nulls?: null extends Allowed ? NullsDirection : undefined
  /**
   * Whether this sort key may contain NULL values.
   *
   * - Default / `true`: treated as nullable. Leading keys stay on the
   *   null-safe keyset predicate path.
   * - `false`: asserts the column has no NULLs so the library may emit
   *   faster non-null SQL (`plain_or` / `row_compare`) when all non-final
   *   keys opt in and other preconditions hold.
   *
   * Only meaningful for non-final sorts (the final key is already required
   * to be non-null). This is a runtime assertion — not inferred from types.
   */
  nullable?: boolean
} & (
  | {
      col: ReferenceExpression<DB, TB>
      output: MatchingKeys<O, Allowed>
    }
  | {
      col: StringReference<DB, TB> & OptionallyQualified<TB, O, Allowed>
    }
)

type Sortable = string | number | boolean | Date | bigint

export type SortSet<DB, TB extends keyof DB, O> = readonly [
  ...SortItem<DB, TB, O, Sortable | null>[], // nullable leading sorts
  SortItem<DB, TB, O, Sortable>, // non-null final sort
]
