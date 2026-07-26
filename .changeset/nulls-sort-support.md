---
'kysely-cursor': minor
---

Dialect-aware null sorting (`nulls: 'first' | 'last'`), `BasePaginationDialect` / `DialectMeta`, and null-safe keyset predicates that follow each engine’s default NULL placement.

**Breaking**

- Built-in dialects are classes: use `new PostgresPaginationDialect()` (etc.).
- Cursor payloads are versioned (`v: 1`); tokens from 0.1.0 are rejected.
- PostgreSQL no longer forces NULLS FIRST/LAST on every `ORDER BY` when `nulls` is omitted; engine defaults apply (ASC → nulls last).
