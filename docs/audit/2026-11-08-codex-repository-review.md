# Repository Audit & Review Report — Astraya

## Executive Summary

- **Overall Code Health Score:** 86%
- **Overall Score Justification & Path to 100%:** Fifteen findings remain: six HIGH, seven MEDIUM, and two LOW. The most consequential defects are account data being pushed after its sync engine closes, concurrent reuse of password-reset tokens, and sessions surviving a password reset. Close those paths first; then make snapshot decoding fail closed, bound sync reads by bytes, persist the offline corpus, and complete the regression tests and smaller fixes below. A score of 100% means this report's bounded checklist is closed and its verification gates pass, not proof that the application has no undiscovered defects.
- **Primary Risk Areas:**
  - Cross-account sync: an old account's pending records can be sent using a replacement account's cookie.
  - Account recovery: reset tokens are not atomically single-use, and changing a password does not invalidate existing sessions.
  - Reproducibility: the strict external snapshot decoder still repairs malformed settings and drops malformed custom points.
  - Resource limits: row-count limits permit multi-megabyte sync pages and very large per-account storage; file imports have no byte budget.
  - Local-first behavior: interpretation chunks have no service-worker cache route, and dropped incoming operations can still produce a green synced status.

### Domain Health & Findings Summary

| Domain                                | Score (%) | Critical | High | Medium | Low | Total Findings |
| :------------------------------------ | :-------: | :------: | :--: | :----: | :-: | :------------: |
| Application Security & Data Privacy   |    64%    |    0     |  3   |   0    |  0  |       3        |
| Architectural Integrity & Boundaries  |    95%    |    0     |  0   |   1    |  0  |       1        |
| Code Quality, Maintainability & Types |    83%    |    0     |  1   |   1    |  0  |       2        |
| Performance & Resource Management     |    83%    |    0     |  1   |   1    |  0  |       2        |
| UI, UX & Accessibility (a11y)         |    93%    |    0     |  0   |   1    |  1  |       2        |
| i18n & Local-First Integrity          |    78%    |    0     |  1   |   2    |  0  |       3        |
| Test Coverage & Quality Assurance     |    95%    |    0     |  0   |   1    |  0  |       1        |
| Documentation & Agent Maintainability |    98%    |    0     |  0   |   0    |  1  |       1        |

**Scoring:** Each domain starts at 100; deduct 25 per CRITICAL, 12 per HIGH, 5 per MEDIUM, and 2 per LOW finding, with a floor of zero. The overall score is the rounded, equally weighted mean: 689 / 8 = 86.125%. Each finding has one primary domain. QA-01 concerns missing scenario gates, not an additional instance of each runtime defect. Environment restrictions do not incur deductions. These are transparent review scores, not measured coverage percentages or a release approval.

**Audit basis:** November 8, 2026, Europe/Brussels; Astraya 0.50.0; HEAD `e08c3dcd9f28a8abcdbdfcde0fe52fca49287b52`. Source references use that checkout. Existing changes in `docs/MAP.md` and `docs/audit/2026-11-08-ui-ux-design-system-audit.md` are not audit-authored changes. No application code, interpretation-corpus prose, credentials, or runtime database was changed for this report. A temporary import-boundary probe was removed after verification.

---

## Gap Analysis & Pathway to 100% by Domain

### 1. Application Security & Data Privacy (64% / 100%)

- **Deduction Reasons:** SEC-01, SEC-02, and SEC-03 each deduct 12 points: sync lifecycle/account isolation fails under a delayed response; password-reset consumption races across an asynchronous hash; reset completion leaves old sessions authorized.
- **Actionable Remediation to Reach 100%:**
  1. Bind each sync request to the expected account and reject a cookie/account mismatch server-side; cancel and fence all work on engine closure.
  2. Consume a reset token with an expiry-checked conditional update and require exactly one changed row.
  3. Revoke the account's sessions in the same transaction as the successful password change.
  4. Verify delayed-response account switching, simultaneous token redemption, and old-cookie rejection with real route/store tests.

### 2. Architectural Integrity & Boundaries (95% / 100%)

- **Deduction Reasons:** ARCH-01 deducts 5 points: the documented browser-to-runtime-LLM import boundary misses a dynamic `import()`; the targeted lint command also accepts the demonstrated import.
- **Actionable Remediation to Reach 100%:**
  1. Add an AST-based dependency-boundary check covering imports, re-exports, and literal dynamic imports, including client imports of server modules.
  2. Resolve paths before checking forbidden directory membership, retaining the documented ephemeris exception only where appropriate.
  3. Add negative fixtures and prove the demonstrated dynamic import fails CI. Do not move the production numerical authority out of `EphemerisProvider`.

### 3. Code Quality, Maintainability & Type Safety (83% / 100%)

- **Deduction Reasons:** QUAL-01 deducts 12 points for a strict decoder that silently changes external calculation inputs; QUAL-02 deducts 5 for valid JSON `null` reaching unchecked body destructuring and returning 500.
- **Actionable Remediation to Reach 100%:**
  1. Validate the presence and shape of externally supplied snapshot containers and every custom-point field before invoking the permissive migration/parser.
  2. Keep historical absent-field migration explicit; reject present-but-malformed fields rather than repairing them.
  3. Add structural request-body schemas to JSON routes, leaving semantic validation in the handlers.
  4. Exercise malformed containers, partially invalid arrays, and top-level null/scalar bodies at the public boundaries.

