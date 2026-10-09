# Repository Audit & Review Report — Astraya

**Audit date:** 2026-10-09  
**Baseline:** `HEAD 20931fb` (`0.33.0`) plus the pre-existing working-tree snapshot. The audit did not modify source, tests, generated assets, or the concurrently present untracked `test/zz-scratch-pd.test.ts`.

## Executive Summary

- **Overall Code Health Score:** **B+ / 88**
- **What improved since the 2026-10-07 audit:** The prior privacy-copy, stale geocoding, Changelog localization, Dutch browser-test, dependency-inventory, and ordinary concurrent cost-reservation findings have been addressed in the intervening commits.
- **Key strengths:** Strict TypeScript and type-aware linting; enforced runtime import boundaries; mature authentication/authorization/CSRF/CSP/session controls; broad local-first and browser coverage; current production dependency audit is clean.
- **Primary risks:** A provider call that outlives the five-minute cost-reservation lease can bypass a configured Tier-2 spend cap; the admin activity query multiplies independent child rows before aggregation; archived generated data tracked in Git conflicts with the repository's stated non-distribution policy for third-party prose.

| Domain                             | Score | Critical | High | Medium | Low |
| :--------------------------------- | :---: | :------: | :--: | :----: | :-: |
| Security & Data Privacy            |  86   |    0     |  1   |   0    |  0  |
| Architecture & Boundaries          |  92   |    0     |  0   |   0    |  0  |
| Code Quality & Types               |  91   |    0     |  0   |   0    |  0  |
| Performance & Scalability          |  84   |    0     |  1   |   0    |  0  |
| UI, UX & Accessibility             |  93   |    0     |  0   |   0    |  0  |
| Internationalization & Local-First |  94   |    0     |  0   |   0    |  0  |
| Test Coverage & Quality Assurance  |  89   |    0     |  0   |   0    |  0  |
| Documentation & Data Governance    |  82   |    0     |  0   |   1    |  0  |

## Prioritized Action Plan

### Urgent / Immediate Priority (P0)

| ID     | Finding                                                                                          | Location                                       | Criticality | Effort   | Scope             |
| :----- | :----------------------------------------------------------------------------------------------- | :--------------------------------------------- | :---------- | :------- | :---------------- |
| SEC-01 | An expired reservation can reconcile after a later reservation and exceed a hard Tier-2 cost cap | `server/interpretation/cost-reservation.ts:29` | HIGH        | MODERATE | TARGETED_REFACTOR |

### High Priority / Next Release (P1)

| ID      | Finding                                                                                             | Location                                          | Criticality | Effort | Scope     |
| :------ | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------ | :---------- | :----- | :-------- |
| PERF-01 | Admin activity query forms a child-table Cartesian product before aggregation                       | `server/auth/admin-routes.ts:84`                  | HIGH        | EASY   | QUICK_FIX |
| DOC-01  | Tracked archived SQLite distributes cached third-party report content contrary to repository policy | `tools/corpus-gen/archive/.data/benchmark.sqlite` | MEDIUM      | EASY   | QUICK_FIX |

## Detailed Findings by Theme

### 1. Security & Data Privacy

#### [SEC-01] Cost reservations can expire while a provider call remains chargeable

- **Location:** `server/interpretation/cost-reservation.ts:29`, `server/interpretation/cost-reservation.ts:58`, `server/interpretation/cost-reservation.ts:121`, `server/interpretation/llm-client.ts:166`, `test/server-interpretation-cost-reservation.test.ts:171`
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The reservation lease is five minutes and every new reservation deletes expired rows. Reconciliation then deletes by reservation ID but records actual usage regardless of whether that reservation was already pruned. The LLM-provider `fetch()` has no `AbortController` or request timeout, so a request can remain in flight after its lease expires.
- **Reproduction:** In an isolated in-memory database, reserve 100¢ against a 100¢ user/global cap, force that reservation to expire, reserve another 100¢ (accepted after pruning), then reconcile the first reservation at 100¢. The resulting committed usage is 100¢ plus a still-active 100¢ reservation: **200¢ against a 100¢ cap**. This uses a seeded `users` row and only local in-memory data.
- **Impact:** The atomic reservation design closes ordinary concurrent-call races, but it does not enforce the configured cap when a provider hangs or takes longer than the lease. The exposure is bounded by the configured caps and provider behavior, yet contradicts the hard-cap guarantee documented in the module.
- **Recommended Remediation:** Bound every provider request and retry sequence with an `AbortController` comfortably below the reservation lease. Make lease expiry safe for ambiguous in-flight calls: renew an active lease, or conservatively account for the full reserved amount before cleanup rather than silently dropping it. Preserve atomic reconciliation, verify the deletion outcome, and add a regression test for expiry followed by a second reservation and late reconciliation.

### 2. Architecture & Boundaries

No new finding. The enforced `sweph-wasm`, `tools/`, and runtime-LLM import boundaries remain clear and are covered by the configured test/lint safeguards. The Tier-2 reservation mechanism uses a focused data-layer module rather than broad route-level duplication; SEC-01 is a lifecycle/timeout defect within that otherwise appropriate boundary.

### 3. Code Quality & Types

