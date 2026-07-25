# Keyset predicate optimization

## 1. Problem

`kysely-cursor` builds keyset predicates in one place: `buildCursorPredicateRecursive` in `src/cursor.ts` (via `BasePaginationDialect.applyCursor`).

For the common feed pattern—non-null `created_at` + non-null unique `id`—it always emits a **null-safe multi-column OR tree**, e.g. (DESC):

```sql
WHERE (created_at IS NOT NULL AND created_at < $1)
   OR (created_at IS NOT NULL AND created_at = $1 AND id IS NOT NULL AND id < $2)
```

| Observation                                                                                                                                    | Implication                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| On **Postgres**, this is typically residual **Filter** over an ordered index scan (`Rows Removed by Filter ≈ OFFSET`), not **Index Cond** seek | Deep pages re-walk the prefix; latency tracks OFFSET more than classic keyset |
| Classic OR **without** `IS NOT NULL` has the same residual-Filter pattern on Postgres                                                          | Primary issue is disjunctive multi-column form, not null guards alone         |
| **Row comparison** `(created_at, id) < ($1, $2)` becomes Index Cond on Postgres (and seeks well on SQLite)                                     | Seek form is available for non-null, uniform-direction sorts                  |
| On **MySQL** / **MSSQL**, current cursor path already beats OFFSET badly at depth                                                              | Do not fix Postgres by regressing those engines                               |
| Cursor pagination stays more stable under concurrent writes than OFFSET                                                                        | Correctness and stability still win over raw latency                          |

**Not claiming:** Postgres is “worse at NULLs” than MySQL/MSSQL; that we should drop null-safe predicates for nullable leading sorts; that one SQL shape is optimal everywhere.

---

## 2. Goals and non-goals

**Goals**

1. **Correctness first** — same total order, next/prev semantics, and null placement as today.
2. **One public API** — dialect differences live in emission metadata/strategy, not user code.
3. **Seek when safe** — emit seek-friendly SQL when sorts + dialect allow.
4. **Portable when required** — keep today’s null-safe OR tree when null branches may matter.
5. **No silent semantic change** — fast paths must be equivalent for their preconditions.
6. **Measurable** — dialect correctness tests; `bench/` for latency/plan.

**Primary principle:** one **semantic** model of keyset pagination; vary only **emission** by (sort class × dialect capability).

**Non-goals**

| Non-goal                                                 | Reason                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Remove null-safe OR entirely                             | Core feature for nullable leading sorts                     |
| Emit row compare on MSSQL                                | Not portable                                                |
| Row compare for mixed sort directions                    | Not equivalent to a single tuple `<` / `>`                  |
| Default `CASE`-based null ordering on MySQL/MSSQL        | Separate project if ever needed                             |
| Change cursor token format / codec                       | Unrelated                                                   |
| Guarantee library latency ≤ OFFSET on every engine/depth | Optimize access path; don’t market every cell               |
| Require DB-specific index DDL from the library           | Document only                                               |
| Infer nullability from TypeScript types                  | Types are erased; runtime must be explicit and conservative |

---

## 3. Architecture

Split classification from emission (today fused in `buildCursorPredicateRecursive`):

```text
applied sorts + cursor payload + DialectMeta
        │
        ▼
  classifyKeyset(...)     →  null_safe | simple_non_null { uniformDir }
        │
        ▼
  selectStrategy(...)     →  null_safe_or | plain_or | row_compare
        │
        ▼
  emitKeysetPredicate(...)
```

- Classify and emit on **applied** sorts (after prev-page inversion).
- `BasePaginationDialect.applyCursor` calls the shared path.
- Dialects differ only via **`DialectMeta`** (and optional paginator strategy); prefer metadata over per-dialect overrides.
- Keep the current recursive builder as the **null_safe_or** path (not a second correctness model).

### Emission shapes (non-null uniform DESC example)

All three must return the same rows for non-null data and matching `ORDER BY created_at DESC, id DESC`.

| Strategy                               | SQL                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `null_safe_or` (today; fallback)       | `(created_at IS NOT NULL AND created_at < $1) OR (created_at IS NOT NULL AND created_at = $1 AND id IS NOT NULL AND id < $2)` |
| `plain_or` (Phase 1)                   | `created_at < $1 OR (created_at = $1 AND id < $2)`                                                                            |
| `row_compare` (Phase 2, dialect-gated) | `(created_at, id) < ($1, $2)`                                                                                                 |

