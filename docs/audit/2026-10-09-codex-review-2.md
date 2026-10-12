# Repository Audit & Review Report — Astraya

**Audit date:** 2026-10-09  
**Baseline:** `f41d2f8979615f0a759371edece071c01fffb829` (`v0.34.0`) plus the pre-existing working-tree corpus/evaluation state. The audit added only this report and did not alter the existing corpus, evaluation-tracking, or batch-state work.

## Executive Summary

- **Overall Code Health Score:** **88%**
- **Overall Score Justification & Path to 100%:** Astraya has strong type, authentication, authorization, encryption, local-first, accessibility, test, and architectural-boundary foundations. Points were deducted because Tier 2 logs request/response content, the README makes privacy claims contradicted by runtime network paths, browser-storage denial can break locale initialization, a diagnostic helper emits a supported-runtime warning and can interrupt store notifications, the production bundle is both warning-producing and close to its eager budget, and repository-maintenance rules are not reflected in the current maps/header inventory. Reaching 100% requires content-free Tier 2 logging, accurate top-level privacy copy, a shared failure-safe web-storage adapter, warning-free supported-runtime gates, more eager-bundle headroom, and automated map/module-header drift checks.
- **Key Strengths:**
  - Strict TypeScript project references and type-aware ESLint pass across client, server, tests, and E2E code.
  - Authentication, role enforcement, CSRF, CSP, session handling, login throttling, OIDC validation, encrypted sync payloads, and Tier 2 spend reservations are implemented and tested.
  - Runtime LLM, build-tool, and Swiss Ephemeris boundaries are explicit and test/lint enforced.
  - The local-first store, sync engine, calculation engine, PDF flows, responsive UI, and accessibility paths have unusually broad executable coverage.
  - Production dependencies have no current npm advisories; heavy ephemeris and PDF dependencies remain outside the eager graph.
- **Primary Risk Areas:**
  - Tier 2 prompt/chart content and model output can enter server logs.
  - Public privacy statements disagree with runtime Tier 2 and geocoding behavior.
  - Denied web storage can prevent locale initialization or interrupt core store notifications.
  - The eager graph uses 97.9% of its budget and production builds emit an oversized-chunk warning.
  - Agent maps and mandatory module-header metadata have no drift gate.

### Domain Health & Findings Summary

| Domain                                | Score (%) | Critical | High | Medium | Low | Total Findings |
| :------------------------------------ | :-------: | :------: | :--: | :----: | :-: | :------------: |
| Application Security & Data Privacy   |    76%    |    0     |  1   |   1    |  0  |       2        |
| Architectural Integrity & Boundaries  |   100%    |    0     |  0   |   0    |  0  |       0        |
| Code Quality, Maintainability & Types |    88%    |    0     |  0   |   1    |  0  |       1        |
| Performance & Resource Management     |    84%    |    0     |  0   |   1    |  0  |       1        |
| UI, UX & Accessibility (a11y)         |   100%    |    0     |  0   |   0    |  0  |       0        |
| i18n & Local-First Integrity          |    85%    |    0     |  0   |   1    |  0  |       1        |
| Test Coverage & Quality Assurance     |    90%    |    0     |  0   |   0    |  0  |       0        |
| Documentation & Agent Maintainability |    82%    |    0     |  0   |   0    |  2  |       2        |

---

## Gap Analysis & Pathway to 100% by Domain

### 1. Application Security & Data Privacy (76% / 100%)

- **Deduction Reasons:** `SEC-01` records user/model content in logs, including an error-level path active at the default log level. `SEC-02` documents absolute privacy guarantees contradicted by Tier 2 and unauthenticated geocoding network paths.
- **Actionable Remediation to Reach 100%:** Remove payloads and provider prose from all logs and thrown errors; log only request IDs, model/status/attempt, latency, and token counts. Add marker-based log-confidentiality tests. Rewrite README privacy copy to distinguish the local standard report, opt-in Tier 2 processing, optional sync, and place-search disclosure.

