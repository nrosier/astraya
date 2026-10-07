# server/ops/ — file map

The op-log sync relay: the HTTP routes, at-rest encryption, right-to-erasure purge
(and its pre-delete preview), and the key-rotation operator script.

### `crypto.ts`
Domain Purpose: makes the sync relay's "never store a payload unencrypted" guarantee (#92) a real, enforced property rather than a policy. Responsibility: whole-payload AES-256-GCM encrypt/decrypt (authenticated, so a tampered row fails loudly) and loading/validating `ASTRAYA_ENCRYPTION_KEY`. Key Dependencies: `node:crypto`; consumed by `./routes.ts`, `./purge.ts`, `./deletion-impact.ts`, `./rotate-key.ts`, and `../interpretation/results.ts`.

### `deletion-impact.ts`
Domain Purpose: gives an admin a real sense of what an irreversible account delete would take with it, before they confirm it. Responsibility: scans (bounded) and decrypts a user's op rows just enough to count distinct people/charts, degrading to an approximate row count when the scan was truncated or no encryption key is available. Key Dependencies: `../db.ts`, `./crypto.ts`; consumed by `../auth/admin-routes.ts`'s deletion-impact route.

### `purge.ts`
Domain Purpose: makes a right-to-erasure purge (#308) a real, permanent, cross-device deletion rather than a client-side hidden flag. Responsibility: maintains the `purged_entities` deny-list and, the moment a purge-marker op is pushed, erases every already-stored op row naming that entity (except the marker's own row, so later pulls still see the erasure). Key Dependencies: `../db.ts`, `./crypto.ts`; consumed by `./routes.ts` (checked/triggered inline during a push) and `../auth/admin-routes.ts`'s deletion-impact preview path indirectly via the same deny-list concept.

### `rotate-key.ts`
Domain Purpose: the remediation path for a leaked `ASTRAYA_ENCRYPTION_KEY` (#340) — without it there is no way to recover other than hand-written SQL. Responsibility: a CLI script (run with the server stopped) that re-encrypts every stored `ops` row under a new key in one all-or-nothing transaction, failing before writing anything if a row doesn't decrypt under the stated current key. Key Dependencies: `../db.ts` (`openDatabase`), `./crypto.ts`; not an HTTP route — deliberately only reachable with shell/container access.

### `routes.ts`
Domain Purpose: the actual sync protocol's HTTP surface (#102) — this is what a client's op-log engine talks to. Responsibility: registers `POST /api/ops` (batched, idempotent, transactional append with clock-skew quarantine and purge-marker handling) and `GET /api/ops` (paginated pull since a sequence number), both scoped to the authenticated user and both disabled (503) when the relay has no encryption key configured. Key Dependencies: `../db.ts`, `../auth/identity.ts` (`requireUser`), `../../src/store/hlc.ts`, `./crypto.ts`, `./purge.ts`; registered from `../index.ts`.
