# Comprehensive Repository Audit & Astrological Engine Review — Astraya

## Executive Summary

- **Overall Application Health Score:** 89%
- **Overall Score Justification & Path to 100%:** The calculation engine is unusually well defended: it uses one Swiss Ephemeris boundary, refuses partial ephemeris assets, correctly handles sect-reversing Fortune/Spirit formulas, suppresses the redundant lot-to-own-luminary contacts, derives angle/lot motion by finite difference, and visibly falls back from polar-invalid quadrant houses. The main integrity gap is not the live calculation: it is the missing immutable calculation artifact. A settings-only snapshot is accepted leniently from shares/import-like data, does not retain custom point definitions, engine/tzdb/asset provenance, effective house fallback, or a canonical result fingerprint. Reaching 100% requires a strict, versioned artifact at every save/share/PDF/export/restore boundary; semantic validation of all untrusted settings; object-level visibility/participation controls; importable/interoperable exports; and the targeted delivery items below.
- **Key Strengths:**
  - `src/ephemeris/engine.ts:220` refuses a partial Swiss Ephemeris asset load instead of silently using a lower-accuracy fallback; `test/astrology-houses.test.ts:74` exercises the explicit Porphyry fallback at polar latitudes.
  - `src/domain/chart-compute.ts:255` uses passive calculated points, applies the orb from the real body side, removes the lot's redundant own-luminary contact, and calculates point applying/separating state from finite-difference motion.
  - `src/astrology/arabic-parts.ts:48` implements the day/night reversal for Fortune and Spirit, with formula provenance; `test/astrology-arabic-parts.test.ts:29` tests both sect branches.
  - `server/csp.ts:41`, `server/ops/crypto.ts:39`, and `test/no-runtime-llm-access.test.ts:40` establish a restrictive browser policy, authenticated at-rest sync encryption, and a tested browser/server LLM boundary.
  - At audited `HEAD` `59219cc`, `npm run check` passed all 3,215 tests, `npm run test:e2e` passed 204 browser tests (one opt-in visual-baseline test skipped), `npm audit --json` reported zero advisories, `npm run check:bundle-size` passed, and `npm run docker:smoke` verified `/healthz` and response security headers.
- **Primary Risk Areas:**
  - Shared, printed, and exported calculations do not carry a complete immutable calculation/result artifact (`ASTRO-01`).
  - The snapshot parser accepts unsupported semantic values and silently downgrades an unknown version (`QUAL-01`).
  - Practitioners cannot independently control visibility and aspect participation for every core/outer body (`UX-01`).
  - The default chart computation eagerly serializes fixed-star and declination work even when the current view cannot consume it (`PERF-01`).
  - Export is JSON-only and write-only; there is neither restore/import nor AAF/A93 interchange (`LOCAL-01`, `DOMAIN-02`).

### Domain Health & Findings Summary

| Domain                                           | Score (%) | Critical | High | Medium | Low | Total Findings |
| :----------------------------------------------- | :-------: | :------: | :--: | :----: | :-: | :------------: |
| Astrological Correctness & Calculation Integrity |    89%    |    0     |  1   |   0    |  0  |       1        |
| Application Security & Data Privacy              |    94%    |    0     |  0   |   1    |  0  |       1        |
| Architectural Integrity & Boundaries             |    91%    |    0     |  0   |   1    |  0  |       1        |
| Code Quality, Maintainability & Types            |    89%    |    0     |  1   |   0    |  0  |       1        |
| Performance & Resource Management                |    88%    |    0     |  0   |   1    |  0  |       1        |
| UI, UX, Accessibility & Visual Ergonomics        |    88%    |    0     |  0   |   1    |  0  |       1        |
| Domain Feature Completeness (Trad/Mod)           |    82%    |    0     |  0   |   2    |  0  |       2        |
| i18n & Local-First Integrity                     |    86%    |    0     |  0   |   2    |  0  |       2        |
| Test Coverage, QA & Documentation                |    92%    |    0     |  0   |   0    |  1  |       1        |

---

## Gap Analysis & Pathway to 100% by Domain

### 1. Astrological Correctness & Calculation Integrity (89% / 100%)

