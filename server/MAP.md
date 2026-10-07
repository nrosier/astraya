# server/ — Map

9 root files + 3 subdirectories. See `server/auth/MAP.md`, `server/ops/MAP.md`, `server/interpretation/MAP.md`.

- `corpus-candidates-routes.ts` — Admin review surface for bulk-generated corpus text (#370). List/filter/import/accept/reject pending candidates (lint-checked on accept). Deps: corpus-candidates, auth/identity, src/interpretation/lint.
- `corpus-candidates.ts` — Pending-candidate queue: CRUD, bulk-import (idempotent per key/locale/source), accept/reject (promotes to override or deletes). Deps: db, corpus-overrides.
- `corpus-overrides-routes.ts` — Admin corpus corrections + public read route (merged into runtime corpus). `GET /api/corpus-overrides/:locale`, `requireAdmin` list/upsert/delete/export. Deps: corpus-overrides, auth/identity, src/interpretation/lint.
- `corpus-overrides.ts` — Data layer: CRUD `corpus_overrides` table, shape back to `CorpusEntry`, optional username hiding for public route. Deps: db, type-only imports from src/interpretation/schema.
- `csp.ts` — Single CSP definition (structural truth: "shipped app never calls model provider at runtime"). Builds response-header + meta-tag strings, strips static tag once issuer set. Deps: none.
- `csrf.ts` — CSRF defence (Origin header host check against allowed hosts, never relay on SameSite). Deps: none.
- `db.ts` — SQLite: accounts, sessions, opaque per-user op-log, admin-curated exceptions (corpus overrides/candidates, Tier 2 usage/results). Opens, numbered migrations, append-only. Deps: node:sqlite.
- `index.ts` — HTTP server (Fastify, SPA with SPA fallback, CSP/security headers, CSRF check, database, route registration). Deps: db, csp, csrf, auth/routes, auth/admin-routes, auth/oidc, auth/admin-promotion, ops/routes, corpus-overrides-routes, corpus-candidates-routes, interpretation-routes.
- `interpretation-routes.ts` — Tier 2 opt-in AI-customized interpretation, per-request, user/admin features. Mode validation, rate limiting + dollar caps, custom instruction verification, result save/list/reopen. Deps: auth/identity, interpretation/llm-client, interpretation/usage, interpretation/results, interpretation/description, ops/crypto, src modules.