Single-column non-null: plain comparison (`col < $1` / `col > $1`); row-compare degenerates to the same.

---

## 4. Classifier (normative)

```ts
type KeysetClass =
  | { kind: 'null_safe' }
  | {
      kind: 'simple_non_null'
      uniformDir: 'asc' | 'desc' | 'mixed'
    }
```

### Nullability (runtime only — not type-driven)

Do **not** infer from TypeScript types, column names, or DB catalogs.

| Sort position           | Default                                    | Fast-path opt-in                           |
| ----------------------- | ------------------------------------------ | ------------------------------------------ |
| **Non-final** (leading) | **Nullable**                               | Only if `nullable: false` on the sort item |
| **Final**               | Non-null (already enforced by the library) | —                                          |

```ts
// Leading key stays on null-safe path (default)
{ col: 'posts.created_at', dir: 'desc' }

// Leading key eligible for plain OR / row compare
{ col: 'posts.created_at', dir: 'desc', nullable: false }
```

### Classification algorithm

Run on **applied** sorts + decoded cursor payload:

```
null_safe  if any of:
  • any sort has explicit nulls: 'first' | 'last'
  • any non-final sort lacks nullable: false   (default = nullable)
  • any non-final cursor value is null

simple_non_null  otherwise
  • uniformDir = all asc | all desc | mixed
```

Explicit `nulls:` always forces `null_safe` (user is expressing null placement).  
A null on the final key remains `INVALID_TOKEN`, not a classification case.

No codec or token format changes.

---

## 5. Strategy selection (normative)

```ts
type KeysetStrategy = 'auto' | 'portable' | 'seek' // paginator option; default 'auto'

type EmitKind = 'null_safe_or' | 'plain_or' | 'row_compare'

function selectKeysetStrategy(class_: KeysetClass, meta: DialectMeta, opt: KeysetStrategy = 'auto'): EmitKind {
  if (class_.kind === 'null_safe') return 'null_safe_or'

  // meta = capability; algorithm = preference
  const allowRow = opt !== 'portable' && meta.supportsRowValueCompare && class_.uniformDir !== 'mixed'

  if (allowRow) return 'row_compare'
  return 'plain_or'
}
```

| `keysetStrategy` | Behavior                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `auto` (default) | As above                                                                                      |
| `portable`       | Never `row_compare` (only `null_safe_or` / `plain_or`)                                        |
| `seek`           | Prefer `row_compare` when class + dialect allow; otherwise same fallback as `auto` (no error) |

---

## 6. Work items

### A — Classifier + `nullable` (P0)

- Add optional `nullable?: boolean` on `SortItem` (`src/sorting.ts`).
- Implement classifier in `src/cursor.ts` (or adjacent helper) per §4.
- Files: `src/sorting.ts`, `src/cursor.ts`, tests in `test/dialect/shared.ts` / unit tests.

### B — Plain OR emitter (P0)

When strategy is `plain_or`, emit classic multi-column keyset **without** `IS NULL` / `IS NOT NULL` guards. When `null_safe_or`, keep current recursive builder **behavior unchanged**.

Portable on all engines; lowest-risk win. On Postgres, plain OR often still residual Filter—B is prerequisite hygiene; C unlocks true seeks.

### C — Row compare + `DialectMeta` (P1)

```ts
export type DialectMeta = {
  supportsNullSortDirective: boolean
  defaultNullsSortAsc: NullsDirection
  /** SQL row-value comparison: (a, b) < ($1, $2) */
  supportsRowValueCompare: boolean
}
```

| Dialect  | `supportsRowValueCompare` | Notes                                        |
| -------- | ------------------------- | -------------------------------------------- |
| Postgres | `true`                    | Index Cond seek in benches                   |
| SQLite   | `true`                    | Strong ideal-baseline                        |
| MySQL    | `true` capability         | Bench before relying on `auto` → row compare |
| MSSQL    | `false`                   | No portable row-value `<`                    |

**Emit `row_compare` only when** class is `simple_non_null`, meta allows it, uniform direction, and selection algorithm chooses it.

| Uniform dir | Predicate (forward in applied sort order) |
| ----------- | ----------------------------------------- |
| ASC         | `(c1, c2, …) > ($1, $2, …)`               |
| DESC        | `(c1, c2, …) < ($1, $2, …)`               |

