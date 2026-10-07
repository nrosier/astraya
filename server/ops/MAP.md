# server/ops/ — Map

Op-log sync relay: HTTP routes, at-rest encryption, right-to-erasure purge, key-rotation operator script.

- `crypto.ts` — Whole-payload AES-256-GCM encrypt/decrypt (authenticated). Loads/validates `ASTRAYA_ENCRYPTION_KEY`. "Never store unencrypted" guarantee. Deps: node:crypto.
- `deletion-impact.ts` — Pre-delete preview: scan (bounded) + decrypt user's ops, count distinct people/charts, approximate if truncated/no key. Deps: db, crypto.
- `purge.ts` — Right-to-erasure (#308): maintains `purged_entities` deny-list, on purge-marker push erases every op row naming that entity (except marker itself). Deps: db, crypto.
- `rotate-key.ts` — CLI script (server stopped): re-encrypt every op row under new key in all-or-nothing transaction. Remediation for leaked key (#340). Deps: db, crypto.
- `routes.ts` — Sync protocol HTTP surface: `POST /api/ops` (idempotent append, clock-skew quarantine, purge handling), `GET /api/ops` (paginated pull since sequence number). Both user-scoped, disabled (503) without encryption key. Deps: db, auth/identity, src/store/hlc, crypto, purge.
