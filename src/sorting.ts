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

/** `true` when `T` is `any` (used so `SortSet<any, …>` stays assignable for runtime helpers). */
type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Constrain `nullable` to match the selected column's type in `O`:
 * - Column may be null: omit or `true` (not `false`)
 * - Column is non-null: omit or `false` (not `true`)
 * - Column type is `any` (erased internals): `boolean` (no constraint)
 *
 * Omit stays allowed either way; runtime still treats omit as nullable
 * (null-safe keyset path). Emission never reads these types — only the flag.
 */
type NullableProp<Col> = IsAny<Col> extends true
  ? {
      /**
       * Whether this sort key may contain NULL values.
       *
       * - Default / `true`: null-safe keyset predicate path.
       * - `false`: asserts no NULLs so the library may emit faster non-null
       *   SQL (`plain_or` / `row_compare`) when all non-final keys opt in.
       *
       * Runtime only reads this flag; TypeScript does not change SQL.
       * Against a concrete row type, `false`/`true` are rejected when they
       * disagree with nullability of the selected field.
       */
      nullable?: boolean
    }
  : null extends Col
    ? {
        /**
         * Whether this sort key may contain NULL values.
         *
         * For columns typed as nullable in the query result, only `true` (or
         * omit) is allowed. `false` is a compile-time error — claiming
         * non-null would unlock faster keyset SQL that is incorrect if NULLs
         * exist.
         *
         * - Default / `true`: null-safe keyset predicate path.
         * - Runtime only reads this flag; TypeScript does not change SQL.
         */
        nullable?: true
      }
    : {
        /**
         * Whether this sort key may contain NULL values.
         *
         * For columns typed as non-null in the query result, only `false` (or
         * omit) is allowed. `true` is a compile-time error.
         *
         * - Default (omit): still treated as nullable at runtime (conservative
         *   null-safe path).
         * - `false`: asserts no NULLs so the library may emit faster non-null
         *   SQL (`plain_or` / `row_compare`) when all non-final keys opt in.
         *
         * Runtime only reads this flag; TypeScript does not change SQL.
         */
        nullable?: false
      }

type SortItemCommon<Allowed> = {
  dir?: OrderByDirection
  /** Only allowed when this sort position may select a nullable column (leading keys). */
  nulls?: null extends Allowed ? NullsDirection : undefined
}

type SortItemWithOutput<DB, TB extends keyof DB, O, Allowed, K extends MatchingKeys<O, Allowed>> = SortItemCommon<Allowed> & {
  col: ReferenceExpression<DB, TB>
  output: K
} & NullableProp<O[K]>

type SortItemFromCol<DB, TB extends keyof DB, O, Allowed, K extends MatchingKeys<O, Allowed>> = SortItemCommon<Allowed> & {
  col: StringReference<DB, TB> & OptionallyQualifiedKey<TB, K>
} & NullableProp<O[K]>

/**
 * One sort key. Column eligibility is limited by `Allowed`; `nullable` is
 * further constrained by the selected field's type on `O`.
 */
export type SortItem<DB, TB extends keyof DB, O, Allowed> = {
  [K in MatchingKeys<O, Allowed>]:
    | SortItemWithOutput<DB, TB, O, Allowed, K>
    | SortItemFromCol<DB, TB, O, Allowed, K>
}[MatchingKeys<O, Allowed>]

export type SortSet<DB, TB extends keyof DB, O> = readonly [
  ...SortItem<DB, TB, O, Sortable | null>[], // nullable leading sorts
  SortItem<DB, TB, O, Sortable>, // non-null final sort
]