Column order must match the sort set. Use Kysely `sql` / expression building with bound parameters (no string-concatenated literals). Mixed directions stay on `plain_or` / `null_safe_or`.

**MySQL:** implement support, then **bench** before accepting row compare as the `auto` outcome:

- Healthy plans / latency ≥ plain OR → leave `supportsRowValueCompare: true` (auto uses row compare).
- Regressions → set MySQL meta to `false` (or dialect preference so auto stays on plain OR); row compare still available via future knobs if desired.

### D — Wire into dialects (P1)

`applyCursor` uses classify → select → emit. Dialect classes only set metadata (as today for nulls).

### E — Optional `keysetStrategy` on paginator (P2)

Additive `PaginatorOptions.keysetStrategy?: 'auto' | 'portable' | 'seek'` per §5.

### F — Tests (with each phase)

**Correctness**

1. Existing dialect shared suite stays green (forward/back, nulls, offset, concurrency).
2. New cases:
   - default leading sort (no `nullable`) → null-safe path
   - all non-final `nullable: false` → plain OR / row compare path
   - explicit `nulls:` → null-safe even with `nullable: false`
   - mixed directions never select row compare
   - prev-page (inverted applied sorts) matches forward order for all strategies
3. Unit tests: sorts + payload + meta + opt → expected class and emit kind.
4. Behavioral equivalence (same rows), not SQL-string equality, vs current builder for non-null feeds.

**Bench / plan (not CI-blocking initially)**

1. After C: library deep-page on Postgres for marked non-null uniform sorts approaches ideal seek (not residual Filter at depth).
2. Optional: `EXPLAIN` shows Index Cond without large `Rows Removed by Filter`.

### G — Docs (P2)

README: how predicates are chosen; index guidance `(created_at DESC, id DESC)`; that **default leading sorts stay null-safe** and `nullable: false` enables faster SQL; point at `bench/`.

---

## 7. Phases and API impact

### Phase 1 — Portable fast path (first PR)

A + B + F (classification + plain OR equivalence). No row compare.

**Done when:** all dialect tests pass; marked non-null feeds omit redundant `IS NOT NULL`; default (unmarked) leading sorts still use null-safe SQL.

### Phase 2 — Dialect seek path

C + D + F (mixed-dir, prev-page, Postgres plan spot-check). MySQL bench before/after for auto default.

**Done when:** Postgres non-null uniform deep-page uses Index Cond (or latency ≈ ideal within noise); MySQL/MSSQL do not regress vs Phase 1; MSSQL never emits row compare.

### Phase 3 — Polish

E + G; optional bench notes in `bench/README.md`.

### Public API

| Surface                              | Impact                                             |
| ------------------------------------ | -------------------------------------------------- |
| `createPaginator` / `paginate`       | No required call-site changes                      |
| `SortItem`                           | Additive optional `nullable?: boolean`             |
| `DialectMeta`                        | Additive `supportsRowValueCompare: boolean`        |
| `PaginatorOptions`                   | Additive optional `keysetStrategy?` (Phase 3)      |
| Cursor tokens                        | Unchanged                                          |
| Default (unmarked leading sorts)     | Unchanged (null-safe path)                         |
| Leading sorts with `nullable: false` | Faster SQL where strategy allows; same result rows |

Semver: **minor**. Result-order changes would be major—tests must forbid that.

**Exported `buildCursorPredicateRecursive`:** keep as the null-safe implementation (or thin wrapper around it). New classify/emit entry point is internal unless we deliberately re-export later.

---

## 8. Risks

| Risk                                                     | Mitigation                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Row compare wrong for mixed dirs                         | Hard gate: uniform direction only                                                   |
| Misclassification at null boundaries                     | Default leading = nullable; require `nullable: false`; null shared tests            |
| Prev-page uses wrong class/strategy                      | Classify **applied** (inverted) sorts                                               |
| MySQL row compare slower than plain OR                   | Bench gate; meta/preference so auto stays on plain OR                               |
| Users depend on exact SQL shape                          | `keysetStrategy: 'portable'`; document `auto`                                       |
| `sql` fragment / parameter binding quirks                | Integration tests per dialect; bound params only                                    |
| Caller sets `nullable: false` on a column that has NULLs | Document as user assertion; wrong pages are misconfiguration, not silent type magic |
