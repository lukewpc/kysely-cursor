# kysely-cursor

## 0.2.0

### Minor Changes

- 414b445: Optimize keyset WHERE emission for non-null sorts: optional `notNull: true` on sort items, dialect-aware plain OR / row-value compare, and `keysetStrategy` (`auto` | `portable`). Unmarked leading sorts stay on the null-safe path; set `notNull: true` to unlock seek-friendly SQL.
- 414b445: Dialect-aware null sorting (`nulls: 'first' | 'last'`), `BasePaginationDialect` / `DialectMeta`, and null-safe keyset predicates that follow each engine’s default NULL placement.

  **Breaking**

  - Built-in dialects are classes: use `new PostgresPaginationDialect()` (etc.).
  - Cursor payloads are versioned (`v: 1`); tokens from 0.1.0 are rejected.
  - PostgreSQL no longer forces NULLS FIRST/LAST on every `ORDER BY` when `nulls` is omitted; engine defaults apply (ASC → nulls last).

- 8cd7f02: Remediations for the 0.2 line: ESM-only package (drop CJS entry; Node `engines` ≥ 20), export sort/cursor types (`SortSet`, `CursorPayload`, `CURSOR_VERSION`, `Stash`, …) as types, export `emitKeysetPredicate`, optional `maxLimit`, empty offset past end sets `hasPrevPage` without inventing a keyset prev, AES codec derives key once (payload v2 — discard outstanding encrypted tokens; high-entropy secret ≥ 16), `base64UrlCodec` validates alphabet, `Stash.get` may return null, and README footguns / offset hybrid docs.

## 0.1.0

### Minor Changes

- ab6c849: Add `paginateWithEdges` method, returning a cursor and node (item) for each row

## 0.0.3

### Patch Changes

- ec220b0: Improve errors

## 0.0.2

### Patch Changes

- 4a2b584: Release
- 5deeaf9: Fixes
- 6964bc4: Init

## 0.0.2-alpha.1

### Patch Changes

- 5deeaf9: Fixes

## 0.0.2-alpha.0

### Patch Changes

- 6964bc4: Init
