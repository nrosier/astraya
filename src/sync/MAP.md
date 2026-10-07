# src/sync/ — Map

Thin `fetch()` clients mirroring server routes (one function per route). Auth, admin, ops, corpus-overrides/candidates.

- `admin-client.ts` — Admin UI surface: manage users, corpus overrides, corpus candidate triage, view interpretation usage/cost. Typed to mirror `server/auth/admin-routes.ts`, etc. Deps: interpretation/schema, auth-client.
- `auth-client.ts` — Client's only auth surface (login, logout, session check, OIDC, password set/bootstrap). Treats 401 from `me()` as "not signed in". Deps: none.
- `engine.ts` — Keep local op-log ↔ server opaque relay converged (background push-pull with exponential backoff, decode tolerance, own-record filtering, clock-skew quarantine). Deps: store/hlc, store/ops, store/store, ui/status, trace.