### 2. Architectural Integrity & Boundaries (100% / 100%)

- **Deduction Reasons:** No actionable import-boundary or layer violation was confirmed. The Swiss Ephemeris, `tools/`, and runtime-LLM boundaries remain mechanically enforced.
- **Actionable Remediation to Reach 100%:** Maintain the current lint/test gates when adding providers, tools, or ephemeris consumers.

### 3. Code Quality, Maintainability & Type Safety (88% / 100%)

- **Deduction Reasons:** `QUAL-01` uses a global web-storage access in a cross-runtime diagnostic helper without an environment guard or exception boundary. It emits a warning under a supported Node version and can throw between persistence and subscriber notification.
- **Actionable Remediation to Reach 100%:** Make diagnostic tracing a best-effort operation through a safe storage reader, test Node and throwing-storage environments, and make supported-runtime warning output fail CI.

### 4. Performance & Resource Management (84% / 100%)

- **Deduction Reasons:** `PERF-01` leaves 14,161 bytes of eager-budget headroom and emits a Vite warning for two minified chunks over 500 kB. The PDF renderer is correctly lazy, but its one-shot transfer is still 517.86 kB minified; the eager entry is 549.12 kB.
- **Actionable Remediation to Reach 100%:** Produce a module-level bundle profile, reduce the eager graph below an agreed safety margin, split stable vendor/UI groups where that changes caching or load behavior, and split the PDF libraries/renderer if practical. Keep both the eager-graph budget and Vite warning gate warning-free.

### 5. UI, UX & Accessibility (100% / 100%)

- **Deduction Reasons:** No actionable UI/a11y defect was confirmed. All 131 Chromium scenarios passed, including axe checks, keyboard tooltip/menu behavior, responsive layouts, live feedback, export flows, and empty/error states.
- **Actionable Remediation to Reach 100%:** Keep the current per-screen browser and axe coverage as new screens are added.

### 6. Internationalization & Local-First Integrity (85% / 100%)

- **Deduction Reasons:** `I18N-01` reads the saved locale at module initialization and writes it without handling storage denial. A `SecurityError` can prevent the app from importing or leave locale state changed without notifying subscribers.
- **Actionable Remediation to Reach 100%:** Match the failure-safe pattern already used by theme/rulership settings, retain an in-memory locale when persistence fails, and add an import/write test with a throwing `localStorage` accessor. Continue enforcing English/Dutch catalogue and corpus parity.

### 7. Test Coverage & Quality Assurance (90% / 100%)

- **Deduction Reasons:** The executable coverage is broad, but no regression currently asserts that Tier 2 logs exclude content or that locale initialization survives denied storage. The declared zero-warning rule is not an executable gate: unit and production-build commands complete successfully while emitting repository-caused warnings.
- **Actionable Remediation to Reach 100%:** Add confidentiality and denied-storage regression tests, capture stderr in the supported Node matrix, fail on unexpected warnings, and retain the current calculation, integration, Playwright, and bundle checks.

### 8. Documentation & Agent Maintainability (82% / 100%)

- **Deduction Reasons:** `DOC-01` confirms omitted files/dependencies in three agent maps. `DOC-02` confirms 275 tracked TypeScript/JavaScript modules without the required `@module` header even though `CLAUDE.md` labels the rule build/lint enforced.
- **Actionable Remediation to Reach 100%:** Correct the three maps, decide and document the exact header scope, backfill the required tags, and add CI checks that compare directory contents/imports with maps and reject missing module metadata.

---

## Prioritized Action Plan

### 🚨 Urgent / Immediate Priority (P0)

| ID     | Finding                                                                                     | Location                                  | Criticality | Effort | Scope     |
| :----- | :------------------------------------------------------------------------------------------ | :---------------------------------------- | :---------- | :----- | :-------- |
| SEC-01 | Tier 2 logs full request/response content and can log invalid provider prose at error level | `server/interpretation/llm-client.ts:148` | HIGH        | EASY   | QUICK_FIX |

