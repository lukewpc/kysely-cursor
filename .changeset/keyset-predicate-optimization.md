---
'kysely-cursor': minor
---

Optimize keyset WHERE emission for non-null sorts: optional `notNull: true` on sort items, dialect-aware plain OR / row-value compare, and `keysetStrategy` (`auto` | `portable`). Default (unmarked) leading sorts stay on the null-safe path.
