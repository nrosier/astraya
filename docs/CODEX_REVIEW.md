# Repository Audit & Review Report — Astraya

**Audit date:** 2026-10-07
**Baseline:** `HEAD 2c885c1` plus the working-tree snapshot inspected during the audit. Existing and concurrently-created uncommitted changes were not modified.

## Executive Summary

- **Overall Code Health Score:** B / 84
- **Key Strengths:**
  - Strict TypeScript and type-aware ESLint configuration, including enforced `sweph-wasm`, `tools/`, and runtime-LLM import boundaries.
  - Strong authentication, authorization, CSRF, CSP, session, encrypted-sync, and server-side input-validation controls.
  - Local-first storage and sync behavior has broad unit, property, integration, multi-device, and browser coverage.
  - Production validation passed: 2,706 Vitest tests, 123 Playwright tests, production build, generated-constant verification, and the eager-bundle budget.
  - `npm audit --omit=dev` reported zero production dependency vulnerabilities on 2026-10-07.
- **Primary Risk Areas:**
  - Tier-2 LLM cost caps are checked non-atomically and can be exceeded by a single two-call request or concurrent requests.
  - The About screen makes an absolute “no AI service” privacy claim that is false when Tier 2 is configured.
  - Birth-place searches can display stale results when two requests resolve out of order.
  - The Changelog screen bypasses the repository's English/Dutch message-catalogue convention.
  - A newly added E2E test claims Dutch coverage while explicitly asserting English content.
- **Findings Summary:**

  | Domain             | Critical | High | Medium | Low | Total |
  | :----------------- | :------: | :--: | :----: | :-: | :---: |
  | Security & Privacy |    0     |  1   |   0    |  0  |   1   |
  | Architecture       |    0     |  0   |   0    |  0  |   0   |
  | Quality & Types    |    0     |  0   |   0    |  0  |   0   |
  | Performance        |    0     |  1   |   0    |  0  |   1   |
  | UI / UX / A11y     |    0     |  0   |   1    |  0  |   1   |
  | i18n & Local-First |    0     |  0   |   1    |  0  |   1   |
  | Test Quality       |    0     |  0   |   1    |  0  |   1   |
  | Docs & Maps        |    0     |  0   |   0    |  1  |   1   |

---

## Prioritized Action Plan

### 🚨 Urgent / Immediate Priority (P0)

| ID      | Finding                                                                              | Location                              | Criticality | Effort   | Scope             |
| :------ | :----------------------------------------------------------------------------------- | :------------------------------------ | :---------- | :------- | :---------------- |
| PERF-01 | LLM daily cost caps are not atomic and do not reserve budget before chargeable calls | `server/interpretation-routes.ts:806` | HIGH        | MODERATE | TARGETED_REFACTOR |

### ⚠️ High Priority / Next Release (P1)

| ID      | Finding                                                                    | Location                         | Criticality | Effort | Scope     |
| :------ | :------------------------------------------------------------------------- | :------------------------------- | :---------- | :----- | :-------- |
| SEC-01  | About screen falsely states that no AI service can be contacted at runtime | `src/ui/About.messages.ts:36`    | HIGH        | EASY   | QUICK_FIX |
| UX-01   | Out-of-order geocoding responses can replace newer search results          | `src/ui/BirthPlaceSearch.tsx:40` | MEDIUM      | EASY   | QUICK_FIX |
| I18N-01 | Changelog shell is permanently English                                     | `src/ui/Changelog.tsx:22`        | MEDIUM      | EASY   | QUICK_FIX |
| TEST-01 | “Dutch” primer E2E test only verifies English                              | `e2e/about-primer.spec.ts:77`    | MEDIUM      | EASY   | QUICK_FIX |

### Backlog (P2)

| ID     | Finding                                                             | Location      | Criticality | Effort | Scope     |
| :----- | :------------------------------------------------------------------ | :------------ | :---------- | :----- | :-------- |
| DOC-01 | Agent onboarding requires a dependency document that does not exist | `CLAUDE.md:5` | LOW         | EASY   | QUICK_FIX |

---

## Detailed Findings by Theme

### 1. Security & Data Privacy

#### [SEC-01] About screen falsely states that no AI service can be contacted at runtime

- **Location:** `src/ui/About.messages.ts:36`, `src/ui/ReportView.tsx:235`, `server/interpretation-routes.ts:816`
- **Classification:** `Criticality: HIGH` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The privacy copy says, “No AI service is contacted while you use Astraya” and claims CSP makes such contact impossible. The application now has an authenticated, consent-gated Tier-2 path that sends material to a configured model provider through the server. Browser CSP cannot prevent server-side `fetch()` calls. The statement is therefore materially false whenever Tier 2 is enabled, even though the point-of-use consent UI is otherwise explicit.
- **Impact:** Users and deployers receive contradictory privacy disclosures about external processing. This undermines informed consent and can create compliance and trust risk because the general privacy statement is more absolute than the actual data flow.
- **Recommended Remediation:** Describe Tier 1 and Tier 2 separately in both locales. State that the default interpretation is shipped locally, while AI-customized interpretation is optional, authenticated, separately consented, and sent through the server to the configured provider. Add a test asserting the About copy does not regress to an unconditional “no AI” claim.