### ⚠️ High Priority / Next Release (P1)

| ID      | Finding                                                                                   | Location                           | Criticality | Effort   | Scope             |
| :------ | :---------------------------------------------------------------------------------------- | :--------------------------------- | :---------- | :------- | :---------------- |
| SEC-02  | README privacy guarantees contradict Tier 2 and signed-out geocoding calls                | `README.md:33`                     | MEDIUM      | EASY     | QUICK_FIX         |
| QUAL-01 | Diagnostic tracing emits a supported-runtime warning and can interrupt store notification | `src/trace.ts:19`                  | MEDIUM      | EASY     | QUICK_FIX         |
| PERF-01 | Production build warns on >500 kB chunks while the eager graph is at 97.9% of budget      | `scripts/check-bundle-size.mjs:29` | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| I18N-01 | Locale initialization and updates fail when `localStorage` is denied                      | `src/ui/locale.ts:32`              | MEDIUM      | EASY     | QUICK_FIX         |

### 📋 Backlog / Technical Debt (P2)

| ID     | Finding                                                                         | Location                         | Criticality | Effort   | Scope             |
| :----- | :------------------------------------------------------------------------------ | :------------------------------- | :---------- | :------- | :---------------- |
| DOC-01 | Agent maps omit active modules and real PDF-plan dependencies                   | `server/interpretation/MAP.md:5` | LOW         | EASY     | QUICK_FIX         |
| DOC-02 | The mandatory `@module` rule is unenforced and missing from 275 tracked modules | `CLAUDE.md:53`                   | LOW         | MODERATE | TARGETED_REFACTOR |

---

## Detailed Findings by Theme

### 1. Security & Data Privacy

#### [SEC-01] Tier 2 request and response content enters server logs

- **Location:** `server/interpretation/llm-client.ts:148`, `server/interpretation/llm-client.ts:152`, `server/interpretation/llm-client.ts:222`, `server/interpretation/llm-client.ts:241`, `server/interpretation/llm-client.ts:244`, `server/interpretation/llm-client.ts:254`, `server/interpretation-routes.ts:838`, `server/interpretation-routes.ts:882`, `server/index.ts:93`
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** Every provider attempt logs `{ url, body }` at debug. `body` contains the full system instruction and `userContent`, which can include a user-entered customization instruction, resolved interpretation text, focus context, relationship facts, or exact computed chart positions. Successful provider payloads and error bodies are also logged. Invalid successful output is copied into thrown error messages (up to 500 characters), and the route logs those errors at error level, so that provider prose can be written even when `LOG_LEVEL` remains at its default `info`. The request logger only strips HTTP query strings; it has no redaction for these custom fields. The API key itself is sent in `x-goog-api-key` and is not included in the logged object.
- **Evidence:** A local stubbed-provider reproduction passed marker strings through `generateTier2Text` and observed `request_log_contains_user_marker=true` and `response_log_contains_model_marker=true` in the logger spy.
- **Root Cause:** Diagnostic value was implemented by serializing provider payloads rather than by logging bounded operational metadata. Parse errors then reuse provider content as exception text, crossing the debug/error-level boundary.
- **Impact:** A deployment that enables debug logging can persist user-selected instructions, derived chart material, and generated interpretation text in Docker logs or a central logging service with different retention/access controls from Astraya's encrypted result store. Malformed provider output can reach normal error logs without debug enabled.
- **Recommended Remediation:** Log request ID, provider/model, attempt, status, latency, and token counts only. Use fixed parse-error messages; never interpolate model output. Add a logger-spy regression with unique request/response markers and assert neither marker appears at any level.

```typescript
logger?.debug({ provider: 'gemini', model: config.model, attempt }, 'Tier 2 request started');
// Perform the provider request without serializing its body into logs.
logger?.debug({ status: response.status, promptTokens, outputTokens }, 'Tier 2 request completed');

// Do not include provider text in an exception that request.log.error will serialize.
throw new Error('Tier 2 response did not match the expected schema');
```

