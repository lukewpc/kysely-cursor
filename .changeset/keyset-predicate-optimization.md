---
'kysely-cursor': minor
---

Optimize keyset WHERE emission for non-null sorts: optional `notNull: true` on sort items, dialect-aware plain OR / row-value compare, and `keysetStrategy` (`auto` | `portable`). Unmarked leading sorts stay on the null-safe path; set `notNull: true` to unlock seek-friendly SQL.