- **Deduction Reasons:** `CalculationSnapshot` stores only current UI settings and rulership (`src/domain/calculation-snapshot.ts:29`). It is not an immutable chart artifact: it lacks custom formula points, requested/effective house-system outcome, calculation warnings, resolved time/tzdb provenance, Swiss Ephemeris/library and asset identity, and a canonical result hash. `ChartView` computes custom points from the local person (`src/ui/ChartView.tsx:2382`) but passes only settings/rulership to `ShareLink` (`src/ui/ChartView.tsx:2488`), so a shared chart cannot reproduce that person-specific input.
- **Actionable Remediation to Reach 100%:** Introduce a versioned `CalculationArtifact` with a strict input snapshot, effective execution provenance, and canonical SHA-256 result hash. Persist it with saved charts and use it unchanged for share links, shared view, PDF metadata, JSON, backup/restore, and derived charts. Add real-engine parity fixtures for custom points, polar fallback, true node, sidereal ayanamsa, all aspect participation policies, and applying/separating state.

### 2. Application Security & Data Privacy (94% / 100%)

- **Deduction Reasons:** Application/runtime security is strong and the production dependency audit is clean, but CI/CD executes third-party GitHub Actions by mutable tags rather than immutable commit digests. `actions/checkout@v7` appears in `.github/workflows/ci.yml:18`, and Docker publishing with registry credentials uses mutable action tags in `.github/workflows/docker.yml:42`, `.github/workflows/docker.yml:48`, `.github/workflows/docker.yml:55`, and `.github/workflows/docker.yml:94`.
- **Actionable Remediation to Reach 100%:** Pin every `uses:` reference to an audited full commit SHA, retain the human-readable version as a comment, configure Renovate for digest updates, and add a workflow check such as `zizmor` or a pinned-action verifier.

### 3. Architectural Integrity & Boundaries (91% / 100%)

- **Deduction Reasons:** The browser Tier 2 client hand-mirrors server DTOs and validation shapes. `src/interpretation/tier2-client.ts:78`, `src/interpretation/tier2-client.ts:85`, and `src/interpretation/tier2-client.ts:127` document the duplication explicitly. The current no-runtime-LLM boundary is correct, but contract changes can now drift across independently maintained client, route, and provider shapes.
- **Actionable Remediation to Reach 100%:** Move browser-safe request/response DTOs and their structural validators into a pure shared module under `src/interpretation/`; import it from the browser and server without importing provider code. Keep server-side semantic validation and prompt guardrails authoritative.

### 4. Code Quality, Maintainability & Type Safety (89% / 100%)

- **Deduction Reasons:** `parseCalculationSnapshot` claims to normalize untrusted JSON but accepts any string as a `HouseSystem` (`src/domain/calculation-snapshot.ts:96`), any numeric orb scale (`src/domain/calculation-snapshot.ts:98`), and any numeric sidereal ayanamsa (`src/domain/calculation-snapshot.ts:58`). It also ignores the supplied snapshot version (`src/domain/calculation-snapshot.ts:138`). A reproducible probe accepted `version: 999`, `houseSystem: "not-a-house"`, `orbScalePercent: 100000`, and `ayanamsa: 999999` as a version-1 snapshot.
- **Actionable Remediation to Reach 100%:** Parse closed sets from their canonical registries, enforce documented numeric bounds, reject unsupported future versions with a typed error, and migrate only explicitly supported legacy payloads. Add test cases for every rejected enum/range/version and assert that the shared chart reports a safe diagnostic rather than invoking computation with invalid settings.

### 5. Performance & Resource Management (88% / 100%)

- **Deduction Reasons:** Every `computeChartDataAtJd` call requests ecliptic positions, houses, equatorial positions, obliquity, and one fixed-star request per `NATAL_FIXED_STARS` entry (`src/domain/chart-compute.ts:344`), even when the active chart view is only the default wheel. The ephemeris worker intentionally serializes requests (`src/ephemeris/worker.ts:102`), so the `Promise.all` fan-out is serialized at the production worker boundary rather than executed concurrently.
- **Actionable Remediation to Reach 100%:** Split calculation into a core chart result and named lazy enrichments (`declinations`, `fixedStars`, `midpoints`, etc.), cache enrichments by effective calculation artifact, and measure worker-call count/latency in a performance regression test. Preserve one complete export path that deliberately requests all enrichments.