#### [SEC-02] README privacy guarantees contradict active runtime network paths

- **Location:** `README.md:21`, `README.md:33`, `README.md:42`, `src/interpretation/tier2-client.ts:33`, `src/ui/BirthPlaceSearch.tsx:46`, `src/ui/forward-geocode.ts:87`, `src/ui/forward-geocode.ts:101`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The README simultaneously advertises optional AI-customized interpretation and states that the shipped application “makes no model API calls, ever.” The runtime Tier 2 client explicitly calls the configured third-party provider through the server. The same design section says “Without signing in, nothing leaves your device,” while signed-out users can submit place-name searches to MapTiler or Nominatim; the query and, for default Nominatim, origin referrer leave the device. Later README sections describe these features correctly, but the top-level absolute claims remain false.
- **Root Cause:** Privacy copy from the original fully local runtime was not rewritten when optional runtime Tier 2 and external geocoding were added.
- **Impact:** Readers and deployers can make consent, deployment, or privacy-policy decisions from an assurance contradicted by the implementation and by later documentation.
- **Recommended Remediation:** Describe the standard report as local and build-time generated. State that AI-customized interpretation is a separate, explicit, signed-in request routed to the configured provider. Scope the sync sentence to sync records, and mention the disclosed place-search provider as the signed-out network exception.

### 2. Architectural Integrity & Boundaries

No actionable finding. `eslint.config.js:38-59`, `test/no-runtime-llm-access.test.ts`, and the full unit suite continue to enforce the `sweph-wasm`, build-tool, and runtime-provider boundaries.

### 3. Code Quality, Maintainability & Type Safety

#### [QUAL-01] Diagnostic tracing is not safe across supported runtimes or denied storage

- **Location:** `src/trace.ts:18`, `src/store/store.ts:284`, `src/sync/engine.ts:218`, `src/ui/session-context.tsx:283`, `CLAUDE.md:61`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `trace()` checks `typeof localStorage` and immediately calls `localStorage.getItem` without an exception boundary. Under Node 26.11.0 (allowed by `engines.node >=24`), merely accessing Node's experimental global triggers `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.` In a browser where storage access throws `SecurityError`, trace calls can throw too.
- **Evidence:** `NODE_OPTIONS=--trace-warnings npx vitest run test/store-store.test.ts --maxWorkers=1 --no-file-parallelism` passed 38 tests but traced the warning to `src/trace.ts:19`, called from `src/store/store.ts:284`.
- **Root Cause:** The helper checks for identifier existence, which reads Node's accessor, rather than first checking for a browser and treating storage/logging as best effort.
- **Impact:** The supported-runtime test gate emits a warning despite the repository's zero-warning rule. In the store commit path, tracing runs after durable persistence and before listeners; a thrown storage access can reject the mutation and skip UI notification even though the data was already committed.
- **Recommended Remediation:** Return before touching storage when `window` is absent, catch storage access, and never allow diagnostics to affect control flow. Add Node and throwing-storage tests.

```typescript
export function trace(scope: string, message: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem('astraya:trace') !== '1') return;
  } catch {
    return;
  }
  console.debug(`[trace:${scope}] ${message}`, data ?? {});
}
```

### 4. Performance & Resource Management

#### [PERF-01] Production chunks exceed Vite's warning threshold and the eager budget has 2.1% headroom

