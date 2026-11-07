# Continuous integration

What runs on GitHub Actions, and when. The workflow is `.github/workflows/ci.yml`; Docker, Pages, Release and CodeQL have workflows of their own.

## Jobs in `ci.yml`

| Job         | Runs on                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commits`   | pull requests                      | Every commit subject parses as a conventional commit, since the changelog is drafted from them (`docs/ops/RELEASING.md`).                                                                                                                                                                                                                                                                                                                                                   |
| `check`     | pull requests and pushes to `main` | `npm ci`, ephemeris sync (verified against pinned SHA-256), corpus split, generated-constants check, format, lint, typecheck, unit tests (including the golden-chart gate), build and the bundle-size check.                                                                                                                                                                                                                                                                |
| `e2e (n/5)` | pull requests and pushes to `main` | The Playwright suite, split into five shards that run in parallel. Each shard runs in Playwright's own container image (`mcr.microsoft.com/playwright`, tag matching the locked `@playwright/test`), so no browser or system library is installed during the job. It builds the app, then runs the spec files `scripts/e2e-shard.mjs n 5` picks for it, balanced by the durations in `e2e/shard-weights.json`. A failing shard uploads its traces as `playwright-report-n`. |
| `e2e`       | after the shards                   | One stable check that passes only when every shard passed.                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Documentation-only pull requests

A `changes` job checks whether a pull request touches anything outside `docs/`, Markdown files and `.claude/`. If it doesn't, the e2e shards are skipped and the `e2e` check still reports success, so branch protection never waits on a check that never runs. The Docker workflow skips its pull-request image build for changes only under `docs/`, `test/`, `e2e/`, `.claude/` or in Markdown files. Pushes to `main` and release tags always run everything.

## Cancelling superseded runs

A new push to a pull request cancels that pull request's run in progress, so a fix-up push does not queue behind the run it replaces. Pushes to `main` are grouped by commit and are never cancelled.

## Verify image (by hand)

`.github/workflows/verify-image.yml` is run from the Actions tab (`gh workflow run verify-image.yml -f version=0.49.0`) and pushes nothing. It runs `cosign verify` on `latest` and on the version tag against this repository's workflow identity, checks that both tags resolve to one digest, runs `npm run docker:smoke` on a Linux runner and checks the image's revision label equals the commit, and checks that a plain `docker build .` still carries the label as `unknown`. The run log is the evidence the signing and revision issues (#1209, #1198) ask for.

## Security scan

`.github/workflows/security-scan.yml` runs on pushes and pull requests to `main`, weekly on Mondays and by hand. Syft builds a CycloneDX SBOM, Grype scans it, Trivy cross-checks CVEs and adds secret and IaC/Dockerfile checks, and both upload SARIF to Code Scanning. It reports only and does not fail a pull request. See `docs/ops/SECURITY-SCANS.md`.

## oxlint (advisory)

`.github/workflows/oxlint-advisory.yml` runs on pushes and pull requests to `main` and by hand. It runs `oxlint .` (syntactic rules) and `oxlint --type-aware .` (the same rules plus the type-aware ones, which `oxlint-tsgolint` evaluates), prints both logs, and writes their wall-clock times and diagnostic counts to the run summary.

It reports only. Every step ends in `exit 0` and the job carries `continue-on-error: true`, so a red oxlint can never block a pull request. ESLint, Prettier and `tsc -b` keep gating in the `check` job above; nothing in `npm run check` changed.

The rule set lives in `.oxlintrc.json`, generated from `eslint.config.js` by `@oxlint/migrate --type-aware` and then hand-corrected twice: the `sweph-wasm` boundary exemption for `src/ephemeris/**` became `excludeFiles` (the migrator cannot express a flat-config `ignores` inside an override and silently dropped it), and `local/require-module-header` was re-added as an oxlint JS plugin (`oxlint-plugins.js`, referenced from `jsPlugins`). `eslint.config.js` stays the source of truth for both: a rule changed there must be changed in `.oxlintrc.json` too, or the whole advisory setup deleted.

The migrated config is not yet equivalent to ESLint. It reports six diagnostics where ESLint reports none (five `no-unsafe-optional-chaining` in `test/interpretation-routes.test.ts`, one `typescript/require-await` in `server/index.ts`), and three rules Astraya enables are nursery-only in oxlint and therefore absent (`@typescript-eslint/no-unnecessary-condition`, `@typescript-eslint/prefer-optional-chain`, `no-useless-assignment`). That is why this is advisory and not a gate. Reproduce it locally with `npm run lint:oxlint` and `npm run lint:oxlint:type-aware`.

The job needs neither `npm run ephe:sync` nor `npm run corpus:split`: linting reads no generated runtime data.

Removing it is one revert: this workflow, `.oxlintrc.json`, `oxlint-plugins.js`, the `oxlint` and `oxlint-tsgolint` devDependencies, the two `lint:oxlint*` scripts, two `oxlint-plugins.js` entries in `eslint.config.js`, two `.gitignore` lines, and the doc rows. Background, measurements and the owner's decision of 2026-11-07: #1284.

## Timings

Measured on 2026-11-03, before the shards (#1095): the single e2e job's test step took 813 s, and 508 s after #1093 removed an idle wait from the shared navigation helper. `check` takes about 5 minutes, of which the unit tests are about 100 s.

On 2026-11-06 the four shards' summed test time was 591, 658, 485 and 360 s (2,094 s over 72 spec files, `fullyParallel` off, so a file is the unit of sharding), with about a minute of setup per shard (`npm ci` 9 s, Playwright browser 16 s, build 27 s). The uneven split made the longest shard the wait, so the suite now runs as five shards balanced by spec duration (`scripts/e2e-shard.mjs`, weights in `e2e/shard-weights.json`, each modelled for its 4 workers, because a worker takes the next file in alphabetical order, so a long spec that sorts late starts late and sets the shard's end; the first balanced run left one shard at 246 s against 117 to 164 s for the others, so the split now models that and the weights come from that run). The second balanced run left one shard at 269 s (modelled 160 s) because it held four of the heavy specs (85 s or more: chart rendering, axe and viewport sweeps), which slow each other down on the same 4 vCPUs, so each heavy spec beyond the first on a shard now adds a 35 s penalty to its modelled time; a spec with no weight counts as the median, and the weights are worth refreshing from a CI log now and then. With eight shards by Playwright's own `--shard` the slowest shard still took 5m11 (test step 200 s against 88 s for the lightest).
