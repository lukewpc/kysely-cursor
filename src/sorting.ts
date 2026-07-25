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
 * Constrain `nullable` to the selected column type in `O`:
 * null → omit/`true`; non-null → omit/`false`; `any` → `boolean`.
 * Runtime still treats omit as nullable (null-safe path).
 */
type NullableProp<Col> =
  IsAny<Col> extends true ? { nullable?: boolean } : null extends Col ? { nullable?: true } : { nullable?: false }

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
} & NullableProp<O[K]>

type SortItemFromCol<
  DB,
  TB extends keyof DB,
  O,
  Allowed,
  K extends MatchingKeys<O, Allowed>,
> = SortItemCommon<Allowed> & {
  col: StringReference<DB, TB> & OptionallyQualifiedKey<TB, K>
} & NullableProp<O[K]>

/** One sort key; `nullable` is constrained by the selected field type on `O`. */
export type SortItem<DB, TB extends keyof DB, O, Allowed> = {
  [K in MatchingKeys<O, Allowed>]: SortItemWithOutput<DB, TB, O, Allowed, K> | SortItemFromCol<DB, TB, O, Allowed, K>
}[MatchingKeys<O, Allowed>]

export type SortSet<DB, TB extends keyof DB, O> = readonly [
  ...SortItem<DB, TB, O, Sortable | null>[], // nullable leading sorts
  SortItem<DB, TB, O, Sortable>, // non-null final sort
]
