# server/auth/ — file map

Sessions, OIDC, password/argon2, roles (user/admin/super_admin), login throttling, and
admin account-management routes.

### `admin-promotion.ts`
Domain Purpose: lets an operator grant admin/super-admin without a manual per-user action, for both local accounts (env username allowlist) and SSO accounts (OIDC group claim). Responsibility: reads the four `ASTRAYA_*ADMIN*` env allowlists, matches a username or a token's groups against them, and promotes (never demotes) a user to the matched role; also produces the human-readable startup/sign-in log messages describing what was configured and what matched. Key Dependencies: `../db.ts`, `./identity.ts` (`roleFields`), `./roles.ts` (`hasRole`/`higherRole`); consumed by `./routes.ts` (local login, OIDC callback) and `../index.ts` (startup notice).

### `admin-routes.ts`
Domain Purpose: the admin UI's account-management backend (#135, #431). Responsibility: list/create/reset-password/disable/enable/change-role/delete users, plus a pre-delete deletion-impact preview; listing is any-admin, every mutating action is super-admin-only, and the module enforces "never demote/disable/delete the last usable super admin" and "nobody can change their own role". Key Dependencies: `../db.ts`, `./identity.ts`, `./roles.ts`, `./oidc.ts`, `./sessions.ts`, `../ops/crypto.ts`, `../ops/deletion-impact.ts`; registered from `../index.ts`.

### `bootstrap.ts`
Domain Purpose: safely creating the very first admin account on a fresh deployment — the moment every mechanism for doing it is also a mechanism for an attacker to do it. Responsibility: issues (and constant-time-verifies) a one-time, log-printed or env-supplied token that gates `/api/setup`; re-arms whenever no usable super admin exists. Key Dependencies: `node:crypto`; consumed by `./routes.ts` (`/api/setup`) and `../index.ts` (startup announcement).

### `identity.ts`
Domain Purpose: the single place every route asks "who is this request from" and "do they have this role", so that question never gets re-answered ad hoc per handler. Responsibility: resolves a session cookie to a `User`, builds/looks up users (local, OIDC, password-set-token), and exposes `requireUser`/`requireAdmin`/`requireSuperAdmin` as Fastify preHandlers. Key Dependencies: `../db.ts`, `./roles.ts`, `./sessions.ts`; imported throughout `server/` (routes, admin-routes, ops/routes, corpus/interpretation routes) wherever a request needs an authenticated identity.

### `login-throttle.ts`
Domain Purpose: the account-centric half of brute-force login defence that a per-IP rate limiter can't provide. Responsibility: tracks failed attempts per (case-insensitive) username in an in-memory map with a sliding window, exposing throttle-check/record/clear, plus a periodic sweep so an attacker cycling through fake usernames can't grow the map unbounded. Key Dependencies: none (self-contained); consumed by `./routes.ts`'s login route.

### `oidc.ts`
Domain Purpose: the Authentik/OIDC integration (#75-#77, #136) that lets Astraya trust an external identity provider without the browser ever holding a token. Responsibility: loads/validates `ASTRAYA_OIDC_*` config, performs discovery (cached per issuer), exchanges an authorization code for an ID token server-side, and verifies that token's signature/issuer/audience/expiry via `jose`. Key Dependencies: `jose`; consumed by `./routes.ts` (callback, config endpoint, logout) and `../index.ts` (CSP scoping, startup notice).

### `passwords.ts`
Domain Purpose: the one place passwords are hashed, verified, and judged too weak to accept. Responsibility: wraps `@node-rs/argon2` for hash/verify, defines a weak-password/common-password check, and provides a fixed dummy hash used to equalize login-attempt timing for nonexistent usernames. Key Dependencies: `@node-rs/argon2`; consumed by `./routes.ts` (login, setup, set-password) and `./admin-routes.ts`-adjacent flows that mint/consume password-set tokens.

### `roles.ts`
Domain Purpose: the single definition of Astraya's three-tier account rank (#431), so "can this user do X" is always a rank comparison, never a scattered flag check. Responsibility: defines `ROLES`, a numeric rank table, and `hasRole`/`higherRole` helpers. Key Dependencies: none; imported by `./identity.ts`, `./admin-routes.ts`, `./admin-promotion.ts`, and anywhere a role needs validating or comparing.

### `routes.ts`
Domain Purpose: the actual HTTP surface a browser talks to for signing in — local or OIDC — and for bootstrapping the first account. Responsibility: registers `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, OIDC config/callback, `/api/setup`, and `/api/auth/set-password`, wiring together throttling, promotion, password checks, and session creation. Key Dependencies: `./admin-promotion.ts`, `./bootstrap.ts`, `./identity.ts`, `./login-throttle.ts`, `./oidc.ts`, `./passwords.ts`, `./sessions.ts`; registered from `../index.ts`.

### `sessions.ts`
Domain Purpose: makes session revocation (disabling a user, signing out) take effect immediately, which a self-contained signed token (JWT) structurally cannot do without its own revocation list. Responsibility: creates/looks up/touches (sliding-expiry)/revokes session rows, with a shorter TTL for OIDC-derived sessions than local ones. Key Dependencies: `../db.ts`; consumed by `./identity.ts` (session resolution), `./routes.ts` (login/logout/callback), `./admin-routes.ts` (revoking on disable).