```typescript
yourDataParagraph5:
  'The standard interpretation is written ahead of release and runs locally. ' +
  'If you explicitly choose AI-Customized interpretation, the disclosed chart facts and instructions ' +
  'are sent through this server to its configured AI provider for that request.',
```

### 2. Architectural Integrity & Boundaries

No actionable architectural-boundary violation was confirmed. The `sweph-wasm`, `tools/`, and runtime-LLM boundaries are lint/test enforced, and the shared `EphemerisProviderContext` prevents the previous per-screen worker duplication.

### 3. Code Quality, Maintainability & Type Safety

No separate quality/type-safety finding met the reporting threshold. Strict compilation, type-aware linting, no-floating-promise enforcement, runtime decoding of external data, and the full quality gate passed.

### 4. Performance & Resource Management

#### [PERF-01] LLM daily cost caps are not atomic and do not reserve budget before chargeable calls

- **Location:** `server/interpretation-routes.ts:806`, `server/interpretation-routes.ts:816`, `server/interpretation-routes.ts:831`, `server/interpretation-routes.ts:856`, `server/interpretation-routes.ts:868`, `server/interpretation/usage.ts:18`
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The route reads the user's and deployment's accumulated cost once, before any provider call. A customized request can then make a verification call, record its cost, and make a generation call without rechecking the cap. Separately, concurrent requests can all observe the same pre-call total, pass the check, await the provider, and record their costs only after the billable work has completed. SQLite's synchronous reads do not make this sequence atomic across the intervening `await`s.
- **Impact:** The variables documented as “real dollar caps” are advisory thresholds, not hard limits. One request can cross the cap after verification and still proceed to generation; concurrent requests can overshoot it by multiple full generations. The global cap is especially exposed because separate users can pass it simultaneously.
- **Recommended Remediation:** Reserve a conservative maximum request cost in SQLite before the first model call using a short `BEGIN IMMEDIATE` transaction that atomically checks committed usage plus active reservations. Reconcile the reservation to actual cost after each call and release it on failure. Use durable, expiring reservations rather than only an in-memory mutex so multiple server processes cannot bypass each other. Add a concurrency test using deferred provider responses plus a single-request test where verification itself crosses the cap.

```typescript
const reservation = reserveInterpretationBudget(db, {
  userId,
  maximumCostCents: maximumRequestCost(mode, instruction !== undefined),
  userDailyCapCents,
  totalDailyCapCents,
});

try {
  const result = await callProvider();
  commitInterpretationUsage(db, reservation.id, actualCostCents(result));
} catch (error) {
  releaseInterpretationReservation(db, reservation.id);
  throw error;
}
```

### 5. UI, UX & Accessibility

#### [UX-01] Out-of-order geocoding responses can replace newer search results

- **Location:** `src/ui/BirthPlaceSearch.tsx:40`, `src/ui/BirthPlaceSearch.tsx:46`, `src/ui/forward-geocode.ts:87`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** Each submit starts an independent `forwardGeocode()` promise. There is no `AbortController`, request sequence, or query identity check before applying results. If search A is slow and search B is fast, B's results render first and A can later overwrite them even though B was the latest user action.
- **Impact:** A user can be shown stale place candidates and select coordinates belonging to an earlier query. Because those coordinates feed birth-chart calculations, this is more than cosmetic loading-state flicker.
- **Recommended Remediation:** Cancel the prior request and also guard state updates with a monotonically increasing request id. Accept an `AbortSignal` in `forwardGeocode()` and pass it to both provider fetches. Add a component test with two deferred responses resolved in reverse order.

```typescript
const requestId = useRef(0);
const activeRequest = useRef<AbortController | undefined>(undefined);

const currentRequest = ++requestId.current;
activeRequest.current?.abort();
activeRequest.current = new AbortController();

void forwardGeocode(query, activeRequest.current.signal).then((results) => {
  if (currentRequest !== requestId.current) return;
  setSearchResults(results);
});
```

No separate accessibility defect was confirmed. The Playwright accessibility suite passed for the routes it covers.

### 6. Internationalization & Local-First Integrity

#### [I18N-01] Changelog shell is permanently English