### 6. UI, UX, Accessibility & Visual Ergonomics (88% / 100%)

- **Deduction Reasons:** The setting model provides visibility controls for selected derived/modern points only (`src/chart/extended-settings.ts:41`, `src/chart/extended-settings.ts:75`) and participation controls only for Chiron, Lilith, nodes, Vertex, Fortune, and Spirit (`src/chart/extended-settings.ts:67`). The aspect subject builder makes every other body participate unconditionally (`src/domain/chart-compute.ts:375`). A practitioner cannot independently hide or exclude a core/outer planet when reducing a dense wheel or aspect matrix.
- **Actionable Remediation to Reach 100%:** Replace point-specific booleans with an all-object policy keyed by every supported body/point: `visible`, `aspectParticipant`, and optional `tableVisible`. Offer consultation-safe presets such as Core, Traditional, Modern, and All; expose a compact chart-toolbar control; and test a 15–20-object wheel/matrix for fast keyboard and screen-reader filtering.

### 7. Domain Feature Completeness (82% / 100%)

- **Deduction Reasons:** Orb profiles are three immutable global scale presets (`src/astrology/orb-profiles.ts:25`) layered over one tiered configuration, and the source explicitly omits per-body moieties (`src/astrology/orb-profiles.ts:9`). There is no user-defined per-aspect/per-body profile with source/revision metadata. Separately, the JSON export deliberately declines AAF/A93 interchange (`src/domain/full-export.ts:22`).
- **Actionable Remediation to Reach 100%:** Define an evidence-backed, versioned orb-profile model containing per-aspect and, when a cited convention is selected, per-body/moiety rules. Make it selectable by natal/synastry/technique context and carry exact rules in the artifact. Implement AAF/A93 only after validating their field-level specifications and licensing; until then, explicitly label JSON as Astraya-native rather than practitioner interchange.

### 8. Internationalization & Local-First Integrity (86% / 100%)

- **Deduction Reasons:** The comparison branch contains English-only labels outside message catalogues: `"Comparison"` (`src/ui/ChartView.tsx:2466`), `"Natal"` (`src/ui/ChartView.tsx:2491`), and a title-cased raw route key (`src/ui/ChartView.tsx:2508`). Chart-type labels already exist in `src/ui/ChartTypes.messages.ts:15`. In addition, `FullExport` is write-only: `docs/domain/EXPORT_SCHEMA.md:96` confirms no importer/restore workflow exists, so local-first backup cannot actually recover data on another device or after data loss.
- **Actionable Remediation to Reach 100%:** Route comparison labels through `{ en, nl }` catalogues and add a Dutch comparison browser test. Build a versioned restore/import flow that validates before writing, shows a conflict/merge preview, imports into a recoverable operation set, and rejects unsupported schema versions without mutating local data.

### 9. Test Coverage, QA & Documentation (92% / 100%)

- **Deduction Reasons:** Validation breadth is excellent, but documentation currently contradicts runtime behavior. `docs/domain/EXPORT_SCHEMA.md:96` tells a future importer that `parseCalculationSnapshot` fails closed, while `src/domain/calculation-snapshot.ts:128` explicitly documents best-effort defaulting and the parser does not inspect a supplied version. `docs/audit/IMPLEMENTATION_PLAN.md:20` also describes the pre-snapshot shared-chart behavior that current `src/ui/SharedChartView.tsx:58` has already replaced.
- **Actionable Remediation to Reach 100%:** Correct or archive historical-plan assertions, make the export schema accurately describe current parsing semantics, and add executable documentation tests for strict version rejection, malformed snapshot settings, Dutch comparison headings, artifact parity, and backup restore.

---

## Prioritized Action Plan

### 🚨 Urgent / Immediate Priority (P0)

| ID       | Finding                                                                                         | Location                                | Criticality | Effort   | Scope             |
| :------- | :---------------------------------------------------------------------------------------------- | :-------------------------------------- | :---------- | :------- | :---------------- |
| ASTRO-01 | Replace settings-only provenance with an immutable calculation artifact and result fingerprint. | `src/domain/calculation-snapshot.ts:29` | HIGH        | COMPLEX  | MAJOR_REWRITE     |
| QUAL-01  | Strictly validate snapshots from shared/import-like input and reject unknown versions.          | `src/domain/calculation-snapshot.ts:92` | HIGH        | MODERATE | TARGETED_REFACTOR |

