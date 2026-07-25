---
'kysely-cursor': minor
---

Optimize keyset WHERE emission for non-null sorts: optional `nullable: false` on sort items, dialect-aware plain OR / row-value compare, and `keysetStrategy` (`auto` | `portable` | `seek`). Default (unmarked) leading sorts stay on the null-safe path.