No new finding. `npm run check` passes Prettier, strict type checking, type-aware ESLint, and the unit suite. The audited modules use narrow interfaces and prepared statements. The implementation should retain this standard when resolving the lease lifecycle and query restructuring.

### 4. Performance & Scalability

#### [PERF-01] Admin activity lookup multiplies sessions, operations, and AI-usage rows

- **Location:** `server/auth/admin-routes.ts:84`, `server/auth/admin-routes.ts:89`, `server/ops/routes.ts:36`, `server/db.ts:51`, `server/db.ts:69`, `server/db.ts:216`
- **Classification:** `Criticality: HIGH` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `ADMIN_USER_SELECT` directly left-joins `sessions`, `ops`, and `interpretation_usage`, then applies `MAX()` after `GROUP BY users.id`. For a user with _S_ sessions, _O_ operations, and _U_ usage rows, SQLite must form up to `S × O × U` joined rows before reducing them.
- **Evidence:** A representative synthetic user with 3 session rows, 4 operation rows, and 5 usage rows produces **60** rows for the current join. Aggregating each child table in a derived table before joining produces **1** row. The result values are correct because `MAX()` is idempotent, but the intermediate work is not bounded by the response shape.
- **Impact:** The endpoint is used by both list and per-user admin paths. The sync log alone permits 200,000 operations per account, while this query performs no per-child retention or preaggregation. Data growth can turn an otherwise small admin view into an avoidable latency and memory spike.
- **Recommended Remediation:** Replace the direct child joins with derived tables/CTEs that select `user_id, MAX(...)` from each child table grouped by `user_id`, then left-join those three one-row-per-user aggregates to `users`. Add a regression test or query-shape assertion using multiple rows in all three child tables.

### 5. UI, UX & Accessibility

No new finding. The current browser suite passes all 124 Chromium scenarios, including accessibility checks, small-screen navigation, keyboard tooltip interaction, localized About content, chart workflows, and sync flows. The test count increased from the prior audit and the Dutch primer test now executes as named.

### 6. Internationalization & Local-First Integrity

No new finding. The previously identified hard-coded Changelog shell has a message catalogue, and the browser suite verifies the Dutch About primer after toggling locale. The repository continues to keep runtime user data local-first, with server-side sync and Tier-2 paths explicitly separated.

### 7. Test Coverage & Quality Assurance

No separate finding. The suite is broad and all current executable gates pass, but SEC-01 exposes a missing boundary-case regression: the unit tests separately confirm normal reconciliation and expired-row pruning, not late reconciliation after a reservation has been pruned. Treat the SEC-01 regression test as required test coverage for the fix.

### 8. Documentation & Data Governance

#### [DOC-01] Archived tracked cache conflicts with the repository's no-distribution statement

- **Location:** `.gitignore:46`, `.gitignore:51`, `docs/archive/BENCHMARK_ASTROLOGYAPI.md:210`, `docs/archive/BENCHMARK_ASTROLOGYAPI.md:223`, `tools/corpus-gen/archive/.data/benchmark.sqlite`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The archive commit `a184196` tracks `tools/corpus-gen/archive/.data/benchmark.sqlite` (49,152 bytes). Its `thirdparty_cache` table contains four cached records: 22,220 bytes of raw JSON and 3,382 bytes of extracted text, including report prose. The tracked archive path is not covered by the active `.gitignore` rule for `tools/corpus-gen/.data/`.
- **Impact:** The benchmark documentation says the cache is gitignored, never committed, and never distributed to avoid redistributing vendor prose. The archived database makes that assurance inaccurate. This is a repository policy and data-governance inconsistency; this audit does not make an external legal conclusion.
- **Recommended Remediation:** Remove the generated cache/database dashboard from Git history going forward (`git rm --cached` for the tracked paths, preserving any local archival copy only if needed), add `tools/corpus-gen/archive/.data/` to `.gitignore`, and update the archive rationale/documentation to describe what is retained. If the data must be preserved for reproducibility, retain only non-vendor metadata or document the explicit review/approval basis for controlled storage.

## Validation Evidence

| Check                                    | Result                                                                                                  |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| `npm run check`                          | Passed: Prettier, ESLint, TypeScript, 227 Vitest files / 2,727 tests                                    |
| `npm run test:e2e`                       | Passed: production build and 124 Chromium tests                                                         |
| `npm run check:bundle-size`              | Passed: 645,209-byte eager graph within 665,600-byte budget                                             |
| `node scripts/gen-constants.mjs --check` | Passed: 275 numeric constants, 12 file names, `sweph-wasm` 2.6.9                                        |
| `npm audit --omit=dev --json`            | Passed: 0 vulnerabilities; 104 production / 488 total resolved dependencies                             |
| Cost-cap regression reproduction         | Confirmed: a 100¢ cap can reach 200¢ after expiry, a second reservation, and late reconciliation        |
| Admin-query fan-out reproduction         | Confirmed: 3 sessions × 4 operations × 5 usage rows yields 60 direct-join rows; preaggregation yields 1 |

The first local `tsx` reproduction and initial `npm audit` attempt were blocked by sandbox IPC/DNS restrictions. Both were rerun in the permitted runtime; neither initial restriction is a repository defect. Docker smoke validation was not run in this audit.