### ⚠️ High Priority / Next Release (P1)

| ID       | Finding                                                    | Location                            | Criticality | Effort  | Scope             |
| :------- | :--------------------------------------------------------- | :---------------------------------- | :---------- | :------ | :---------------- |
| SEC-01   | Pin GitHub Actions to immutable commit digests.            | `.github/workflows/docker.yml:42`   | MEDIUM      | EASY    | QUICK_FIX         |
| UX-01    | Add all-object visibility and aspect-participation policy. | `src/chart/extended-settings.ts:26` | MEDIUM      | COMPLEX | TARGETED_REFACTOR |
| I18N-01  | Localize comparison headings and fallback labels.          | `src/ui/ChartView.tsx:2466`         | MEDIUM      | EASY    | QUICK_FIX         |
| LOCAL-01 | Add validated full-export restore/import.                  | `docs/domain/EXPORT_SCHEMA.md:96`   | MEDIUM      | COMPLEX | TARGETED_REFACTOR |

### 📋 Backlog / Technical Debt (P2)

| ID        | Finding                                                                 | Location                                | Criticality | Effort   | Scope             |
| :-------- | :---------------------------------------------------------------------- | :-------------------------------------- | :---------- | :------- | :---------------- |
| ARCH-01   | Eliminate hand-mirrored Tier 2 wire contracts.                          | `src/interpretation/tier2-client.ts:78` | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| PERF-01   | Lazily compute chart enrichments across the serialized worker boundary. | `src/domain/chart-compute.ts:344`       | MEDIUM      | MODERATE | TARGETED_REFACTOR |
| DOMAIN-01 | Add source-backed professional orb profile rules.                       | `src/astrology/orb-profiles.ts:9`       | MEDIUM      | COMPLEX  | TARGETED_REFACTOR |
| DOMAIN-02 | Provide verified practitioner interchange beyond Astraya JSON.          | `src/domain/full-export.ts:22`          | MEDIUM      | COMPLEX  | MAJOR_REWRITE     |
| DOC-01    | Reconcile current behavior, audit plans, and export documentation.      | `docs/domain/EXPORT_SCHEMA.md:96`       | LOW         | EASY     | QUICK_FIX         |

---

## Detailed Findings by Theme

### 1. Astrological Engine & Computational Accuracy

#### [ASTRO-01] Calculation provenance is a settings snapshot, not a reproducible chart artifact

- **Location:** `src/domain/calculation-snapshot.ts:29`, `src/domain/chart-share.ts:30`, `src/ui/ChartView.tsx:2382`, `src/ui/ChartView.tsx:2488`
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: COMPLEX` | `Scope: MAJOR_REWRITE`
- **Issue:** A snapshot holds only `{ version, settings, rulership }`; `calculationSnapshotIdentity()` is a non-canonical 32-bit FNV-style display identifier. It does not capture custom points, requested/effective house system and warnings, resolved birth-time provenance, engine and asset versions, or canonical positions/houses/aspects/result state. Live chart calculation separately injects `person.customPoints`, but share data has only moment, settings, and `housesKnown`.
- **Impact:** A shared/printed/exported chart cannot prove which complete inputs and engine state produced the result. A formula-point chart silently changes its displayed objects when opened through a share path. An old result also cannot be independently verified after an ephemeris, timezone, or calculation-policy upgrade.
- **Recommended Remediation:**

```typescript
interface CalculationArtifactV2 {
  readonly snapshot: {
    readonly version: 2;
    readonly settings: ExtendedSettings;
    readonly rulership: RulershipChoice;
    readonly customPoints: readonly CustomPointDefinition[];
    readonly requestedHouseSystem: HouseSystem;
  };
  readonly provenance: {
    readonly astrayaVersion: string;
    readonly swephVersion: string;
    readonly ephemerisAssetHashes: Readonly<Record<string, string>>;
    readonly tzdbFingerprint: string;
    readonly effectiveHouseSystem: HouseSystem | undefined;
    readonly warnings: readonly string[];
  };
  readonly fingerprint: { readonly algorithm: 'sha-256'; readonly snapshotHash: string; readonly resultHash: string };
}
```

Persist this artifact once when a calculation completes. Rendering, PDF, sharing, exporting, restoring, and derived-chart construction must consume it rather than re-reading ambient device defaults.

#### [QUAL-01] Snapshot normalization accepts semantically invalid calculation settings

- **Location:** `src/domain/calculation-snapshot.ts:58`, `src/domain/calculation-snapshot.ts:92`, `src/domain/chart-share.ts:105`, `src/ui/SharedChartView.tsx:58`
- **Classification:** `Criticality: HIGH` | `Urgency: IMMEDIATE` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** Runtime validation checks primitive shape but not semantic membership or bounds. Any string is accepted as `houseSystem`; any finite number is accepted for orb scale and ayanamsa; the top-level supplied version is discarded and reconstructed as v1. Shared links decode a raw settings object before this parser processes it.
- **Impact:** A malformed or future share payload can reach calculation with invalid inputs or silently become a different calculation than the sender intended. That is especially dangerous for a product that presents a chart as reproducible evidence.
- **Recommended Remediation:**

```typescript
function parseHouseSystem(value: unknown): HouseSystem | undefined {
  return typeof value === 'string' && HOUSE_SYSTEMS.some((system) => system.code === value)
    ? (value as HouseSystem)
    : undefined;
}

