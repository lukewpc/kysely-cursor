import type { OrderByDirection, ReferenceExpression, StringReference } from 'kysely'

type MatchingKeys<Obj, M> = Extract<
  {
    [K in keyof Obj]-?: Obj[K] extends M ? K : never
  }[keyof Obj],
  string
>

type OptionallyQualifiedKey<TB, K extends string> = TB extends string ? K | `${TB}.${K}` : K

export const applyDefaultDirection = (dir: OrderByDirection | undefined | null): OrderByDirection => dir ?? 'asc'

export type NullsDirection = 'first' | 'last'

type Sortable = string | number | boolean | Date | bigint

/** True when `T` is `any` (keeps `SortSet<any, …>` assignable for runtime helpers). */
type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Constrain `notNull` to the selected column type in `O`:
 * non-null → omit/`true`; null → omit/`false`; `any` → `boolean`.
 * Runtime treats omit as null-safe; only `notNull: true` unlocks seek-friendly SQL.
 */
type NotNullProp<Col> =
  IsAny<Col> extends true ? { notNull?: boolean } : null extends Col ? { notNull?: false } : { notNull?: true }

type SortItemCommon<Allowed> = {
  dir?: OrderByDirection
  /** Only when the column type may be null (leading keys). */
  nulls?: null extends Allowed ? NullsDirection : undefined
}

type SortItemWithOutput<
  DB,
  TB extends keyof DB,
  O,
  Allowed,
  K extends MatchingKeys<O, Allowed>,
> = SortItemCommon<Allowed> & {
  col: ReferenceExpression<DB, TB>
  output: K
} & NotNullProp<O[K]>

type SortItemFromCol<
  DB,
  TB extends keyof DB,
  O,
  Allowed,
  K extends MatchingKeys<O, Allowed>,
> = SortItemCommon<Allowed> & {
  col: StringReference<DB, TB> & OptionallyQualifiedKey<TB, K>
} & NotNullProp<O[K]>

/** One sort key; `notNull` is constrained by the selected field type on `O`. */
export type SortItem<DB, TB extends keyof DB, O, Allowed> = {
  [K in MatchingKeys<O, Allowed>]: SortItemWithOutput<DB, TB, O, Allowed, K> | SortItemFromCol<DB, TB, O, Allowed, K>
}[MatchingKeys<O, Allowed>]

export type SortSet<DB, TB extends keyof DB, O> = readonly [
  ...SortItem<DB, TB, O, Sortable | null>[], // nullable leading sorts
  SortItem<DB, TB, O, Sortable>, // non-null final sort
]