### 4. Performance & Resource Management (83% / 100%)

- **Deduction Reasons:** PERF-01 deducts 12 points for count-only sync response/storage bounds; PERF-02 deducts 5 for unbounded whole-file reads and synchronous parsing/staging in the browser.
- **Actionable Remediation to Reach 100%:**
  1. Introduce explicit per-operation, per-pull-page, and per-account byte budgets, including serialization overhead and an oversized-single-row policy.
  2. Backfill indexed/accounted byte totals transactionally; do not discard existing history to enforce the budget.
  3. Refuse oversized import files before `File.text()` and define record/revision limits; put large supported parsing/staging work behind a cancellable worker.
  4. Test maximum-size pages, Unicode expansion, duplicate retries near quota, and import cancellation without logging private payloads.

### 5. UI, UX & Accessibility (93% / 100%)

- **Deduction Reasons:** UX-01 deducts 5 points for an unavailable Clipboard API throwing and denied copies failing silently; UX-02 deducts 2 for a person-switcher trigger advertising a menu while opening a dialog.
- **Actionable Remediation to Reach 100%:**
  1. Guard clipboard availability and synchronous exceptions; show localized failure feedback with a usable alternative.
  2. Set `aria-haspopup="dialog"` on the existing person-switcher trigger and preserve its non-modal interaction model.
  3. Add missing-API/rejected-permission interaction tests and a trigger/popup-role assertion. Retain the owned primitive system rather than introducing a UI framework for these fixes.

### 6. Internationalization & Local-First Integrity (78% / 100%)

- **Deduction Reasons:** LF-01 deducts 12 points for interpretation JSON missing durable offline caching; LF-02 deducts 5 for discarded/rejected pulled records not affecting sync health or a durable recovery queue; I18N-01 deducts 5 for English server errors rendered verbatim in localized forms.
- **Actionable Remediation to Reach 100%:**
  1. Cache the selected locale's committed corpus under a release/version-qualified offline policy; keep authenticated API responses outside that cache.
  2. Preserve bad incoming rows and rejection reasons in an account-scoped quarantine before advancing the cursor, and expose partial-sync status and recovery.
  3. Give expected API errors stable machine codes and localize them in co-located English/Dutch catalogues.
  4. Verify a fresh offline page load with a warm service-worker cache but no HTTP-cache dependency, corrupt-row recovery, and Dutch error paths. No corpus prose rewrite is required.

### 7. Test Coverage & Quality Assurance (95% / 100%)

- **Deduction Reasons:** QA-01 deducts 5 points: current tests cover sequential reset-token reuse and successful progress around a corrupt pulled row, but not simultaneous redemption, session invalidation after reset, or closing sync while a request is unresolved.
- **Actionable Remediation to Reach 100%:**
  1. Add the deterministic race/negative tests specified in QA-01; assert the security property, not just eventual successful progress.
  2. Add snapshot-container, byte-limit, offline-corpus, and clipboard failure regressions with each corresponding fix.
  3. Rerun the complete unit/integration and Playwright suites with permitted loopback/IPC access, plus the registry advisory check; do not substitute this run's environment failures for those results.

### 8. Documentation & Agent Maintainability (98% / 100%)

- **Deduction Reasons:** DOC-01 deducts 2 points: `NOTICE` promises a generated per-release dependency inventory in About, while the current dependency guide explicitly says none exists.
- **Actionable Remediation to Reach 100%:**
  1. Correct `NOTICE` to point to the actual hand-maintained inventory, or implement the promised build-generated, version-specific inventory and surface it in About.
  2. Make the About, NOTICE, and dependency-guide descriptions agree and validate their links. This is a documentation consistency issue, not a legal-compliance determination.

---

## Prioritized Action Plan

### 🚨 Urgent / Immediate Priority (P0)

| ID     | Finding                                                                 | Location                      | Criticality | Effort   | Scope             |
| :----- | :---------------------------------------------------------------------- | :---------------------------- | :---------- | :------- | :---------------- |
| SEC-01 | Closed sync engine can push an old account's records under a new cookie | `src/sync/engine.ts:465`      | HIGH        | MODERATE | TARGETED_REFACTOR |
| SEC-02 | Concurrent requests redeem the same password-reset token                | `server/auth/routes.ts:288`   | HIGH        | MODERATE | TARGETED_REFACTOR |
| SEC-03 | Existing sessions survive password reset                                | `server/auth/identity.ts:128` | HIGH        | EASY     | QUICK_FIX         |

### ⚠️ High Priority / Next Release (P1)

| ID      | Finding                                                                      | Location                                 | Criticality | Effort   | Scope             |
| :------ | :--------------------------------------------------------------------------- | :--------------------------------------- | :---------- | :------- | :---------------- |
| QUAL-01 | Strict snapshot decoder silently repairs malformed calculation inputs        | `src/domain/calculation-snapshot.ts:481` | HIGH        | MODERATE | TARGETED_REFACTOR |
| PERF-01 | Sync pagination and storage quotas bound rows, not bytes                     | `server/ops/routes.ts:250`               | HIGH        | MODERATE | TARGETED_REFACTOR |
| LF-01   | Runtime interpretation chunks have no durable offline route                  | `src/pwa/routing.ts:47`                  | HIGH        | MODERATE | TARGETED_REFACTOR |
| ARCH-01 | Dynamic imports bypass the server/LLM boundary gate                          | `test/no-runtime-llm-access.test.ts:84`  | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| QUAL-02 | Null JSON bodies reach unchecked destructuring                               | `server/auth/routes.ts:79`               | MEDIUM      | EASY     | QUICK_FIX         |
| UX-01   | Copy throws when the Clipboard API is missing and hides denied-copy failures | `src/ui/SortableTable.tsx:167`           | MEDIUM      | EASY     | QUICK_FIX         |
| LF-02   | Incoming-row loss is reported as fully synced                                | `src/sync/engine.ts:404`                 | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| I18N-01 | Localized forms expose English server errors                                 | `src/ui/SetPasswordForm.tsx:69`          | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| QA-01   | Negative/race scenarios are absent from the existing success-path tests      | `test/server-admin.test.ts:273`          | MEDIUM      | MODERATE | TARGETED_REFACTOR |

