# server/auth/ — Map

Sessions, OIDC, password/argon2, roles (user/admin/super_admin), login throttling, account management.

- `admin-promotion.ts` — Grant admin/super-admin via env allowlist (local accounts) or OIDC group claim. Matches, promotes (never demotes), produces startup/sign-in logs. Deps: db, identity, roles.
- `admin-routes.ts` — Account management (#135, #431): list/create/reset-password/disable/enable/change-role/delete users (super-admin-only mutations, never demote/disable/delete last super admin, nobody changes own role). Deletion-impact preview; last seen from `users.last_seen_at`. Deps: db, identity, roles, oidc, sessions, ops/crypto, ops/deletion-impact.
- `bootstrap.ts` — First admin account: one-time, log-printed/env-supplied token gates `/api/setup`. Re-arms if no usable super admin. Deps: node:crypto.
- `identity.ts` — Single place: "who is this request from, what role" (session cookie → `User`, builds/looks up users). Exposes `requireUser`/`requireAdmin`/`requireSuperAdmin` Fastify preHandlers. Deps: db, roles, sessions.
- `login-totp.ts` — TOTP second step of `/api/auth/login` (#1500): after the password, requires a current or recovery code for an enabled account, replay-checked, fails closed. Deps: totp, totp-store, ops/crypto.
- `login-throttle.ts` — Per-username failed-attempt tracking (sliding window, periodic sweep). Deps: none.
- `oidc.ts` — Authentik/OIDC integration (#75-#77, #136): config loading, discovery (cached), code→ID-token server-side, token verification (signature/issuer/audience/expiry via `jose`). Deps: jose.
- `passwords.ts` — Hash/verify/weak-check via `@node-rs/argon2`. Fixed dummy hash for nonexistent-username timing equalization. Deps: @node-rs/argon2.
- `roles.ts` — Three-tier rank (user/admin/super_admin): numeric rank, `hasRole`/`higherRole` helpers. Deps: none.
- `routes.ts` — HTTP surface: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, OIDC config/callback, `/api/setup`, `/api/auth/set-password`. Wires throttling, promotion, password checks, the TOTP second step, session creation. Deps: admin-promotion, bootstrap, identity, login-throttle, login-totp, oidc, passwords, sessions.
- `sessions.ts` — Session CRUD (create/lookup/throttled touch/revoke, sliding-expiry, OIDC shorter TTL) and the batched expired-session sweep; stamps `users.last_seen_at`. Revocation takes immediate effect. Stores only a hash of the cookie value. Deps: db, token-hash, node:timers/promises.
- `token-hash.ts` — Single SHA-256 hex helper for bearer secrets stored at rest (session ids, set-password tokens). Deps: node:crypto.
- `totp-routes.ts` — TOTP HTTP surface (#1500): `POST /api/auth/totp/enrol`, `/confirm` and `/disable` (code required), password and code failures on the shared login throttle, other sessions ended on confirm. Deps: identity, login-throttle, login-totp, passwords, sessions, totp, totp-store, ops/crypto.
- `totp-store.ts` — TOTP two-factor storage (#1500): per-user encrypted secret, replay-guard step, peppered-HMAC recovery codes, atomic enrolment completion (`completeTotpEnrolment`, needs a full code list), savepoint writes that nest in a caller's transaction and never mask the original error; fails closed. Called by `totp-routes` and `login-totp`. Deps: db, ops/crypto, totp.
- `totp-keys.ts` — Internal TOTP key helpers (per-user HKDF subkey, encrypted recovery-code pepper); used only by the TOTP store and key rotation, not routes. Deps: db, ops/crypto.
- `totp.ts` — Pure RFC 6238 TOTP primitives (exports the algorithm, digits and period constants; SHA-1, 6 digits, ±1 step window, replay-checked verify, base32 secret). No storage or route. Deps: node:crypto.
