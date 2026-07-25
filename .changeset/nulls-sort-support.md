---
'kysely-cursor': minor
---

Add dialect-aware null sorting: optional `nulls: 'first' | 'last'` on sort items, `BasePaginationDialect` with `DialectMeta`, and null-safe keyset predicates that follow each engine's default NULL placement. Dialects are now classes (`new PostgresPaginationDialect()`). Cursor payloads include a version field; PostgreSQL no longer forces NULLS FIRST/LAST on every ORDER BY when `nulls` is omitted.