### 📋 Backlog / Technical Debt (P2)

| ID      | Finding                                                              | Location                         | Criticality | Effort   | Scope             |
| :------ | :------------------------------------------------------------------- | :------------------------------- | :---------- | :------- | :---------------- |
| PERF-02 | Import paths read and parse arbitrarily large files on the UI thread | `src/ui/PreferencesView.tsx:221` | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| UX-02   | Person switcher advertises the wrong popup type                      | `src/ui/PersonSwitcher.tsx:78`   | LOW         | EASY     | QUICK_FIX         |
| DOC-01  | NOTICE names an unimplemented dependency-inventory destination       | `NOTICE:49`                      | LOW         | EASY     | QUICK_FIX         |

---

## Detailed Findings by Theme

### 1. Security & Data Privacy

#### [SEC-01] Closing sync does not prevent a later push under another account's session

- **Location:** `src/sync/engine.ts:194`, `src/sync/engine.ts:394`, `src/sync/engine.ts:465`, `src/sync/engine.ts:555`; `src/store/store.ts:610`, `src/store/store.ts:632`; `src/ui/session-context.tsx:444`; `server/ops/routes.ts:98`.
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** `close()` clears timers/listeners and sets `closed`, but does not abort the current fetch. `runSync()` executes `await pull(); await push();` without checking `closed` between them. An empty delayed pull returns without touching IndexedDB, so even closing the real store does not stop the next push: `outgoing()` still reads its in-memory log. Requests use the current same-origin session cookie, not an expected-account binding. The server scopes accepted records to whichever user that cookie resolves to.
- **Verified reproduction:** Open a real `Store` backed by fake IndexedDB; write an Alice-only operation; defer the pull's fetch response; call `engine.close()` and `store.close()`; change the simulated cookie identity to Bob; resolve the pull with `{ ops: [] }`. The actual engine issues a POST whose captured account is `Bob` and whose decoded payload contains `entityId: "alice-private"`, `value: "Private Alice record"`. The cookie change is modeled by the fetch transport; no real account's data is used. `signOut()` also waits for network logout before closing the engine (`session-context.tsx:452`), widening the lifecycle window.
- **Impact:** Under a delayed response/account switch, private operations can be copied into a different account's server log. Repeated HLC/account combinations can also poison the wrong account's history. This is not a demonstrated anonymous remote takeover; it is a reproduced client lifecycle isolation failure.
- **Recommended Remediation:** Give the engine an expected account ID; include it in sync requests and reject mismatches against `request.user.id` before reading/writing records. Abort requests on closure, check closure after every awaited boundary and before initiating work, and stop local sync before awaiting logout. Handle browser-wide cookie changes across tabs rather than assuming a React provider owns the cookie exclusively.
- **Acceptance Criteria:** With real stores and route authorization, resolving any old GET/POST after close or changing the authenticated account produces no new old-engine request, no write to either wrong account, and no old-store cursor mutation. Test the empty-page case specifically.

#### [SEC-02] Password-reset tokens are only sequentially single-use

- **Location:** `server/auth/routes.ts:288`, `server/auth/routes.ts:296`; `server/auth/identity.ts:118`, `server/auth/identity.ts:128`.
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The handler reads and validates the token, awaits Argon2 hashing, then calls an unconditional `UPDATE ... WHERE id = ?`. A second request can read the same token while the first is hashing. Clearing the token in the first update does not stop the second update, because neither the token nor its expiry appears in the write predicate.
- **Verified reproduction:** `Promise.all` over two real `app.inject()` POSTs to `/api/auth/set-password`, using the same token and different strong passwords, returned `[200, 200]`. Both requests claim successful redemption; the last hash written wins. No HTTP listener or paid service is involved.
- **Impact:** Possession of a reset link permits racing its legitimate redemption and overriding the password after another request has successfully used the supposedly single-use token. Validation before the asynchronous work is not an atomic consumption guarantee.
- **Recommended Remediation:** Hash outside the transaction, then perform a conditional update including user ID, exact token, and expiry at commit time. Require exactly one changed row; otherwise return the existing invalid/expired-link response. Couple the winning update to session revocation in SEC-03. Do not hold a database transaction open while hashing.

```sql
UPDATE users
SET password_hash = ?, password_set_token = NULL, password_set_token_expires_at = NULL
WHERE id = ? AND password_set_token = ?
  AND (password_set_token_expires_at IS NULL OR password_set_token_expires_at >= ?);
```

- **Acceptance Criteria:** Two simultaneous redemptions yield exactly one 200 and one 401; an expired, replaced, or already-consumed token cannot change the password, including if expiry/replacement happens while hashing.

