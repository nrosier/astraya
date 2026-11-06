# Continuous integration

What runs on GitHub Actions, and when. The workflow is `.github/workflows/ci.yml`; Docker, Pages, Release and CodeQL have workflows of their own.

## Jobs in `ci.yml`

| Job         | Runs on                            | What it does                                                                                                                                                                                                 |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commits`   | pull requests                      | Every commit subject parses as a conventional commit, since the changelog is drafted from them (`docs/ops/RELEASING.md`).                                                                                    |
| `check`     | pull requests and pushes to `main` | `npm ci`, ephemeris sync (verified against pinned SHA-256), corpus split, generated-constants check, format, lint, typecheck, unit tests (including the golden-chart gate), build and the bundle-size check. |
| `e2e (n/8)` | pull requests and pushes to `main` | The Playwright suite, split into eight shards that run in parallel. Each shard builds the app, then runs `npx playwright test --shard=n/8`. A failing shard uploads its traces as `playwright-report-n`.     |
| `e2e`       | after the shards                   | One stable check that passes only when every shard passed.                                                                                                                                                   |

## Documentation-only pull requests

A `changes` job checks whether a pull request touches anything outside `docs/`, Markdown files and `.claude/`. If it doesn't, the e2e shards are skipped and the `e2e` check still reports success, so branch protection never waits on a check that never runs. The Docker workflow skips its pull-request image build for changes only under `docs/`, `test/`, `e2e/`, `.claude/` or in Markdown files. Pushes to `main` and release tags always run everything.

## Cancelling superseded runs

A new push to a pull request cancels that pull request's run in progress, so a fix-up push does not queue behind the run it replaces. Pushes to `main` are grouped by commit and are never cancelled.

## Timings

Measured on 2026-11-03, before the shards (#1095): the single e2e job's test step took 813 s, and 508 s after #1093 removed an idle wait from the shared navigation helper. `check` takes about 5 minutes, of which the unit tests are about 100 s.

On 2026-11-06 the four shards' summed test time was 591, 658, 485 and 360 s (2,094 s over 72 spec files, `fullyParallel` off, so a file is the unit of sharding), with about a minute of setup per shard (`npm ci` 9 s, Playwright browser 16 s, build 27 s). The uneven split made the longest shard the wait, so the suite now runs as eight shards. Re-measure the per-shard step times after the first runs.
