# CLAUDE.md — Astraya

## Onboarding

1. Read `CLAUDE.md` + `docs/DEPENDENCIES.md`.
2. Check local `MAP.md` in target directory before inspecting files.
3. For UI work, read `docs/UI-UX_GUIDELINES.md` before designing or changing a feature.
4. For UI shell, navigation, settings, chart-workspace, or migration work, also follow `docs/UI-UX_IMPLEMENTATION_PLAN.md`.
5. Use `.claudeignore` to exclude search paths; every major directory maintains its own `MAP.md`.

## Documentation Maintenance

### MAP.md Format (Ultra-Lean Index)

Every directory's `MAP.md` is a fast-lookup index, **not** a narrative guide. Each file entry must fit on one line:

```markdown
- `filename.ts` — Domain purpose. Brief responsibility. Deps: `dep1`, `dep2`.
```

**Strict rules:**

- **One bullet per file** in flat Markdown list (no nested sections).
- **1–2 sentences max** per entry (combine purpose + responsibility concisely).
- **No code signatures, implementation details, or internal mechanics.** Include only what answers: "What domain does this file belong to?" and "What are its external dependencies?"
- **Dependency format:** Minimal path references (relative or module shorthand; e.g., `sync/auth-client`, `astro-names.messages`), comma-separated, no full paths.
- **Remove stale entries** and **add newly created files** on every significant change.
- **Target reduction:** 50–70% compression vs. verbose narrative style (e.g., 481 lines → ~180 for `src/ui/MAP.md`).

### File Changes Workflow

When creating/deleting/renaming files with significant responsibility:

- Update local `MAP.md`: add entry (one line) or remove stale reference.
- Add/verify JSDoc `@module` header: `@purpose`, `@conventions`, `@exports`.
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
- **JSDoc:** Every `src/`, `server/`, and `tools/` `.ts`/`.tsx`/`.mjs` file must have an `@module` header (`@purpose`, `@conventions`, `@exports`) — lint-enforced (`eslint.config.js`'s `local/require-module-header`). `test/`/`e2e/`/`scripts/`/config files are exempt; most already carry their own descriptive top-of-file prose instead.
- **Pattern:** Pure TS (`.ts`), thin React (`.tsx`); test math directly in `.ts`.
- **Domain Integrity:** No invented numbers/orbs; cite sources or reference tests for all house systems/conventions.
- **Dependencies:** AGPL-3.0 compatible only (MIT/BSD/Apache-2.0/ISC/CC0). Heavy deps use dynamic `import()`. `scripts/check-bundle-size.mjs` enforces lazy loading.
- **Zero tolerance (purist standard):** All code must build with no errors and no warnings — `npm run check` clean, not just passing; a warning left in place is a defect, not a nit. Every `.md`/`.html` page must validate as pure W3C/spec-conformant markup — no non-standard syntax, no editor-only shortcuts.

## i18n & Testing

- **i18n:** Co-located `*.messages.ts` with `{ en, nl }` pairs; both locales must have parity.
- **Testing:** Real Swiss Ephemeris via `test/engine-harness.ts` (no mocks). Never hit paid APIs in automated runs.

## Git Workflow

- **Commits:** `type(scope): subject` where scope is issue # (e.g., `feat(#441): ...`). Release automation parses this.
- **Branches:** `fix/441-description`, merged `--no-ff` to `main`.
- **Issues:** Open until released; tick checklist items as PRs land.
- **Releases:** Touch `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md` badge. Semantic versioning.

## Environment (macOS / BSD)

- **Host:** macOS (BSD userland, NOT GNU/Linux).
- **CLI Rules:** Avoid GNU flags (`cat -A`, `grep -P`, `date -d`, `readlink -f`).
- **BSD Equivalents:** `od -c` (non-printables), `grep -E` (regex), `sed -i ''` (in-place edit), `stat -f` / `realpath` (dates/paths).
