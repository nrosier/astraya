# src/sync/ — Map

Thin `fetch()` clients mirroring the server's own route shapes, one function per route
(auth, admin, ops, corpus-overrides/candidates).

### `admin-client.ts`
**Domain purpose:** Lets the admin UI manage users, corpus overrides, corpus candidate triage, and view interpretation usage/cost, without duplicating any server-side logic client-side. **Responsibility:** Provides one `fetch()`-wrapping function per admin route, each typed to mirror its server route file's response shape exactly, throwing `AdminError` with the server's own message on failure. **Key dependencies:** Imports `../interpretation/schema.js` (`CorpusTier`, `Locale`) and `auth-client.ts` (`Role`); mirrors `server/auth/admin-routes.ts`, `server/corpus-overrides.ts`, `server/corpus-candidates.ts`, `server/interpretation/usage.ts`.

### `auth-client.ts`
**Domain purpose:** Is the client's only authentication surface — login, logout, session check, OIDC sign-in, password set/bootstrap — deliberately leaving all identity decisions to the server. **Responsibility:** Wraps each `server/auth/routes.ts` endpoint in a typed function, treating a 401 from `me()` as "not signed in" rather than an error, and throwing `AuthError` otherwise. **Key dependencies:** No internal imports; mirrors `server/auth/roles.ts`, `server/auth/identity.ts`, `server/auth/oidc.ts`, `server/auth/bootstrap.ts`; used by the UI's sign-in flow and by `engine.ts`'s `onUnauthorized` callers.

### `engine.ts`
**Domain purpose:** Keeps a signed-in device's local op-log and the server's opaque relay converged, pushing local edits and pulling peer edits in the background while tolerating being interrupted at any point (#103). **Responsibility:** Implements `createSyncEngine`: a debounced/polled push-pull loop with exponential backoff on failure (#106), per-row decode-failure tolerance on pull (#320), own-record-only filtering on push (#324), and quarantine of permanently clock-skew-refused records (#312). **Key dependencies:** Imports `../store/hlc.js`, `../store/ops.js`, `../store/store.js` (`Store`, `SyncCursor`), `../ui/status.js` (`SyncState`), `../trace.js`; talks to `server/ops/routes.ts`.
