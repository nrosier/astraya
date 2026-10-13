# Astraya Agent Guide

## Onboarding

1. Read this file and `docs/DEPENDENCIES.md`.
2. Read the local `MAP.md` before inspecting or changing a directory.
3. For UI work, read `docs/UI-UX_GUIDELINES.md`.
4. For UI shell, navigation, settings, chart-workspace, or migration work, also read `docs/UI-UX_IMPLEMENTATION_PLAN.md`.
5. Respect `.claudeignore` search exclusions. Every major directory has a `MAP.md`.

## Documentation Maintenance

`MAP.md` files are ultra-lean indexes, not narrative guides. Use one flat bullet per file:

```markdown
- `filename.ts` — Domain purpose. Brief responsibility. Deps: `dep1`, `dep2`.
```

- Keep entries to one or two concise sentences, with no code signatures or internal mechanics.
- List only the file's domain, responsibility, and minimal external dependency paths.
- Add, remove, or correct local `MAP.md` entries whenever a significant file is created, deleted, renamed, or changes responsibility.
- For significant source files, add or verify the JSDoc `@module` header with `@purpose`, `@conventions`, and `@exports`.
- Update `docs/DEPENDENCIES.md` when external dependencies change.

## Commands

- Use Node 24+ and `npm`; do not use Yarn or pnpm.
- Run `npm run check` before a PR: formatting, linting, typecheck, and tests must all pass with no warnings.
- `npm run test` includes the non-waivable NASA JPL 0.2-arcsecond golden-chart gate.
- `npm run test:e2e` runs Playwright against `dist/`.
- `npm run docker:smoke` is the release Docker/CSP/health-check gate.
- `npm run corpus:audit` requires API keys and can incur costs; never run it in CI.

## Enforced Boundaries

- Only `src/ephemeris/` may import `sweph-wasm`; all other code uses `EphemerisProvider`.
- `src/` must never import from `tools/`.
- Only `server/interpretation/llm-client.ts` may call an LLM; `src/` must never import it.

## Code Standards

- Respect strict TypeScript, including `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`.
- Follow strict type-checked ESLint: no non-null assertions, use `interface` rather than `type` for object shapes, and do not leave floating promises.
- Every `src/`, `server/`, and `tools/` TypeScript/TSX/MJS source file requires a JSDoc module header; tests, e2e, scripts, and config are exempt.
- Prefer pure domain TypeScript with thin React components. Test calculations directly in `.ts` tests.
- Do not invent astrological numbers or orbs: cite a source or reference verification tests for every convention and house system.
- Add only AGPL-3.0-compatible dependencies. Dynamically import heavy dependencies and preserve bundle-size checks.
- Treat warnings as defects. Markdown and HTML must use conformant standard markup.

## i18n and Testing

- Put UI text in co-located `*.messages.ts` files with complete `{ en, nl }` parity.
- Use the real Swiss Ephemeris through `test/engine-harness.ts`; do not mock it for astrological calculations.
- Never call paid APIs in automated tests.

## Git and Releases

- Commit messages use `type(#issue): subject`, for example `feat(#441): ...`.
- Use branches named like `fix/441-description` and merge them to `main` with `--no-ff`.
- Leave issues open until release and tick issue checklists as PRs land.
- Releases update `package.json`, `package-lock.json`, `CHANGELOG.md`, and the `README.md` badge, following semantic versioning.

## macOS / BSD Environment

- Assume macOS BSD userland, not GNU/Linux.
- Avoid GNU-only flags such as `cat -A`, `grep -P`, `date -d`, and `readlink -f`.
- Prefer BSD equivalents: `od -c`, `grep -E`, `sed -i ''`, `stat -f`, and `realpath`.