function parseSnapshot(value: unknown): Result<CalculationSnapshot, SnapshotError> {
  if (!isRecord(value) || value.version !== CURRENT_SNAPSHOT_VERSION) return err('unsupported-version');
  const houseSystem = parseHouseSystem(value.settings?.houseSystem);
  if (houseSystem === undefined || !isFiniteOrbScale(value.settings?.orbScalePercent)) return err('invalid-settings');
  return ok(/* fully validated snapshot */);
}
```

Treat legacy unversioned data as a named migration path, not as an indistinguishable defaults fallback.

### 2. Security, Privacy & Delivery Supply Chain

#### [SEC-01] CI and release workflows use mutable GitHub Action tags

- **Location:** `.github/workflows/ci.yml:18`, `.github/workflows/ci.yml:44`, `.github/workflows/docker.yml:42`, `.github/workflows/docker.yml:48`, `.github/workflows/docker.yml:55`, `.github/workflows/docker.yml:94`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The workflows use major tags such as `actions/checkout@v7` and `docker/login-action@v4`. Tags are mutable references, while the Docker workflow handles registry credentials and release publishing.
- **Impact:** A compromised or retargeted upstream action tag can execute arbitrary code in CI and access the token scope or Docker Hub credentials available to that job.
- **Recommended Remediation:**

```yaml
- uses: actions/checkout@<verified-40-character-commit-sha> # v7
- uses: docker/login-action@<verified-40-character-commit-sha> # v4
```

Pin every action in all workflows, enable digest-update PRs, and fail CI when an unpinned action is introduced.

### 3. Architectural Integrity & Boundaries

#### [ARCH-01] Tier 2 browser/server DTOs are duplicated rather than contract-owned

- **Location:** `src/interpretation/tier2-client.ts:78`, `src/interpretation/tier2-client.ts:85`, `src/interpretation/tier2-client.ts:127`, `server/interpretation-routes.ts:19`
- **Classification:** `Criticality: MEDIUM` | `Urgency: BACKLOG` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The browser client explicitly hand-mirrors `Tier2Section`, freeform chart data, and relationship payload shapes owned by server modules. TypeScript cannot prove the two independently declared contracts remain aligned.
- **Impact:** A future server validation or response change can become a browser-only runtime failure, silently omit valid fields, or reject payloads generated by an older client bundle.
- **Recommended Remediation:**

```typescript
// src/interpretation/tier2-contract.ts -- pure, browser-safe DTO definitions
export interface Tier2Section {
  readonly heading: string;
  readonly body: string;
}
export interface Tier2ChartDataPayload {
  /* wire fields only */
}

