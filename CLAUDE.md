# CLAUDE.md — Astraya

## Onboarding
1. Read `CLAUDE.md` + `docs/DEPENDENCIES.md`.
2. Check local `MAP.md` in target directory before inspecting files.
3. Use `.claudeignore` to exclude search paths; every major directory maintains its own `MAP.md`.

## Documentation Maintenance
When creating/deleting/renaming files with significant responsibility changes:
- Update local `MAP.md` (Domain Purpose, Responsibility, Key Dependencies).
- Add/verify JSDoc `@module` headers (`@purpose`, `@conventions`, `@exports`).
- Update `docs/DEPENDENCIES.md` if external dependencies change.

## Critical Commands
- `npm install` (Node >=24; use npm, not yarn/pnpm).
- `npm run check` (format/lint/typecheck/test gate; must pass before PR).
- `npm run test` (Vitest + **non-waivable NASA JPL 0.2″ golden-chart gate**).
- `npm run test:e2e` (Playwright against `dist/`; separate runner from `.test.ts`).
- `npm run docker:smoke` (release safety gate: Docker image + CSP/health check).
- `npm run corpus:audit` (tools/corpus-gen/; API keys required, costs money, never in CI).

## Strictly Enforced Boundaries
These cause build/CI failures if violated:
1. **`sweph-wasm` import boundary:** Only `src/ephemeris/`. All other code → `EphemerisProvider`.
2. **`tools/` import boundary:** `src/` CANNOT import from `tools/` (prevents shipping LLM tools in bundle).
3. **Tier 2 LLM import boundary:** Only `server/interpretation/llm-client.ts` calls LLM. `src/` can never import it (`test/no-runtime-llm-access.test.ts` enforces).

## Code Standards (Build/Lint Enforced)
- **TypeScript strict flags:** `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- **ESLint:** `strictTypeChecked` + `stylisticTypeChecked`. No `!` assertions; `interface` not `type`; no floating promises.
- **JSDoc:** All `.ts`/`.js` files must have `@module` header.
- **Pattern:** Pure TS (`.ts`), thin React (`.tsx`); test math directly in `.ts`.
- **Domain Integrity:** No invented numbers/orbs; cite sources or reference tests for all house systems/conventions.
- **Dependencies:** AGPL-3.0 compatible only (MIT/BSD/Apache-2.0/ISC/CC0). Heavy deps use dynamic `import()`. `scripts/check-bundle-size.mjs` enforces lazy loading.

## i18n & Testing
- **i18n:** Co-located `*.messages.ts` with `{ en, nl }` pairs; both locales must have parity.
- **Testing:** Real Swiss Ephemeris via `test/engine-harness.ts` (no mocks). Never hit paid APIs in automated runs.

## Git Workflow
- **Commits:** `type(scope): subject` where scope is issue # (e.g., `feat(#441): ...`). Release automation parses this.
- **Branches:** `fix/441-description`, merged `--no-ff` to `main`.
- **Issues:** Open until released; tick checklist items as PRs land.
- **Releases:** Touch `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md` badge. Semantic versioning.
