# server/ops/ — Map

Op-log sync relay: HTTP routes, at-rest encryption, right-to-erasure purge, key-rotation operator script.

- `crypto.ts` — Whole-payload AES-256-GCM encrypt/decrypt (authenticated); decrypt zeroes its intermediate plaintext chunks. Loads/validates `ASTRAYA_ENCRYPTION_KEY`. "Never store unencrypted" guarantee. Deps: node:crypto.
- `deletion-impact.ts` — Pre-delete preview: scan (bounded) + decrypt user's ops, count distinct people/charts, approximate if truncated/no key. Deps: db, crypto.
- `purge.ts` — Right-to-erasure (#308): maintains `purged_entities` deny-list, on purge-marker push erases every op row naming that entity (except marker itself). Deps: db, crypto.
- `reset-totp.ts` — CLI script (server stopped, refuses without `--yes`): clears TOTP for every user, deletes all recovery codes and the pepper in one transaction, keeps sessions. Key-leak step after rotation (#1782). Deps: db.
- `rotate-key.ts` — CLI script (server stopped): re-encrypt ops, saved interpretation results, TOTP secrets and the recovery pepper under a new key in one all-or-nothing transaction. Remediation for leaked key (#340, #1680, #1500). Deps: db, crypto, auth/totp-store.
- `routes.ts` — Sync protocol HTTP surface: `POST /api/ops` (idempotent append, clock-skew quarantine, purge handling), `GET /api/ops` (paginated pull since sequence number). Both user-scoped, refuse a missing or mismatched `X-Astraya-Account` header (#1378), disabled (503) without encryption key. Deps: db, auth/identity, src/store/hlc, crypto, purge.