export function isTier2ChartDataPayload(value: unknown): value is Tier2ChartDataPayload {
  // Structural checks shared by client fixtures and server route tests.
}
```

Keep policy validation, authentication, rate limiting, and LLM calls in `server/`; share only DTOs and non-sensitive structural validation.

### 4. Performance & Resource Management

#### [PERF-01] Default chart rendering eagerly serializes optional ephemeris enrichments

- **Location:** `src/domain/chart-compute.ts:344`, `src/domain/chart-compute.ts:359`, `src/ephemeris/worker.ts:102`
- **Classification:** `Criticality: MEDIUM` | `Urgency: BACKLOG` | `Effort: MODERATE` | `Scope: TARGETED_REFACTOR`
- **Issue:** The base chart computation always performs equatorial-position, obliquity, and all fixed-star lookups alongside positions and houses. The worker queue serializes its message handling, so fixed-star calls queued by `Promise.all` still occupy the same worker one after another.
- **Impact:** Initial chart rendering pays for data used only by optional overlays/tables. The cost scales poorly on low-power devices, after cache eviction, and when a redraw repeats the same effective chart.
- **Recommended Remediation:**

```typescript
interface ChartComputeNeeds {
  readonly declinations?: boolean;
  readonly fixedStars?: boolean;
  readonly angleMotion?: boolean;
}

const core = await computeCoreChart(jd, place, provider, options);
const enrichments = needs.fixedStars ? await fixedStarsFor(core, provider) : undefined;
return { ...core, ...(enrichments === undefined ? {} : { fixedStars: enrichments }) };
```

Memoize by the canonical calculation artifact and request complete enrichments only for export or a view that opens the relevant table/overlay.

### 5. UI, UX, Accessibility & Visual Ergonomics

#### [UX-01] Dense chart views lack an all-body visibility and aspect-participation policy

- **Location:** `src/chart/extended-settings.ts:26`, `src/chart/extended-settings.ts:75`, `src/chart/extended-settings.ts:155`, `src/domain/chart-compute.ts:375`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: COMPLEX` | `Scope: TARGETED_REFACTOR`
- **Issue:** Visibility is modeled only for modern points and a few special points; all core and outer planets stay active in the displayed and computational set. The user cannot make Mercury visible but non-participating, hide outer planets during a traditional consultation, or reduce an aspect matrix to an explicit focused set.
- **Impact:** A practitioner working with 15+ objects cannot deliberately manage visual density. The wheel may avoid glyph collisions, but the user still lacks the domain control needed to keep aspect lines, matrices, and inspector choices readable in a live consultation.
- **Recommended Remediation:**

```typescript
interface ObjectPolicy {
  readonly visible: boolean;
  readonly aspectParticipant: boolean;
  readonly tableVisible: boolean;
}

type ObjectPolicies = Readonly<Record<ChartObjectKey, ObjectPolicy>>;
```

Use the same policies in `computeChartData`, matrix construction, wheel ring input, tables, export, and the calculation artifact. Add Core, Traditional, Modern, and All presets without hiding the exact active policy.

### 6. Traditional & Modern Domain Feature Completeness

#### [DOMAIN-01] Orb profiles do not yet support source-backed per-body/per-aspect professional rules

- **Location:** `src/astrology/orb-profiles.ts:9`, `src/astrology/orb-profiles.ts:25`, `src/chart/extended-settings.ts:29`
- **Classification:** `Criticality: MEDIUM` | `Urgency: BACKLOG` | `Effort: COMPLEX` | `Scope: TARGETED_REFACTOR`
- **Issue:** The available profiles are Standard, Tight, and Wide variants of a single global scale. The source correctly declines to invent classical moieties, but there is no alternative profile model for verified per-aspect/per-body rules, custom practitioner profiles, revisions, or provenance.
- **Impact:** Professionals cannot model a named house style or preserve a custom methodology beyond a global percentage. Synastry's tighter default is a fixed implementation choice rather than a documented, portable profile the user can inspect and revise.
- **Recommended Remediation:**

```typescript
interface OrbProfileV2 {
  readonly id: string;
  readonly revision: number;
  readonly source: { readonly authority: string; readonly locator: string };
  readonly aspectRules: Readonly<Record<string, number>>;
  readonly bodyRules?: Readonly<Record<BodyKey, number>>;
}
```

Ship only cited presets, allow custom profiles as immutable snapshots, and include exact effective rules rather than only an ID in every calculation artifact.

#### [DOMAIN-02] Practitioner interchange remains Astraya JSON only

