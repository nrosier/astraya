# Repository security and quality review (2026-11-08)

**Scope:** whole repository at `origin/main` 2eef35a2, across eight domains (security and privacy, architecture, code quality, performance, UI and accessibility, i18n and local-first, tests, documentation). Read-only: no code changed. Findings were filed as labelled issues, #1360 to #1368.

**Method:** the tree was exported with `git archive` into a throwaway directory. `typecheck`, `lint`, `build` and `check:bundle-size` ran there, and all four passed. Vitest in that export passed 434 files and 5385 tests (2 skipped, 1 todo). `npm audit` on the lockfile reports 0 vulnerabilities.

## Verdict

Nothing rated CRITICAL or HIGH. Nine findings: five MEDIUM and four LOW.

## Domain scores

| Domain                 | Score | Why not 100%                                                                                                                                                            |
| ---------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security and privacy   | 82%   | Session and token storage, logout and OIDC timeouts, expired-session cleanup (#1360, #1361, #1364).                                                                     |
| Architecture           | 93%   | The `sweph-wasm`, `tools/` and Tier 2 LLM boundaries hold when grepped. The only `sweph-wasm` use outside `src/ephemeris` is the generator `scripts/gen-constants.mjs`. |
| Code quality and types | 88%   | Strict typing is clean and the few type escapes are documented. A body-less POST to public auth routes returns 500 (#1362).                                             |
| Performance            | 85%   | The eager bundle is at 92% of its budget. PDF and map code is lazy-loaded. The server loads about 11 MB of corpus JSON at boot (#1367).                                 |
| UI and accessibility   | 78%   | Static checks only, no browser. No `outline: none` without replacement and no reduced-motion gaps were found. Contrast and keyboard behaviour are unverified.           |
| i18n and local-first   | 80%   | Dutch readers see untranslated server and sync errors (#1365). The offline and sync design is careful.                                                                  |
| Tests and QA           | 86%   | Real-engine tests and a golden gate. The only flaky pattern is #1368.                                                                                                   |
| Documentation          | 88%   | Every `src`, `server` and `tools` file has a full `@module` header. MAP.md drift is small (#1366).                                                                      |

## Issues filed

- **#1360** (medium): password changes keep old sessions alive; session ids and set-password tokens are stored in plaintext.
- **#1361** (medium): logout fails to revoke the session when OIDC discovery fails; OIDC fetches have no timeout.
- **#1362** (medium): a missing request body gives a 500 that leaks internal error text; no generic 5xx handler.
- **#1363** (medium): `release.yml` and `pages.yml` use mutable action tags, a regression from closed #584; the fixed-star file is fetched from `master`.
- **#1365** (medium): server and sync error text reaches the UI untranslated.
- **#1364** (low): expired sessions and stored OIDC id tokens are never deleted; every authenticated read writes to the database.
- **#1366** (low): MAP.md and DEPENDENCIES.md have drifted, with no check to keep them current.
- **#1367** (low): the server loads about 11 MB of corpus JSON (+126 MB RSS) at boot even when Tier 2 is disabled.
- **#1368** (low): the profile-easter-egg e2e asserts absence after a fixed 1.5 s sleep.

## Not verified

- Contrast, keyboard and ARIA behaviour: no browser was run.
- The Docker image, runtime headers and `docker:smoke`: not run. `docker.yml` was only grepped.
- Authorization and validation logic of the corpus, interpretation and submission routes was not reviewed in full. Part of `server/interpretation-routes.ts` (42 KB) was read.
- `tools/corpus-gen` was not reviewed.
- The SQL-injection check covers only the files read, where every statement is parameterised.
- The XSS check covered the `dangerouslySetInnerHTML` sites that take generated SVG; escaping was sampled, not traced at every site.
- Test coverage was not measured.
- Items already tracked were skipped: #1348, #1351 to #1359, #1345, #1347, #1335, #1338, #1333, #1331, #1324, #990, and PR #1349.

## Secrets

None found. A pattern scan of `origin/main` for API keys, tokens and private keys returned nothing. `.env.example` holds only blank placeholders.