- **Location:** `scripts/check-bundle-size.mjs:24`, `scripts/check-bundle-size.mjs:29`, `src/ui/PdfExportBuilder.tsx:336`, `src/ui/PdfExportBuilder.tsx:346`, `src/ui/pdf-export-render.ts:17`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** A current production build emits Vite's “Some chunks are larger than 500 kB after minification” warning. The main entry chunk is 549.12 kB (188.53 kB gzip), and the lazy PDF-render chunk is 517.86 kB (164.42 kB gzip). The repository's separate eager-graph gate passes at 651,439 of 665,600 bytes, leaving 14,161 bytes (2.1%) before failure. Its comment still describes the eager graph as roughly 515 KiB.
- **Root Cause:** The eager application graph has continued to grow while the budget remained close to observed size. The PDF renderer intentionally imports `jspdf`, `jspdf-autotable`, and `svg2pdf.js` together; dynamic loading protects startup, but produces one large interaction-time chunk.
- **Impact:** A small additional eager feature can break the build-size gate. First load downloads a large application graph, and the first PDF export incurs a separate 164.42 kB gzip transfer. The warning also directly violates the repository's zero-warning build standard.
- **Recommended Remediation:** Generate a repeatable module-level size report; remove or defer the largest eager contributors until a deliberate safety margin exists. Evaluate stable vendor/manual chunks for caching and separate PDF library chunks where useful. Update the budget commentary from measured output. If the lazy PDF size is explicitly accepted, configure a reviewed warning threshold only after retaining a stricter eager-graph gate.

### 5. UI, UX & Accessibility

No actionable finding. The 131-test Chromium run passed axe coverage, semantic/keyboard interactions, small-screen behavior, loading/error feedback, navigation, and PDF workflows. Static inspection found no confirmed unsafe user-controlled SVG/HTML sink; the `dangerouslySetInnerHTML` sites consume application-generated escaped markup.

### 6. Internationalization & Local-First Integrity

#### [I18N-01] Locale storage denial can prevent startup or leave locale state partially applied

- **Location:** `src/ui/locale.ts:32`, `src/ui/locale.ts:37`, `src/ui/locale.ts:44`, `src/ui/theme-dom.ts:17`, `test/i18n-messages.test.ts`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `readStored()` accesses `localStorage` without a guard and runs at module initialization. If browser policy/private mode exposes storage but throws on access, importing the locale module fails before React can render. `setLocale()` changes the in-memory `current` value before the unguarded write; if the write throws, subscribers are not notified. Theme, symbol, rulership, transit-filter, and last-person settings already catch the same failure mode, so locale behavior is inconsistent with repository convention.
- **Evidence:** A local TypeScript reproduction replaced `globalThis.localStorage` with a getter throwing `DOMException('blocked', 'SecurityError')`; importing `src/ui/locale.ts` failed with `SecurityError: blocked`. No locale test covers denied storage.
- **Root Cause:** Locale persistence predates the shared failure-safe patterns used by newer device settings and has no in-memory fallback around storage.
- **Impact:** Users in a hardened or storage-restricted browser can get a startup failure instead of the English fallback. A storage failure while switching language can leave internal state changed without a rerender.
- **Recommended Remediation:** Wrap reads/writes, fall back to English on read failure, keep the chosen locale in memory when persistence fails, always notify subscribers after updating memory, and add denied-storage import/write tests.

### 7. Test Coverage & Quality Assurance

No separate finding. Executable coverage is broad, but the missing confidentiality/denied-storage regressions above allowed `SEC-01`, `QUAL-01`, and `I18N-01` to survive. The test command treats Node's localStorage warning as a pass, and the production build treats Vite's chunk warning as a pass; both contradict `CLAUDE.md:61`.

### 8. Documentation & Agent Maintainability

#### [DOC-01] Agent maps omit active modules and dependencies

