# Dependencies

The inventory `CLAUDE.md`'s onboarding checklist and file-change workflow point
to. Licences below are each package's own declared `license` field in
`node_modules/<package>/package.json` as of this writing — re-check it rather
than trusting this table blindly if a dependency is bumped across a major
version, since a package can relicense between releases.

Astraya is **AGPL-3.0-or-later** (see [`LICENSE`](../LICENSE) and
[`NOTICE`](../NOTICE)). The runtime table below is the one that constraint
actually binds: everything in it ends up in the shipped browser bundle or the
server process, so each entry needs a licence compatible with distributing
Astraya under the AGPL. The build/test table does not ship and is not subject
to that constraint — its entries are listed for completeness and upgrade
tracking, not licence compliance.

## Runtime (shipped in the bundle or the server process)

| Package                   | Scope          | Purpose                                                                             | Licence           | Loading constraint                                                      |
| :------------------------ | :------------- | :----------------------------------------------------------------------------------- | :----------------- | :------------------------------------------------------------------------ |
| `sweph-wasm`               | Client (worker) | Swiss Ephemeris C library, compiled to WebAssembly — the chart engine itself.        | AGPL-3.0-or-later   | Import restricted to `src/ephemeris/` (lint-enforced); loaded via dynamic `import()` in `src/ephemeris/engine.ts`, kept out of the eager bundle (`scripts/check-bundle-size.mjs`). |
| `@astrodraw/astrochart`    | Client          | SVG chart wheel rendering.                                                          | MIT                 | Statically imported by `src/ui/AstroChartWheel.tsx`; reaches the client only through the route-level `lazy()` chart screens (`src/ui/App.tsx`), not the eager entry chunk. |
| `jspdf`                    | Client          | PDF document generation for the report export builder.                             | MIT                 | Dynamic `import()` only, from `src/ui/pdf-export-render.ts`, triggered when "Build PDF" is clicked (#441) — never in the eager bundle. |
| `jspdf-autotable`          | Client          | Table layout plugin for `jspdf`, used for the PDF export's tabular sections.        | MIT                 | Same dynamic-import boundary as `jspdf`.                                  |
| `svg2pdf.js`                | Client          | Draws the SVG chart wheel into the generated PDF.                                   | MIT                 | Same dynamic-import boundary as `jspdf`; its ESM build cannot be imported under Vitest, so `pdf-export-render.ts` is Playwright-covered rather than unit-tested. |
| `luxon`                     | Client + server | Timezone-aware date/time arithmetic (`IANAZone`, `DateTime`) for Julian-day and local-time conversions. | MIT                 | Statically imported; small and already shared across the eager graph.     |
| `tz-lookup`                 | Client          | Resolves an IANA timezone name from latitude/longitude for birth-time entry.         | CC0-1.0             | Statically imported from `src/time/zones.ts`.                             |
| `react`, `react-dom`        | Client          | UI rendering.                                                                       | MIT                 | Core of the eager bundle by necessity; per-screen code is still split via `lazy()`. |
| `fastify`                   | Server          | HTTP server framework.                                                             | MIT                 | Server-only; never reaches the client bundle.                             |
| `@fastify/cookie`           | Server          | Session-cookie parsing/signing.                                                     | MIT                 | Server-only.                                                               |
| `@fastify/rate-limit`       | Server          | Per-route rate limiting (auth, sync, Tier 2 interpretation).                        | MIT                 | Server-only.                                                               |
| `@fastify/static`           | Server          | Serves the built client bundle.                                                     | MIT                 | Server-only.                                                               |
| `@node-rs/argon2`           | Server          | Password hashing for local accounts.                                               | MIT                 | Server-only; native binding, not part of the client bundle.               |
| `jose`                      | Server          | JWT verification and remote JWKS fetching for OIDC sign-in.                         | MIT                 | Server-only.                                                               |

## Build and test (never shipped — not subject to the AGPL-compatibility constraint above)

| Package                        | Purpose                                                   | Licence     |
| :------------------------------ | :--------------------------------------------------------- | :---------- |
| `typescript`                     | Compiler/type-checker (`npm run typecheck`).                | Apache-2.0  |
| `typescript-eslint`               | Type-aware ESLint rules (`strictTypeChecked`).              | MIT         |
| `eslint`, `@eslint/js`, `globals` | Lint engine and its rule/environment data.                  | MIT         |
| `eslint-plugin-react-hooks`       | Hooks-rules-of-react lint plugin.                           | MIT         |
| `eslint-plugin-react-refresh`     | Fast-refresh-safety lint plugin.                            | MIT         |
| `prettier`                        | Formatting (`npm run format`/`format:check`).               | MIT         |
| `vite`                            | Dev server and production bundler.                          | MIT         |
| `@vitejs/plugin-react`            | Vite's React/JSX transform.                                 | MIT         |
| `vitest`, `fast-check`            | Unit/property test runner.                                  | MIT         |
| `@playwright/test`, `@axe-core/playwright` | E2E runner and its accessibility-assertion integration. | Apache-2.0 / MPL-2.0 |
| `jsdom`                           | DOM environment for component tests.                        | MIT         |
| `fake-indexeddb`                  | In-memory IndexedDB for store tests.                         | Apache-2.0  |
| `tsx`                             | Runs `.ts` scripts/tools directly (`tools/corpus-gen/`, ops scripts). | MIT    |
| `astronomy-engine`                | Independent ephemeris, used only to cross-check `sweph-wasm` in tests — never a runtime dependency of the shipped app. | MIT |
| `@types/*`                        | TypeScript ambient types for the above.                     | MIT         |
| `@modelcontextprotocol/sdk`, `@receptron/laya` | Agent/tooling support (`tools/`), excluded from `src/` by the `tools/` import boundary. | MIT |

`@axe-core/playwright` is MPL-2.0, outside the MIT/BSD/Apache-2.0/ISC/CC0 set
`CLAUDE.md` names. It is a devDependency used only by the Playwright a11y
suite and is never bundled or distributed with Astraya, so the AGPL
distribution question this project cares about does not apply to it — but it
is called out here explicitly rather than silently folded into the "all
permissive" summary, since `CLAUDE.md`'s rule is written without a scope
qualifier.

## Keeping this current

Update this file in the same change that adds, removes, or re-scopes
(runtime ↔ build/test) a dependency — this is what `CLAUDE.md`'s file-change
workflow means by "update `docs/DEPENDENCIES.md` if external dependencies
change." There is no script generating this file; it is maintained by hand,
unlike the aspirational "generated, per-release inventory... published in the
application's About page" `NOTICE` currently claims — no such in-app
inventory exists today (see `CODEX_REVIEW.md` evaluation), so this file is,
for now, the actual source of truth that claim should point to.