- **Location:** `src/domain/full-export.ts:22`, `docs/domain/EXPORT_SCHEMA.md:17`
- **Classification:** `Criticality: MEDIUM` | `Urgency: BACKLOG` | `Effort: COMPLEX` | `Scope: MAJOR_REWRITE`
- **Issue:** The repository explicitly declines AAF/A93 import/export because it does not yet have verified field-level format and licensing knowledge. Its versioned JSON schema is useful but remains application-native.
- **Impact:** Practitioners cannot reliably exchange birth records and chart settings with established desktop astrology workflows, limiting interoperability despite strong internal technique coverage.
- **Recommended Remediation:** First publish a field mapping and conformance fixtures for one verified interchange standard. Implement a narrow birth-record exchange path before attempting every calculated table, preserve unsupported data in a declared extension bag, and never claim compatibility for fields not round-tripped by fixtures.

### 7. Internationalization & Local-First Recovery

#### [I18N-01] Comparison headings bypass the English/Dutch catalogue system

- **Location:** `src/ui/ChartView.tsx:2466`, `src/ui/ChartView.tsx:2491`, `src/ui/ChartView.tsx:2508`, `src/ui/ChartTypes.messages.ts:15`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The comparison branch composes English strings and title-cases raw route keys instead of using catalogued labels. The existing chart-type catalogue already defines localized chart names.
- **Impact:** Dutch users receive mixed-language headings exactly where a side-by-side chart needs unambiguous identification.
- **Recommended Remediation:**

```tsx
const chartTypes = useMessages(chartTypesMessages);
const compareLabel = chartTypes.typeLabels[compareType];
const comparisonLabel = t.comparisonTitle(person.displayName || t.personFallback, compareLabel);

<h2>{chartTypes.typeLabels.natal}</h2>
<h2>{compareLabel}</h2>
```

Add an E2E assertion for the Dutch comparison route, not just catalogue key parity.

#### [LOCAL-01] Full export is not a usable recovery workflow because it cannot be restored

- **Location:** `src/domain/full-export.ts:1`, `docs/domain/EXPORT_SCHEMA.md:96`
- **Classification:** `Criticality: MEDIUM` | `Urgency: NEXT_RELEASE` | `Effort: COMPLEX` | `Scope: TARGETED_REFACTOR`
- **Issue:** `buildFullExport` writes a well-structured JSON document, but no importer accepts it. The schema documentation confirms the absence and therefore also the absence of backward-compatibility restore testing.
- **Impact:** A local-first user can download a backup but cannot recover it through the product after device loss, storage corruption, or a migration. This weakens the stated backup and portability promise.
- **Recommended Remediation:**

```typescript
export function validateFullExport(value: unknown): Result<FullExport, ImportError>;
export async function stageFullExportRestore(archive: FullExport, store: AstrayaStore): Promise<RestorePreview>;
```

Validate first, stage conflicts without writes, require explicit confirmation, preserve operation identities/provenance, and add old-version fixtures plus interruption/rollback tests.

### 8. QA & Documentation Integrity

#### [DOC-01] Export/parser documentation conflicts with the implementation and historic plan state

- **Location:** `docs/domain/EXPORT_SCHEMA.md:96`, `src/domain/calculation-snapshot.ts:128`, `docs/audit/IMPLEMENTATION_PLAN.md:20`, `src/ui/SharedChartView.tsx:58`
- **Classification:** `Criticality: LOW` | `Urgency: BACKLOG` | `Effort: EASY` | `Scope: QUICK_FIX`
- **Issue:** The export schema says `parseCalculationSnapshot` fails closed for unsupported settings, but the parser documents best-effort defaulting and does not inspect version. The implementation plan also retains an old assertion that shared charts recompute from the viewer's ambient rulership, although the current shared view parses sender settings.
- **Impact:** Future implementation work can rely on false safety semantics or repeat work already shipped, particularly around import/restore and calculation provenance.
- **Recommended Remediation:**

```typescript
it('rejects an unsupported snapshot version without computing a chart', () => {
  expect(parseCalculationSnapshot({ version: 999 })).toEqual(/* typed rejection */);
});
```

Make this test enforce the documented behavior, update `EXPORT_SCHEMA.md`, and label the historical implementation plan as a baseline with a verified-current status/date.
