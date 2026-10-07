Here is the updated, compacted `CLAUDE.md` incorporating the **Session Onboarding Rules**, **Documentation & Map Maintenance Rules**, and **Context Indexing Patterns** (`MAP.md`, `@module` headers, `docs/DEPENDENCIES.md`):

```markdown
# CLAUDE.md — Astraya

## Project Overview
Local-first astrological calculation and charting webapp (`v0.28.0`).
- **Core Stack:** Local IndexedDB op-log (source of truth), pure SVG charting, offline Swiss Ephemeris (validated against NASA JPL Horizons). Optional multi-device sync server.
- **LLM/AI Policy:** Interpretation prose corpus built via LLM **at build time**. Runtime makes NO model calls except for explicit, per-request Tier 2 custom interpretations (ADR 0003).
- **In-Progress/Unbuilt Features:** Check open issues (#407 Primary directions, #405 Degree symbols) before assuming existence. #441 (PDF export) is partially built.

## Session Onboarding Rules
Before reading full implementation code or searching the directory tree:
1. Read `CLAUDE.md` and `docs/DEPENDENCIES.md` first.
2. Check the local `MAP.md` in a target directory before inspecting individual files.
3. Avoid executing repo-wide wildcard searches unless map files are insufficient.

## Documentation & Map Maintenance Rules
Whenever you create, delete, rename, or significantly alter a file's responsibility:
1. Update the local `MAP.md` in that file's directory (1-2 line summary of **Domain Purpose**, **Responsibility**, and **Key Dependencies**).
2. Ensure the top-level JSDoc `@module` header (`@module`, `@purpose`, `@conventions`, `@exports`) is present and accurate.
3. Update `docs/DEPENDENCIES.md` if external dependencies or core wrappers change.

## Essential Commands
- **Install:** `npm install` (Node >=24; strictly use `npm`).
- **Dev:** `npm run dev` (client only) | `npm run serve` or `node server/index.ts` (API + static, native TS).
- **Build:** `npm run build` (`tsc -b && vite build && vite build --config vite.sw.config.ts`).
- **Check/Gate:** `npm run check` (Runs format/lint/typecheck/unit tests. Must pass before committing/PR).
- **Unit Tests:** `npm run test` (Vitest, includes non-waivable NASA JPL 0.2″ golden-chart gate) | `npx vitest run path/to/file.test.ts -t "test name"`.
- **E2E Tests:** `npm run test:e2e` (Playwright) | `npx playwright test e2e/file.spec.ts` (against `dist/`). *Do not mix Vitest (.test.ts) and Playwright (.spec.ts) runners.*
- **Lint/Type/Format:** `npm run lint:fix` | `npm run typecheck` | `npm run format`.
- **Smoke/Release:** `npm run docker:smoke` (Docker image + CSP/health check).
- **Corpus Tools (`tools/corpus-gen/`):** API keys required. Costs real money per run. Never run in CI.

## Architecture & Structural Rules

```

src/
ephemeris/      Boundary for sweph-wasm. Web Worker in app, direct in tests.
astrology/      Pure calculation (bodies, houses, progression, etc.). No DOM/React.
domain/         Composes astrology/ into UI views (ChartData, table rows). Pure/async.
interpretation/ Prose corpus, report composer, schema, Tier 2 client contract.
chart/          SVG components, glyphs (vector paths, no icon fonts for CSP), diagrams.
store/          IndexedDB op-log (HLC-ordered). Frozen synced spine (ADR 0002).
sync/           Fetch clients mirroring server routes.
time/           Julian day resolution, DST/calendar logic, share URL encoding.
pwa/            Service worker cache management.
ui/             React UI (~150 screens/components), *.messages.ts i18n, hash router.
Holds cross-cutting helpers (e.g. pdf-export-plan.ts).
server/           Fastify API factory (`index.ts`), node:sqlite (`db.ts`), Auth, Ops sync, Tier 2 LLM.
tools/corpus-gen/ Build-time LLM corpus generation loop.
test/ & e2e/      Vitest engine harness (`test/`) vs real browser specs (`e2e/`).

```

### Context & Search Hygiene
- Maintain `.claudeignore` at the repo root to exclude heavy paths (`node_modules/`, `dist/`, `build/`, `*.log`) from search and context loading.
- Every major directory under `src/`, `server/`, and `tools/` maintains its own `MAP.md` for fast context indexing.

### Strictly Enforced Boundaries (`eslint.config.js`)
1. **Ephemeris:** `sweph-wasm` MUST only be imported in `src/ephemeris/`. All other code interacts via `EphemerisProvider`.
2. **Tools:** `src/` CANNOT import from `tools/` (prevents shipping LLM generation tools in client bundle).

## Code Style & Constraints
- **Header Standards:** All TS/JS files must maintain standard JSDoc `@module` headers defining purpose, conventions, and key exports.
- **TypeScript:** Strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`).
- **ESLint:** `strictTypeChecked` + `stylisticTypeChecked`. No non-null assertions (`!`), use `interface` over `type`, no floating promises.
- **Pattern:** Pure TS logic core (`.ts`), thin UI components (`.tsx`). Test math directly in `.ts`.
- **Domain Integrity:** No invented numbers/orbs. All house systems/conventions must have doc-comments citing sources or reference tests.
- **Licensing & Dependencies:** AGPL-3.0 compatible only (MIT/BSD/Apache-2.0/ISC/CC0). Prefer hand-rolled SVG. Heavy dependencies must be dynamic imports (`import()`).
- **Lazy Loading:** `scripts/check-bundle-size.mjs` enforces dynamic loading for admin, ephemeris engine, heavy screens, and PDF generators to preserve eager bundle limits.

## i18n & Testing
- **i18n:** Co-located `*.messages.ts` with `{ en, nl }` pairs. Both languages require parity.
- **Testing Standard:** Real Swiss Ephemeris engine used via `test/engine-harness.ts` (no mocks). Never hit paid external APIs in automated unit/e2e runs (mock responses instead).

## Workflow & Git Conventions
- **Commits:** Conventional format `type(scope): subject` where scope is issue # (e.g. `feat(#441): ...`). Mechanics rely on this to generate release drafts.
- **Branches:** `fix/441-description`, merged via `git merge --no-ff` to `main`.
- **Issues:** Kept open until released. Mark checklist items on issue as PRs land.
- **Release Updates:** Releases touch `package.json`, `package-lock.json`, `CHANGELOG.md`, and `README.md` badge. Milestone-driven versioning (`v0.1.0` -> `v1.0.0`).
- **Docs/Agents:** GitHub Issues via `gh` CLI. Repo docs use root `CONTEXT.md`, `MAP.md` indexes, `docs/DEPENDENCIES.md`, and `docs/adr/`.

```