#### [SEC-03] Resetting a password leaves all pre-existing sessions authorized

- **Location:** `server/auth/identity.ts:128`; `server/auth/routes.ts:296`; `server/auth/admin-routes.ts:195`; `server/auth/sessions.ts:23`, `server/auth/sessions.ts:83`, `server/auth/sessions.ts:98`.
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** Admin reset initiation mints a token, and successful redemption only updates the password/token columns. Neither path revokes existing sessions. `revokeAllSessionsForUser` already exists but is not part of reset completion. Local sessions have a sliding 30-day expiry, extended on authenticated activity.
- **Verified reproduction:** Create an account session, redeem its reset token, then reuse the original session cookie. The session row remains present and real `/api/auth/me` returns 200 rather than 401.
- **Impact:** A password reset is not sufficient to recover an account from a stolen session; an active holder can keep extending access even after the password changes. Expiry is not a reliable bound while the sliding session is being used.
- **Recommended Remediation:** In the same transaction as the winning conditional reset-token update, delete the user's sessions. Reset completion creates no replacement session today, so there is no current session to preserve. Define explicitly whether issuing an admin recovery link should also revoke sessions immediately.
- **Acceptance Criteria:** A pre-reset cookie receives 401 after successful redemption, all other device sessions are gone, failed/racing redemptions do not revoke newly created unrelated sessions, and rollback leaves the password/session state consistent.

### 2. Architectural Integrity & Boundaries

#### [ARCH-01] The claimed client/server import gate misses literal dynamic imports

- **Location:** `test/no-runtime-llm-access.test.ts:73`, `test/no-runtime-llm-access.test.ts:84`; `.oxlintrc.json:226`; `CLAUDE.md:58`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The server-interpretation and tools boundary tests search only `from` and `require(`. A literal `import('../../server/interpretation/llm-client.ts')` matches neither. The browser lint restriction names `sweph-wasm` and tools paths but does not prohibit the demonstrated server import.
- **Verified reproduction:** A temporary, documented `src/domain/__codex_review_boundary_probe.ts` exported a function returning that dynamic import. `oxlint --type-aware` on the file exited 0, and the server-boundary test's exact regular expression returned `false`. The probe was removed. No existing shipped browser-to-LLM import violation was found; the finding is an executable gap in the claimed enforcement.
- **Impact:** A lazy import can bypass the architecture checks protecting server/provider code from the browser graph. A downstream build failure is not a replacement for a precise boundary gate, and provider credentials were not shown to be bundled by this probe.
- **Recommended Remediation:** Resolve an AST-derived import graph for static imports, exports, `require`, and literal `ImportExpression` nodes; prohibit browser runtime edges into server/tool directories. Add negative fixtures for each syntax and explicit tests for ephemeris allowlisting. Avoid relying on another regex-only denylist.
- **Acceptance Criteria:** The exact probe fails a dedicated boundary check with its source and destination identified; valid lazy UI/PDF imports and the approved ephemeris consumer continue to pass.

### 3. Code Quality, Maintainability & Type Safety

#### [QUAL-01] The external snapshot decoder still repairs invalid containers and drops custom points

- **Location:** `src/domain/calculation-snapshot.ts:195`, `src/domain/calculation-snapshot.ts:366`, `src/domain/calculation-snapshot.ts:481`, `src/domain/calculation-snapshot.ts:511`; `src/ui/SharedChartView.tsx:58`.
- **Classification:** `Criticality: HIGH` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** `decodeCalculationSnapshot` validates settings only when `isRecord(value.settings)` is true, then calls the permissive parser. A present string or null skips validation and becomes default settings. `customPoints` is not strictly validated at all; the parser drops entries lacking string `id`, `name`, or `formula`. The resulting object is labeled with the supported snapshot version, with no indication that the imported calculation inputs changed.
- **Verified reproduction:** `{ version: 4, settings: 'not-settings' }` and `{ version: 4, settings: null }` both decode successfully with house system `P`. `{ version: 4, customPoints: [{ id: 'missing-formula', name: 'Lost point' }] }` decodes successfully with `customPoints: []`. These observations come from the actual decoder, not a modeled implementation.
- **Impact:** A shared/imported chart can look like a valid reconstruction while using substituted settings or omitting the sender's requested points. Scalar validation for otherwise valid settings does not cover container validity or partial-array loss.
- **Recommended Remediation:** Reject present-but-non-object `settings`; strictly validate the entire custom-point array and its flags before parsing. Keep the permissive parser for device-default repair and explicitly documented legacy absent-field migration. Decide and test the policy for malformed top-level snapshots as well; do not convert future/invalid external structures into current defaults without a visible result type.
- **Acceptance Criteria:** The three demonstrated payloads fail with an `invalid-field` error; valid historical snapshots still migrate deterministically; valid custom-point definitions round-trip without alteration.

#### [QUAL-02] JSON route handlers assume an object before runtime validation

