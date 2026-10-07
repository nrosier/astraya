# server/auth/ — Map

Sessions, OIDC, password/argon2, roles (user/admin/super_admin), login throttling, account management.

- `admin-promotion.ts` — Grant admin/super-admin via env allowlist (local accounts) or OIDC group claim. Matches, promotes (never demotes), produces startup/sign-in logs. Deps: db, identity, roles.
- `admin-routes.ts` — Account management (#135, #431): list/create/reset-password/disable/enable/change-role/delete users (super-admin-only mutations, never demote/disable/delete last super admin, nobody changes own role). Deletion-impact preview. Deps: db, identity, roles, oidc, sessions, ops/crypto, ops/deletion-impact.
- `bootstrap.ts` — First admin account: one-time, log-printed/env-supplied token gates `/api/setup`. Re-arms if no usable super admin. Deps: node:crypto.
- `identity.ts` — Single place: "who is this request from, what role" (session cookie → `User`, builds/looks up users). Exposes `requireUser`/`requireAdmin`/`requireSuperAdmin` Fastify preHandlers. Deps: db, roles, sessions.
- `login-throttle.ts` — Per-username failed-attempt tracking (sliding window, periodic sweep). Deps: none.
- `oidc.ts` — Authentik/OIDC integration (#75-#77, #136): config loading, discovery (cached), code→ID-token server-side, token verification (signature/issuer/audience/expiry via `jose`). Deps: jose.
- `passwords.ts` — Hash/verify/weak-check via `@node-rs/argon2`. Fixed dummy hash for nonexistent-username timing equalization. Deps: @node-rs/argon2.
- `roles.ts` — Three-tier rank (user/admin/super_admin): numeric rank, `hasRole`/`higherRole` helpers. Deps: none.
- `routes.ts` — HTTP surface: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, OIDC config/callback, `/api/setup`, `/api/auth/set-password`. Wires throttling, promotion, password checks, session creation. Deps: admin-promotion, bootstrap, identity, login-throttle, oidc, passwords, sessions.
- `sessions.ts` — Session CRUD (create/lookup/touch/revoke, sliding-expiry, OIDC shorter TTL). Revocation takes immediate effect. Deps: db.