- **Location:** `src/ui/Changelog.tsx:22`, `src/ui/Changelog.tsx:24`, `src/ui/Changelog.tsx:26`, `src/ui/Changelog.tsx:30`, `src/ui/MAP.md:15`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The Changelog screen hardcodes “Back,” “Changelog,” “You are running,” and “Full commit history” instead of using a co-located `{ en, nl }` message catalogue. The UI map also lists only `Changelog.tsx`, so the screen is outside the convention used by the rest of the UI and outside `test/i18n-messages.test.ts`'s catalogue scan.
- **Impact:** Switching the application to Dutch still leaves the screen chrome in English. The repository's parity test cannot detect missing translations because no catalogue exists.
- **Recommended Remediation:** Add `Changelog.messages.ts`, consume it through `useMessages()`, and update `src/ui/MAP.md`. The release-note body can remain the language of `CHANGELOG.md`; the application-owned navigation and status text should follow the selected locale.

```typescript
const en = {
  back: 'Back',
  heading: 'Changelog',
  running: (version: string) => `You are running ${version}.`,
  fullHistory: 'Full commit history',
};
const nl: typeof en = {
  back: 'Terug',
  heading: 'Wijzigingslogboek',
  running: (version) => `Je gebruikt versie ${version}.`,
  fullHistory: 'Volledige commitgeschiedenis',
};
```

No local-first persistence or sync-integrity defect was confirmed in the current implementation. Purge propagation, tab locking, clock-skew quarantine, offline sign-out, and multi-device convergence all have direct coverage.

### 7. Test Coverage & Quality Assurance

#### [TEST-01] “Dutch” primer E2E test only verifies English

- **Location:** `e2e/about-primer.spec.ts:77`, `e2e/about-primer.spec.ts:80`, `e2e/about-primer.spec.ts:84`, `e2e/about-primer.spec.ts:92`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The test is named “renders in Dutch with full translation,” but its own comments say it checks the English primer. It never activates the visible language toggle and asserts an English heading list. The test passes while providing no behavioral Dutch coverage.
- **Impact:** CI reports false confidence for a newly added user-facing translation. Key parity catches missing keys, but not accidentally English Dutch values, incorrect rendering, or failure to react to locale changes.
- **Recommended Remediation:** Switch locale in the browser and assert Dutch values from `aboutMessages.nl`. Keep the catalogue-parity test, but do not represent it as browser rendering coverage.

```typescript
import { aboutMessages } from '../src/ui/About.messages.js';

await gotoAndSettle(page, `${baseUrl}/#/about`);
await page.locator('.language-toggle').click();
await expect(page.getByRole('heading', { name: aboutMessages.nl.astrologyPrimerHeading, exact: true })).toBeVisible();
```

### 8. Documentation & Agent Maintainability

#### [DOC-01] Agent onboarding requires a dependency document that does not exist

- **Location:** `CLAUDE.md:5`, `CLAUDE.md:34`
- **Classification:** `Criticality: LOW` | `Urgency: BACKLOG` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The onboarding checklist requires every agent to read `docs/DEPENDENCIES.md`, and the file-change workflow requires updating it when external dependencies change. No such file exists under `docs/`.
- **Impact:** The documented workflow begins with a dead path and defines a maintenance obligation that contributors cannot satisfy. Dependency/licence and lazy-loading knowledge is consequently split across `package.json`, `NOTICE`, source comments, and build scripts instead of the promised inventory.
- **Recommended Remediation:** Either create the dependency inventory and make it the maintained source described by `CLAUDE.md`, or remove both requirements. A useful inventory should identify direct dependency, purpose, licence, runtime/build/test scope, and whether it must stay lazy-loaded.

```markdown
# Dependencies

| Package      | Scope          | Purpose                | Licence         | Loading Constraint                |
| :----------- | :------------- | :--------------------- | :-------------- | :-------------------------------- |
| `sweph-wasm` | Runtime worker | Swiss Ephemeris engine | AGPL-compatible | Import only from `src/ephemeris/` |
| `jspdf`      | Runtime export | PDF generation         | MIT             | Dynamic import only               |
```

---

## Validation Evidence

| Check                                    | Result                                                            |
| :--------------------------------------- | :---------------------------------------------------------------- |
| `npm run check`                          | Passed: formatting, lint, typecheck, 222 test files / 2,706 tests |
| `npm run test:e2e`                       | Passed: production build and 123 Chromium tests                   |
| `npm run check:bundle-size`              | Passed: 636,183-byte eager graph within 665,600-byte budget       |
| `node scripts/gen-constants.mjs --check` | Passed: 275 constants, 12 file names, `sweph-wasm` 2.6.9          |
| `npm audit --omit=dev --json`            | Passed: 0 vulnerabilities in the 104 production dependencies      |

The first sandboxed test attempt failed because the execution sandbox forbids binding `127.0.0.1` (`listen EPERM`). The complete quality and E2E gates above were rerun in the permitted runtime and passed; the sandbox failure is not a repository defect.