- **Location:** `server/auth/routes.ts:75`, `server/auth/routes.ts:79`, `server/auth/routes.ts:283`; `server/auth/admin-routes.ts:169`; `server/corpus-candidates-routes.ts:118`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** A TypeScript `Body` interface does not constrain the runtime JSON body. Handlers destructure `request.body` before checking that it is a non-null object, and the demonstrated route has no structural body schema.
- **Verified reproduction:** A real `app.inject()` request with `Content-Type: application/json` and payload `null` to `/api/auth/login` returns 500. The same unchecked-destructuring pattern is present in the other locations listed; the 500 reproduction is specifically the login route.
- **Impact:** Valid-but-wrong-shaped untrusted input produces internal errors instead of deterministic 400s, bypassing the intended field-validation/error contract and adding avoidable operational error noise. No authorization bypass was demonstrated.
- **Recommended Remediation:** Use Fastify body schemas with `type: 'object'`, required fields, scalar types, and appropriate bounds. Apply the structural gate consistently to authentication, admin, corpus, sync, and interpretation JSON endpoints; keep business rules after that gate.
- **Acceptance Criteria:** Null, arrays, scalars, missing fields, and invalid field types receive the documented 4xx shape without throwing; valid clients retain their existing successful responses.

### 4. Performance & Resource Management

#### [PERF-01] Sync reads and account quotas are count-bounded, not byte-bounded

- **Location:** `server/ops/routes.ts:27`, `server/ops/routes.ts:36`, `server/ops/routes.ts:138`, `server/ops/routes.ts:250`, `server/ops/routes.ts:256`; `server/index.ts:103`; `src/sync/engine.ts:35`.
- **Classification:** `Criticality: HIGH` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The 1 MiB inbound body limit and 256 KiB normal-client push budget do not bound a later pull: it selects 500 rows, loads all ciphertexts, decrypts/base64-encodes them, and serializes the entire response. The account quota is 200,000 rows regardless of payload size. The body limit therefore cannot serve as a response or accumulated-storage limit.
- **Verified reproduction:** Insert 500 encrypted rows with 8,192 plaintext bytes each into an in-memory database and call the real pull route with `app.inject()`. It returns 200, 500 rows, and **5,541,401 response bytes**. Each row is well within the server's accepted request-size envelope. This test uses opaque synthetic bytes, not personal data, and does not claim that the normal UI emits this particular payload.
- **Impact:** Larger allowed rows amplify a single authenticated pull into tens or hundreds of megabytes plus database/decryption/serialization copies. A provisioned account can also accumulate storage orders of magnitude above what its row quota suggests. The synchronous SQLite/decryption path shares the server thread with unrelated requests; a production outage was not load-tested here.
- **Recommended Remediation:** Bound encoded page bytes while preserving ascending sequence/cursor semantics, and define the policy for a single oversized historical row. Enforce per-operation and per-user byte quotas server-side with transactional accounting; keep deduplicated retry behavior correct at quota. Migrate existing data without erasing its history. Consider streaming/bounded row iteration rather than `.all()` for the final response path.
- **Acceptance Criteria:** Responses remain within an explicit byte budget, account usage cannot exceed its configured byte quota through large or retried records, maximum-size historical rows have a recoverable path, and concurrent health/auth requests remain responsive in a controlled load test.

#### [PERF-02] Import files are read and synchronously parsed/staged without a size budget

