---
'kysely-cursor': minor
---

Remediations for the 0.2 line: ESM-only package (drop CJS entry; Node `engines` ≥ 20), export sort/cursor types (`SortSet`, `CursorPayload`, `CURSOR_VERSION`, `Stash`, …) as types, export `emitKeysetPredicate`, optional `maxLimit`, empty offset past end sets `hasPrevPage` without inventing a keyset prev, AES codec derives key once (payload v2 — discard outstanding encrypted tokens; high-entropy secret ≥ 16), `base64UrlCodec` validates alphabet, `Stash.get` may return null, and README footguns / offset hybrid docs.
