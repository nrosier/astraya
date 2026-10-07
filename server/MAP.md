# server/ — file map

Covers the 9 TypeScript files directly in `server/` (root). See `server/auth/MAP.md`,
`server/interpretation/MAP.md`, and `server/ops/MAP.md` for their subdirectories.

### `corpus-candidates-routes.ts`
Domain Purpose: the admin review surface for bulk-generated interpretation-corpus text (#370), upstream of the admin-editable overrides. Responsibility: list/filter the pending queue, import a fresh generation batch, and accept/reject one or many candidates — every route is `requireAdmin`-gated, and accepting runs the same content-quality lint an admin's own correction gets. Key Dependencies: `corpus-candidates.ts` for the data layer, `auth/identity.ts` for `requireAdmin`, `src/interpretation/lint.ts` for the quality gate; registered from `index.ts`.

### `corpus-candidates.ts`
Domain Purpose: the pending-candidate queue (#370) that keeps a freshly-generated corpus entry invisible to every reader until an admin accepts it, unlike a live override. Responsibility: CRUD against the `corpus_candidates` table — list, bulk-import (idempotent per `(key, locale, source)`), and accept/reject (accepting promotes to a real override and deletes the candidate row either way). Key Dependencies: `db.ts`'s `Database` type, `corpus-overrides.ts`'s `upsertCorpusOverride`; consumed by `corpus-candidates-routes.ts`.

### `corpus-overrides-routes.ts`
Domain Purpose: lets an admin correct a committed interpretation-corpus entry's displayed text without touching the committed JSON (#292), and lets every visitor — signed in or not — actually see that correction. Responsibility: one deliberately public read route (`GET /api/corpus-overrides/:locale`) merged into the client's runtime corpus, plus `requireAdmin`-gated list/upsert/delete/export routes; upserts are lint-checked before being stored. Key Dependencies: `corpus-overrides.ts` for the data layer, `auth/identity.ts` for `requireAdmin`, `src/interpretation/lint.ts`; registered from `index.ts`.

### `corpus-overrides.ts`
Domain Purpose: the data layer behind admin corrections to the shipped interpretation corpus. Responsibility: CRUD against the `corpus_overrides` table, and shaping a stored override back into the `CorpusEntry` the client merge/export expects (optionally hiding the reviewing admin's username for the public route). Key Dependencies: `db.ts`'s `Database` type; only `import type`s from `src/interpretation/schema.ts` (a value import would crash the server's plain-Node module resolution); consumed by `corpus-overrides-routes.ts` and `corpus-candidates.ts`.

### `csp.ts`
Domain Purpose: the single definition of Astraya's Content Security Policy, which must stay structurally true to "the shipped app never calls a model provider at runtime". Responsibility: builds the policy directives, optionally scoped to a configured OIDC issuer and/or a self-hosted geocode origin, and exposes both the response-header string and the `<meta>`-tag string so they can never drift; also strips the static meta tag from a served `index.html` once an issuer makes the header the only correct copy. Key Dependencies: none (self-contained); consumed by `index.ts` and asserted against by `test/csp.test.ts`.

### `csrf.ts`
Domain Purpose: cross-site request forgery defence that doesn't depend on the session cookie's `SameSite` setting or a body-parser default, i.e. a check this server actually owns. Responsibility: decides whether an incoming write (POST/PUT/PATCH/DELETE) should be refused as cross-origin, comparing the request's `Origin` header's host against this deployment's own allowed hosts. Key Dependencies: none; invoked from `index.ts`'s `onRequest` hook, ahead of every route.

### `db.ts`
Domain Purpose: owns the sync server's own database — accounts, sessions, and the opaque per-user operation log (ADR 0002), plus a short, explicit list of admin-curated exceptions (corpus overrides/candidates, interpretation usage/results). Responsibility: opens (and creates) the SQLite file via `node:sqlite`, and runs an ordered, append-only list of numbered migrations inside transactions, with foreign-key-off handling for the few steps that rebuild a referenced table. Key Dependencies: `node:sqlite`; imported by nearly every other server module for the `Database` type and by `index.ts` to open the database at boot.

### `index.ts`
Domain Purpose: the actual Astraya HTTP server — the thing that answers requests. Responsibility: Fastify app factory and process entry point; serves the built SPA with an SPA fallback, applies the CSP/security headers and the CSRF origin check to every route, opens the database, and registers every route module (auth, admin, ops, corpus overrides/candidates, interpretation). Key Dependencies: `db.ts`, `csp.ts`, `csrf.ts`, `auth/routes.ts`, `auth/admin-routes.ts`, `auth/oidc.ts`, `auth/admin-promotion.ts`, `ops/routes.ts`, `corpus-overrides-routes.ts`, `corpus-candidates-routes.ts`, `interpretation-routes.ts`.

### `interpretation-routes.ts`
Domain Purpose: Tier 2, the one opt-in, per-request feature that lets a reader get an AI-customized interpretation, and the only runtime code path that reaches a third-party LLM (ADR 0003). Responsibility: validates and routes four generation modes (grounded, freeform, focus, relationship) against closed reference sets before building a model prompt, enforces per-user rate limiting plus two real daily dollar caps, verifies a reader's custom instruction before using it, and saves/lists/reopens past results. Key Dependencies: `auth/identity.ts` (`requireUser`/`requireAdmin`), `interpretation/llm-client.ts`, `interpretation/usage.ts`, `interpretation/description.ts`, `interpretation/results.ts`, `ops/crypto.ts`, several `src/interpretation/*` and `src/astrology/*` modules for key/data validation and fact formatting.