- **Location:** `src/ui/PreferencesView.tsx:221`, `src/ui/PreferencesView.tsx:229`, `src/ui/PreferencesView.tsx:256`, `src/ui/PreferencesView.tsx:338`; `src/ui/PersonFileActions.tsx:99`, `src/ui/PersonFileActions.tsx:104`; `src/domain/full-export-importer.ts:415`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: BACKLOG` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** Restore, calculation-check, and single-person import read the entire selected `File` before considering its size. JSON parsing and export validation/staging then execute on the main thread. Per-field name/note limits do not bound the total number of people or histories, and invalid huge JSON still has to be read/parsed before schema rejection.
- **Impact:** A user-selected oversized or malformed file can stall the UI or exhaust the tab's memory before the review-before-write safeguard runs. This is a local import/resource issue, not an automatic remote file execution vector; no tab-crash benchmark was performed.
- **Recommended Remediation:** Check `file.size` against a documented import-byte limit before reading, add total record/revision budgets, and offer a supported large-import path with worker parsing/staging and cancellation. Reuse one policy across the three import entry points; report localized errors without partial writes.
- **Acceptance Criteria:** Oversized files are refused before `.text()`, supported maximum-sized imports keep the page responsive, cancellation leaves the store unchanged, and restore still commits atomically after preview confirmation.

### 5. UI, UX & Accessibility

#### [UX-01] Copy assumes the Clipboard API exists and suppresses denied-copy feedback

- **Location:** `src/ui/SortableTable.tsx:167`, `src/ui/SortableTable.tsx:175`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `navigator.clipboard.writeText(...)` is accessed before any availability guard or synchronous exception handling. The rejection branch deliberately does nothing, so unavailable clipboard support throws while denied permission gives the user no explanation or recovery action.
- **Impact:** Copy can appear broken on unsupported/restricted browser contexts; a rejected copy cannot be distinguished from an ignored click. A successful-copy indicator does not cover these failure states.
- **Recommended Remediation:** Feature-detect the API, catch synchronous access errors and promise rejections, and expose an English/Dutch status with a manual-copy or existing download alternative. Do not claim success when nothing reached the clipboard.
- **Acceptance Criteria:** Missing API, synchronous throw, rejected permission, and successful copy each have deterministic interaction tests; failure produces visible accessible feedback and no unhandled exception.

#### [UX-02] Person-switcher trigger announces a menu but opens a dialog

- **Location:** `src/ui/PersonSwitcher.tsx:78`, `src/ui/PersonSwitcher.tsx:90`.
- **Classification:** `Criticality: LOW` | `Urgency: BACKLOG` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `aria-haspopup="true"` advertises a menu popup, but the controlled element has `role="dialog"` and contains a text filter and ordinary links. This is a concrete role/state mismatch, not evidence that the non-modal switcher should become a menu or modal.
- **Impact:** Assistive technology receives an inaccurate popup-type hint and can announce an interaction model different from what opens. No screen-reader session or browser-wide accessibility certification was performed in this run.
- **Recommended Remediation:** Use `aria-haspopup="dialog"`, keeping the existing accessible dialog name, initial filter focus, Escape behavior, and ordinary-link navigation.
- **Acceptance Criteria:** A component/browser assertion verifies that the trigger's popup type matches the controlled role, without introducing modal focus trapping for this non-modal popup.

### 6. Internationalization & Local-First Integrity

#### [LF-01] The committed interpretation corpus lacks durable offline caching

- **Location:** `src/interpretation/corpus-client.ts:41`, `src/interpretation/corpus-client.ts:85`; `src/pwa/routing.ts:47`; `vite.config.ts:37`; `server/index.ts:178`; `README.md:43`.
- **Classification:** `Criticality: HIGH` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** Reports fetch `/corpus/<locale>.json`; the service worker classifies it as `bypass`. The precache manifest contains emitted HTML/JS/CSS, not public corpus JSON. The server also gives corpus paths `Cache-Control: no-cache`, not an application-controlled offline fallback. `loadRuntimeCorpus()` needs the base chunk even though override failures are tolerated.
- **Verified evidence:** The actual classifier returns `bypass` for a same-origin GET of `/corpus/en.json`. The freshly built manifest contains 78 entries and no corpus entries. The committed text is therefore not covered by either precaching or a runtime Cache Storage strategy.
- **Impact:** A new report load after the in-memory corpus is gone has no guaranteed corpus response offline if the ordinary HTTP cache cannot supply it. This is a gap in the documented normal-mode offline experience, not a claim that every warm browser cache always fails. An end-to-end offline browser reproduction was not run because local server startup was restricted.
- **Recommended Remediation:** Add a versioned cache policy for the committed per-locale chunks, populate the active locale before declaring it offline-ready, and fall back to it offline. Keep signed-in API responses and optional overrides separate. Surface incomplete offline readiness rather than assuming that caching the JavaScript also caches its data. Preserve corpus contents verbatim.
- **Acceptance Criteria:** After online installation/loading in each supported locale, a fresh page/report opens offline with HTTP caching disabled and the release's service-worker caches retained. Repeat for the deployed base path and release upgrade; no authenticated API response enters the public corpus cache.

#### [LF-02] Skipped or rejected incoming operations can still produce a fully synced status

- **Location:** `src/sync/engine.ts:404`, `src/sync/engine.ts:413`, `src/sync/engine.ts:420`, `src/sync/engine.ts:482`; `src/store/store.ts:120`; `test/sync-engine.test.ts:295`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** Decode failures are console-warned and dropped, `store.receive()`'s structured rejection summary is ignored, and the pulled cursor advances past the whole page. With no outgoing records, the engine then reports `synced`. The existing resilience test explicitly expects that green state even with an invalid-base64 incoming row.
- **Impact:** Continuing past one bad operation correctly avoids wedging all later data, but the user is not told that part of the history is absent and there is no engine-owned durable retry/recovery queue. A subsequently repaired server row behind the cursor is not automatically revisited. This is not loss of all server history; it is undisclosed partial local convergence.
- **Recommended Remediation:** Preserve row identity/raw material and store rejection reasons in account-scoped quarantine before committing cursor progress; show a partial-sync state/count and provide bounded retry/export/recovery. Keep healthy rows flowing. Do not turn unsupported future-version operations that the store intentionally preserves into corrupt-row failures.
- **Acceptance Criteria:** A bad row between two good rows does not block them, remains durably recoverable after reload, prevents a misleading fully-synced status, and can be replayed after correction without duplicating good operations.

#### [I18N-01] Server error prose bypasses English/Dutch message catalogues

- **Location:** `server/auth/routes.ts:285`, `server/auth/routes.ts:290`, `server/auth/routes.ts:293`; `src/sync/auth-client.ts:41`; `src/ui/SetPasswordForm.tsx:69`; `src/ui/SetupForm.tsx:60`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The server returns English error strings such as `This link is invalid or has expired` and `Password is too weak`. The client makes that prose the `AuthError.message`; the forms display the message directly, even when their labels and instructions use Dutch catalogues. Catalogue key parity cannot catch a string that never entered a catalogue.
- **Impact:** Important recovery/setup failures switch languages and expose transport-level fallback wording. Matching English prose in the UI would make the API contract brittle.
- **Recommended Remediation:** Return stable error codes with safe diagnostic text; map known codes to co-located en/nl messages and use a localized fallback for unknown codes/statuses. Apply the same pattern to the other thin fetch clients when expected errors reach user-visible status messages.
- **Acceptance Criteria:** Under Dutch locale, weak-password, expired-token, malformed-request, rate-limit, and unknown-server-error paths render Dutch user-facing messages; English remains complete and server diagnostics remain available without becoming the display contract.

### 7. Test Coverage & Quality Assurance

#### [QA-01] Security/convergence tests omit the adversarial timing properties that fail here

- **Location:** `test/server-admin.test.ts:273`, `test/server-admin.test.ts:326`; `test/sync-engine.test.ts:295`, `test/sync-engine.test.ts:327`; `src/sync/engine.ts:465`; `server/auth/routes.ts:296`.
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The reset-link test attempts reuse only after the first request finishes. Sync tests close engines as cleanup and the corrupt-row test asserts `synced` after accepting a good neighbor. Those assertions do not establish atomic token consumption, credential-recovery session invalidation, or absence of work after close/account replacement. The audit's independent deterministic reproductions expose those exact missing properties.
- **Impact:** A broad passing math/UI suite can coexist with account-isolation and credential-recovery failures. This is a specific scenario-coverage gap, not a claim that the repository needs arbitrary global coverage thresholds or mocked numerical-engine tests.
- **Recommended Remediation:** Add tests that (1) pause a real store's pull, close engine/store, switch identity, then resolve it; (2) submit two reset redemptions concurrently; (3) reuse a pre-reset session cookie; and (4) require durable partial-state reporting when a pulled row is rejected. Use `app.inject()` for route-level races and retain at least one real-browser account-switch test for cookie behavior. Leave Swiss Ephemeris/golden-chart tests real.
- **Acceptance Criteria:** New tests fail on the audited revision, pass only after the relevant root fixes, do not depend on timing sleeps to create the races, and make no paid provider calls. Run them alongside the complete existing gates in a permitted environment.

### 8. Documentation & Agent Maintainability

#### [DOC-01] NOTICE promises an in-app inventory that the dependency guide says does not exist

- **Location:** `NOTICE:49`; `docs/ops/DEPENDENCIES.md:127`; `src/ui/About.tsx:76`.
- **Classification:** `Criticality: LOW` | `Urgency: BACKLOG` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `NOTICE` says a generated, per-release inventory of every dependency/license is published in About. The current dependency guide explicitly identifies that as aspirational and says its hand-maintained table is the actual source of truth. About's acknowledgement block links back to NOTICE, not to a generated inventory.
- **Impact:** A user or contributor following the promised inventory destination does not obtain that artifact, and agent guidance has two incompatible descriptions of the current process. This finding does not assert a license violation.
- **Recommended Remediation:** Correct the claim and link the actual version-appropriate inventory; alternatively, add the build-generated inventory and its About destination before retaining the claim. Keep the canonical dependency guide and shipped acknowledgement wording in sync.
- **Acceptance Criteria:** Following the documented destination yields the described inventory for the running release, or all relevant text accurately describes the hand-maintained repository inventory instead.

---

## Verification Evidence & Review Boundaries

### Executed checks

| Check                                                             | Result                        | Evidence / interpretation                                                                                                                                                                                                                                                                               |
| :---------------------------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                                   | Blocked at formatting         | Pre-existing, untracked `docs/audit/2026-11-08-ui-ux-design-system-audit.md` is unformatted; it was not changed. The aggregate command did not reach its later gates.                                                                                                                                   |
| `npm run lint`                                                    | PASS                          | Type-aware oxlint completed independently, exit 0.                                                                                                                                                                                                                                                      |
| `npm run typecheck`                                               | PASS                          | TypeScript project-reference check completed independently, exit 0.                                                                                                                                                                                                                                     |
| `npm run test`                                                    | PARTIAL / environment-limited | 423 test files passed, 11 failed; 5,251 tests passed, 134 failed, 1 todo across 5,386 tests. Failures include denied loopback listeners and `tsx` IPC (`listen EPERM`) plus teardown failures after setup could not start. This is not a clean suite or 134 independently demonstrated product defects. |
| Permitted test rerun                                              | NOT EXECUTED                  | Escalation was requested; the approval service failed with an unavailable-model/403 error before execution. No sandbox bypass was used.                                                                                                                                                                 |
| `npm run build`                                                   | PASS                          | Fresh browser and service-worker production builds completed, exit 0, without reported build warnings.                                                                                                                                                                                                  |
| `npm run check:bundle-size`                                       | PASS                          | Eager JS graph 613,419 bytes / 665,600-byte budget across five chunks; Swiss Ephemeris/WASM and the listed lazy screens remain separate.                                                                                                                                                                |
| `node scripts/gen-constants.mjs --check`                          | PASS                          | 275 numeric constants and 12 file names match `sweph-wasm` 2.6.9.                                                                                                                                                                                                                                       |
| Targeted actual-module/route/store reproductions                  | PASS as defect reproductions  | Snapshot repair, corpus bypass, concurrent reset `[200,200]`, old-cookie `/me` 200, null-login 500, 5,541,401-byte pull page, and old-engine POST under replacement identity were reproduced. Passing here confirms the defects, not a fix.                                                             |
| Dynamic-import boundary probe                                     | CONFIRMED GAP                 | Targeted type-aware lint exited 0; the guard regex did not detect the literal server import. Temporary source file was removed.                                                                                                                                                                         |
| `npm audit --json`                                                | UNAVAILABLE                   | Registry DNS resolution failed (`ENOTFOUND registry.npmjs.org`); requested escalation also failed before execution. No current zero-vulnerability assertion is made for production or development dependencies.                                                                                         |
| Playwright E2E / interactive accessibility / offline browser test | NOT RUN                       | Server-backed tests require currently denied local listener access; no successful E2E or visual-a11y pass is claimed.                                                                                                                                                                                   |
| Docker image build/smoke / registry security scans                | NOT RUN                       | Docker/remote image behavior and current advisory databases were not verified in this run. Workflow source was inspected, not equated with a green remote run.                                                                                                                                          |

The targeted clipboard interaction is recorded separately in the audit work log; UX-01's location and missing-API behavior are also directly inspectable without a browser server. Review artifacts and command logs are local working evidence, not replacements for permanent regression tests.

### Repository-wide coverage inventory

This is a repository-wide, risk-prioritized source review with concrete targeted executions, not a claim that every line or every UI route received a manual runtime walkthrough. The inventory counted 535 source modules, 32 server modules, 437 test/support modules, 84 E2E/support modules, 46 tool modules, and 18 script modules using TS/TSX/JS/MJS extensions. Generated corpus prose was excluded from content review; no paid API was called.

| Layer                        | Reviewed implementation / controls                                                                                                                                                               | Limit of conclusion                                                                                                                                                                                                                           |
| :--------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser/domain/engine        | `src/domain/calculation-snapshot.ts:481`, `src/domain/full-export-importer.ts:369`, `src/ephemeris/client.ts:129`, `src/ephemeris/worker.ts:81`, `src/ephemeris/engine.ts:676`                   | Source traces, numerical tests exercised by the unit run, build/chunk verification; not an independent astronomy re-certification.                                                                                                            |
| Backend/auth/privacy         | `server/index.ts:93`, `server/auth/routes.ts:72`, `server/auth/identity.ts:118`, `server/auth/sessions.ts:56`, `server/csrf.ts:57`, `server/csp.ts:1`, `server/interpretation-routes.ts:62`      | Traced validation, auth/RBAC, cookie/proxy/CSRF/header controls, optional provider boundary and consent-related request handling; no production penetration test or regulatory-compliance claim.                                              |
| Database/encryption/sync     | `server/db.ts:410`, `server/db.ts:447`, `server/ops/crypto.ts:71`, `server/ops/routes.ts:96`, `src/store/store.ts:308`, `src/sync/engine.ts:394`                                                 | In-memory migrations/routes and real store logic with fake IndexedDB for controlled repros; no destructive operation on an existing database or production key-rotation rehearsal.                                                            |
| UI/a11y/i18n/PWA             | `src/ui/primitives/StagedDialog.tsx:60`, `src/ui/SortableTable.tsx:167`, `src/ui/PersonSwitcher.tsx:78`, `src/ui/SetPasswordForm.tsx:69`, `src/ui/locale.ts:36`, `src/pwa/routing.ts:47`         | Static semantic/state analysis and selected DOM checks; not a complete WCAG audit, viewport sweep, or browser compatibility certification.                                                                                                    |
| Dependencies/build/container | `package.json:9`, `package-lock.json:1`, `vite.config.ts:30`, `scripts/check-bundle-size.mjs:1`, `Dockerfile:27`, `Dockerfile:62`, `Dockerfile:74`, `docs/ops/DEPENDENCIES.md:17`                | Locked package inventory, lazy boundaries, production build, digest-pinned image definitions and production-only dependency stage reviewed; current registry advisories and built image not verified.                                         |
| CI/CD and tools              | `.github/workflows/ci.yml:1`, `.github/workflows/ci.yml:129`, `.github/workflows/security-scan.yml:24`, `.github/workflows/docker.yml:1`, `tools/corpus-gen/MAP.md:1`, `scripts/e2e-shard.mjs:1` | Workflow triggers, permissions, job gates, runner-image compatibility and build-time tool segregation inspected. Locked Playwright is 1.65.0, matching the CI image; its package range alone is not a mismatch. Remote CI status not queried. |
| Agent maps/documentation     | `CLAUDE.md:1`, `MAP.md:1`, `server/MAP.md:1`, `src/store/MAP.md:1`, `src/sync/MAP.md:1`, `docs/ops/DEPENDENCIES.md:123`, `NOTICE:49`                                                             | Local maps and canonical guidance inspected; selected Markdown links resolved. All 613 TS/TSX/MJS source/server/tool files in the header scan contain the four required tags. No missing-header finding is invented.                          |

**Secret-handling boundary:** The tracked secret-like filename scan found `.env.example`, not an actual tracked `.env.local`, key file, or runtime database. Environment-variable call sites and build/container exclusions were reviewed; actual local secret values were not read or included. This is not a full-history secret scan and does not prove that secrets never existed in earlier commits.

**Historical findings:** Earlier audit notes were used only as search leads. This report does not carry forward the earlier cost-reservation expiry race, direct admin child-table Cartesian join, or tracked benchmark database as current findings. Current source has the expired-lease accounting/provider deadline path, pre-aggregated admin summaries, and no tracked benchmark database. The new findings and counts above stand on the inspected revision, not older test totals or advisory results.

### Release verification still required

1. Fix the three immediate security paths and add their deterministic tests before treating account recovery/isolation as safe.
2. Finish or format the pre-existing documentation work independently, then rerun `npm run check` with local HTTP/IPC permitted.
3. Run `npm run test:e2e`, including account-switch cookie isolation, offline corpus reload, and the affected English/Dutch failure flows; record actual totals and failures.
4. Refresh `npm audit --json` and `npm audit --omit=dev --json` with registry access; inspect reachable runtime and development findings separately rather than reusing a historical clean result.
5. Run the image verification/smoke/security workflow appropriate to the release and record its image digest and concrete results. Re-run targeted Markdown formatting and whitespace checks on the report/map changes.
