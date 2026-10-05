# CLAUDE.md — Astraya

## Project overview

Astraya is a local-first astrological calculation and charting webapp. A user enters a
birth date, time and place; the app computes a real chart (Swiss Ephemeris, validated
against NASA JPL Horizons, never a value written from memory) and draws it as hand-rolled
SVG. The authoritative copy of a person's data lives in the browser's IndexedDB — not a
server cache — so the app works fully offline; an optional account syncs an op-log between
devices. Interpretation text comes from a prose corpus drafted by an LLM **at build time**
and committed as data; the shipped app itself makes no model API calls except for the
explicit, opt-in, per-request "AI-customised" interpretation (Tier 2, consent spent on each
request, never a standing preference — ADR 0003).

Status: pre-1.0 (`v0.28.0`). Calculation, charting, progressions/returns, interpretation and
sync are built and shipping. Primary directions and a from-scratch degree-symbol corpus are
proposed features with open issues (#407, #405) and no code yet — don't assume they exist.
The PDF export builder (#441) is a recent, partially-built feature; check its issue for what
has landed before assuming a given section works.

See `README.md` for the user-facing pitch, `docs/adr/` for the three standing architecture
decisions (Swiss Ephemeris as the engine; local-first with optional sync; Tier 2 LLM
customization), and `docs/RELEASING.md` for the release process.

## Build, test & development commands

- Install: `npm install` (Node >=24; `package-lock.json` is committed, so use `npm`, not
  `pnpm`/`yarn`).
- Dev server (client only, hot reload): `npm run dev`.
- Server (API + static serving, no hot reload): `npm run serve`, or `node server/index.ts`
  directly — it runs under Node's native TypeScript support, no build step. Reads
  `ASTRAYA_DB_PATH` (defaults to `data/astraya.db`, gitignored) and `PORT` (default 8080).
- Production build: `npm run build` (`tsc -b && vite build && vite build --config
vite.sw.config.ts`, the last for the service worker).
- Unit tests (Vitest): `npm run test`, or `npx vitest run path/to/file.test.ts` for one file,
  or `npx vitest run path/to/file.test.ts -t "test name"` for one case. `npm run test:watch`
  for watch mode.
- End-to-end tests (Playwright): `npm run test:e2e` (builds first, then runs the whole
  suite), or `npx playwright test e2e/some.spec.ts` against an already-built `dist/` for one
  file. Playwright and Vitest are two different runners — do not pass a `.spec.ts` to vitest
  or a `.test.ts` to playwright.
- Lint: `npm run lint` (`npm run lint:fix` to auto-fix what's fixable).
- Format: `npm run format:check` / `npm run format` (Prettier).
- Typecheck: `npm run typecheck` (`tsc -b --noEmit`).
- Everything format/lint/typecheck/unit-tests needs before a commit lands: `npm run check`.
  This is also what CI and the release workflow run — it is the real gate, not a suggestion.
- Golden-chart gate: part of `npm run test`, not a separate command. It checks real chart
  output against NASA JPL Horizons reference values at 0.2″ tolerance and is never waived.
- Corpus tools (`tools/corpus-gen/`): need `GEMINI_API_KEY`/`OPENAI_API_KEY` in `.env.local`
  and cost real money per call — see `tools/corpus-gen/*.mjs`'s own `--help` output before
  running one, and never run them from CI or on every change.
- Docker smoke test before any release tag: `npm run docker:smoke` (builds the image and
  checks `/healthz` and the CSP header).

## Architecture & module structure

```
src/
  ephemeris/   Swiss Ephemeris boundary. sweph-wasm may be imported ONLY here (lint-enforced);
               everything else talks to the EphemerisProvider interface, so the astrology code
               is testable without WASM and the engine is swappable. Runs in a Web Worker in
               the shipped app; a direct (non-worker) implementation backs the test suite.
  astrology/   Pure astrological calculation: bodies, aspects, houses, dignities/rulership,
               sect, Arabic parts, progressions, directions, returns, synastry, electional/
               horary/rectification math, void-of-course, eclipses, fixed stars, harmonics,
               draconic transform, astrocartography math. No DOM, no React — EphemerisProvider
               in, typed data out. The biggest directory (~40 files); start here for "is this
               astrologically correct" questions.
  domain/      One level up from astrology/: composes astrology/ functions into the shapes a
               screen actually renders (ChartData, chart-tables.ts's row builders, synastry/
               composite/transit/return "domain modules"). Still pure/async, no DOM.
  interpretation/  The prose corpus (committed JSON per locale) and the composition pipeline
               that turns a ChartData + corpus into a written report (report.ts), the schema/
               key format every corpus entry follows (schema.ts), the lint/dedupe checks, and
               the Tier 2 (LLM-customized) client contract. `tools/` (below) is a sibling
               build-time generator, not a runtime dependency of this directory.
  chart/       SVG rendering: the wheel, bi-/tri-wheels, aspect matrix, diagrams, glyphs
               (vector paths — no icon font, the CSP forbids one), the standalone-export
               stylesheet, and now the PDF plan's own helper code is kept OUT of here (see
               pdf-export-plan.ts under ui/, below) specifically because it must stay
               Vitest-importable.
  store/       The IndexedDB-backed op-log: the local source of truth. HLC-ordered operations,
               folded into current state. The "spine" (ops already synced) is frozen forever —
               never replayed differently later; see ADR 0002.
  sync/        Thin fetch() clients mirroring the server's own route shapes, one function per
               route (auth, admin, ops, corpus-overrides/candidates).
  time/        Birth-moment resolution: civil date/time + place -> Julian day, with historical
               timezone/DST and calendar (Gregorian/Julian) handling, and the URL encoding used
               by shareable chart links.
  pwa/         Service worker cache-naming and precaching; versioned by release so stale
               caches evict cleanly.
  types/       Ambient .d.ts for untyped dependencies (currently just tz-lookup).
  ui/          React. ~150 files: one screen per route plus its own *.messages.ts (en/nl, see
               i18n below), hooks for device preferences (symbol class/weight, rulership
               choice, locale, theme), and route.ts (pure hash-route parsing, tested without a
               DOM). This is also where cross-cutting non-component helpers that need both
               domain/ data and chart/ rendering live, e.g. pdf-export-plan.ts/
               pdf-export-render.ts (#441) — split in two because the render half's
               dependencies (jsPDF/svg2pdf.js/jspdf-autotable) cannot even be imported under
               Vitest; see that file's own doc comment before assuming "add a test" is trivial
               for anything touching it.

server/
  index.ts       Fastify app factory + entry point. SPA fallback, CSP, static serving.
  db.ts          Synchronous node:sqlite, numbered migrations (never edit an old one in place —
                 add a new migration function to the array).
  auth/          Sessions, OIDC, password/argon2, roles (user/admin/super_admin), login
                 throttling, admin routes (users, corpus overrides/candidates, usage).
  ops/           The op-log sync relay: push/pull routes, at-rest payload encryption/rotation,
                 right-to-erasure purge + its "what would this delete" preview.
  interpretation-routes.ts + interpretation/   Tier 2 LLM-customization route, cost/usage
                 tracking, saved-result storage (encrypted, same key as ops.payload).
  corpus-overrides*.ts, corpus-candidates*.ts   Admin-editable corrections to the shipped
                 corpus, and the pending-candidate review queue for bulk-generated text.

tools/corpus-gen/   Build-time only (lint-enforced: src/ may never import tools/). The
  generator/judge/reviser loop that drafts the committed interpretation corpus. Costs real
  API money per run; see the Corpus tools note above.

scripts/   Node build/release helpers (bundle-size gate, changelog draft, ephemeris asset
  sync, Docker smoke test, corpus split for the static build).

e2e/   Playwright specs: one real browser against a real server instance per file (own
  temp SQLite db, own port). support.ts holds shared helpers (createPerson, openSettings,
  etc.) — check there before writing a new low-level DOM query by hand.

test/   Vitest specs mirroring src/'s structure, plus server-*.test.ts for the Fastify routes.
  engine-harness.ts gives a shared, real Swiss Ephemeris instance — astrology/domain tests run
  against it, never a mock of the ephemeris.

docs/   ADRs (the three standing architecture decisions), RELEASING.md, corpus key reference,
  benchmark write-ups. HTML + a lightweight markdown counterpart for new docs (since #399).
```

### The two boundaries lint enforces mechanically (`eslint.config.js`)

1. `sweph-wasm` is importable only inside `src/ephemeris/`. Everywhere else must go through
   `EphemerisProvider`.
2. `tools/` can never be imported from `src/`. The corpus generator is a build-time LLM
   client; a stray import would ship a model client in the browser bundle.

Both are `no-restricted-imports` errors, not just convention — don't work around them with a
re-export; fix the layering instead.

## Code style & engine constraints

- **TypeScript strictness:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch` are all on. `exactOptionalPropertyTypes`
  in particular means `{ x?: T }` and `{ x?: T | undefined }` are genuinely different types —
  don't silence a resulting error by widening a type; fix the call site.
- **ESLint:** `typescript-eslint`'s `strictTypeChecked` + `stylisticTypeChecked` presets, so
  this includes (among others) no non-null assertions (`!`), `consistent-type-definitions:
interface` (not `type X = {...}`), `prefer-includes`, and `no-floating-promises` (a dropped
  promise in chart code means a silently incomplete chart — this is `error`, not a style nit).
  Plus the two import boundaries above.
- **Pure core, thin UI:** astrology/ and domain/ are pure async functions, no DOM, no React —
  this is what makes them unit-testable against the real engine. A `.tsx` component should be
  thin wiring over a `.ts` module that holds the actual logic (the same "thin `.tsx`, tested
  `.ts`" split `SortableTable.tsx`/`table-sort.ts` and `ReportView.tsx`/`report-provenance.ts`
  already follow) — don't bury logic a unit test could cover directly inside a component.
- **No invented numbers.** A calculation's house system, zodiac/ayanamsa, orb convention, or
  rounding rule is stated in the code's own doc comment and backed by a cited source or a
  test against a reference value — never guessed to "look right". If a convention is genuinely
  disputed between traditions, say so in the comment rather than picking one silently.
- **Dependencies:** AGPL-3.0 (or compatible — MIT/BSD/Apache-2.0/ISC/CC0) licence only; a new
  dependency goes in `dependencies`, not `devDependencies`, if the shipped client bundle or
  the running server needs it (the Docker image's build stage needs it either way; the
  distinction is about what the _application_ needs, not where it runs — `@astrodraw/
astrochart`, a purely client-bundled charting lib, is already in `dependencies` for exactly
  this reason). Prefer a new hand-rolled SVG renderer over a third-party charting dependency
  (every chart/diagram in this app already is one) unless the dependency does something
  genuinely infeasible to hand-roll (jsPDF/svg2pdf.js/jspdf-autotable for PDF generation, #441,
  are the one recent exception, and are lazy-loaded so they never enter the eager bundle).
- **Bundle size:** `scripts/check-bundle-size.mjs` (run after `npm run build`) measures only
  the _eager_ graph (what a first-time visitor downloads before anything renders) against a
  fixed budget, and asserts the ephemeris engine, the admin panel and the per-screen person
  views stay reachable only by dynamic `import()`. A new heavy screen or library should be
  lazy-loaded (`lazy(() => import(...))` in `App.tsx`, following the existing pattern) rather
  than statically imported into the main chunk.

## i18n (en/nl)

Every user-facing string lives in a co-located `*.messages.ts` file as `{ en, nl }`, looked up
through `useMessages(someMessages)`. English and Dutch are both first-class and must stay in
parity — adding a key to one locale without the other is a bug, not a TODO. Several device
preferences (symbol class, rulership choice, theme, locale itself) are stored in
`localStorage`, never synced, never sent to the server.

## Testing conventions

- Astrology/domain tests run against the **real** Swiss Ephemeris via `test/engine-harness.ts`,
  never a mock of the engine — a test that fakes ephemeris output can't catch a real
  calculation bug.
- Unit (Vitest) vs. e2e (Playwright) split: pure logic and component behaviour with fakes goes
  in `test/`; anything that genuinely needs a real browser (actual rendering, a real download,
  a library that can't even be imported under Node/jsdom — see `pdf-export-render.ts`'s own
  doc comment for a concrete example) goes in `e2e/`, covered there instead, not faked into a
  false unit-test pass.
- Never make a real call to a paid third-party API (an LLM, a geocoder) from an automated
  test. Where a feature needs one (Tier 2 interpretation, the corpus generator), either inject
  a fake `fetch`/provider, or test only the UI gating/plumbing and leave the real call for a
  manual run.
- `npm run check` is the baseline gate for every change. Playwright e2e runs are reserved for
  UI/UX changes (the affected specs) and release time, not every commit — see
  `docs/RELEASING.md`.

## Git / workflow conventions (observed from history, not aspirational)

- Conventional commits: `type(scope): subject`, where scope is almost always a GitHub issue
  number (`feat(#441): ...`, `fix(#419): ...`, `test(#442): ...`, `chore(release): v0.28.0`).
  `scripts/changelog-draft.mjs` parses this format mechanically to draft release notes — an
  unparseable subject gets flagged, not silently included.
- One branch per issue (e.g. `fix/441-pdf-export-builder`), merged to `main` with `git merge
--no-ff` (so `Merge branch '...' (#NNN)` commits are a real, searchable record of what
  landed under which issue, not squashed away).
- An issue's checklist is ticked as parts land, with a comment on the issue describing what
  shipped and what didn't (scope cuts stated plainly, not left implicit). An issue is closed
  only once its work is in a released version, not merely merged to `main`.
- Every release updates exactly four files (`package.json`, `package-lock.json`,
  `CHANGELOG.md`, `README.md`'s badge) and is checked against the Dockerfile/shipped-files
  list — see `docs/RELEASING.md` for the full checklist. Versions are milestone-driven
  (`v0.1.0`–`v1.0.0` map to M0–M9), not calendar- or feature-count-driven.
