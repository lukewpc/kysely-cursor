# kysely-cursor

## 0.2.0

### Minor Changes

- ac53805: Optimize keyset WHERE emission for non-null sorts: optional `nullable: false` on sort items, dialect-aware plain OR / row-value compare, and `keysetStrategy` (`auto` | `portable`). Default (unmarked) leading sorts stay on the null-safe path.
- 2650b51: Add dialect-aware null sorting: optional `nulls: 'first' | 'last'` on sort items, `BasePaginationDialect` with `DialectMeta`, and null-safe keyset predicates that follow each engine's default NULL placement. Dialects are now classes (`new PostgresPaginationDialect()`). Cursor payloads include a version field; PostgreSQL no longer forces NULLS FIRST/LAST on every ORDER BY when `nulls` is omitted.

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