- **Location:** `CLAUDE.md:25`, `CLAUDE.md:32`, `server/interpretation/MAP.md:5`, `tools/corpus-gen/MAP.md:3`, `tools/corpus-gen/MAP.md:9`, `src/ui/MAP.md:85`, `src/ui/pdf-export-plan.ts:96`
- **Classification:** `Criticality: LOW` | `Urgency: BACKLOG` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** `server/interpretation/MAP.md` omits active `cost-reservation.ts`. `tools/corpus-gen/MAP.md` says it covers 16 active scripts but omits active `cross-translate-composite.mjs`. The `pdf-export-plan.ts` entry names domain/chart dependencies while omitting direct imports from `ChartView`, `SynastryView`, `TransitView`, `PeriodicTransitView`, `ProgressionsView`, `SolarArcView`, and `ProfectionsView`.
- **Root Cause:** Map maintenance is manual and no check compares directory contents/imports with entries.
- **Impact:** Agents following mandatory onboarding can miss the spend-reservation layer, a paid corpus tool, and the PDF plan's real UI coupling.
- **Recommended Remediation:** Add the two files, correct the PDF dependency list within the one-line map format, and add a lightweight map-presence/drift script to CI.

#### [DOC-02] The mandatory module-header rule is not enforced and has 275 exceptions

- **Location:** `CLAUDE.md:53`, `CLAUDE.md:57`, `eslint.config.js:18`, `test/store-store.test.ts:1`, `e2e/about-primer.spec.ts:1`, `scripts/check-bundle-size.mjs:1`, `tools/corpus-gen/cross-translate-composite.mjs:1`
- **Classification:** `Criticality: LOW` | `Urgency: BACKLOG` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** `CLAUDE.md` places “All `.ts`/`.js` files must have `@module` header” under “Build/Lint Enforced,” but ESLint has no rule for it. A tracked-file scan found 275 modules without `@module`: 231 under `test/`, 30 under `e2e/`, 9 under `scripts/`, 1 under `tools/`, and 4 root config modules. Many contain useful prose headers; they are missing the exact `@module`, `@purpose`, `@conventions`, and `@exports` schema the repository requires.
- **Root Cause:** The convention was documented without an executable rule or a scoped migration of existing modules.
- **Impact:** A purported hard gate passes with widespread noncompliance, and agents cannot tell whether tests/config/scripts are exempt or simply stale.
- **Recommended Remediation:** Decide whether the rule applies to tests/config/scripts. Encode that scope in one check, backfill the selected files mechanically with reviewed purpose/convention/export metadata, and run the check in `npm run check`/CI.

---

## Validation Evidence

| Check                                              | Result                                                                                                                              |
| :------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| Prettier, ESLint, strict TypeScript                | Passed on the audited working tree                                                                                                  |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | Passed: 228 files / 2,791 tests; emitted the `src/trace.ts:19` localStorage warning documented in `QUAL-01`                         |
| `npm run test:e2e`                                 | Passed: production build plus 131 Chromium tests in 2.0 minutes                                                                     |
| `npm run build`                                    | Built 530 client modules and service worker; emitted the >500 kB chunk warning documented in `PERF-01`                              |
| `npm run check:bundle-size`                        | Passed: 651,439-byte eager graph / 665,600-byte budget; 14,161 bytes headroom                                                       |
| `node scripts/gen-constants.mjs --check`           | Passed: 275 numeric constants, 12 file names, `sweph-wasm` 2.6.9                                                                    |
| `npm audit --omit=dev --json`                      | Passed: 0 vulnerabilities; 104 production / 488 total dependencies                                                                  |
| Tracked secret-signature scan                      | No private-key headers or common AWS/GitHub/OpenAI token signatures found                                                           |
| Tier 2 log reproduction                            | Confirmed request and model-response markers enter debug log objects                                                                |
| Denied-storage locale reproduction                 | Confirmed module import throws `SecurityError: blocked`                                                                             |
| GitHub Actions at audit capture                    | `v0.34.0` Pages and Docker workflows passed; release and CI workflows were still running. Parent `main` commit `5cfca7d` CI passed. |

The first sandboxed loopback tests failed with `listen EPERM`, and the first registry audit failed sandbox DNS resolution. Both were rerun in the permitted runtime; those sandbox restrictions are not repository defects. Playwright's `NO_COLOR`/`FORCE_COLOR` warning came from the execution harness environment and is not classified as repository-caused. Local Docker smoke was not rerun because the matching `v0.34.0` Docker workflow passed during the audit.
