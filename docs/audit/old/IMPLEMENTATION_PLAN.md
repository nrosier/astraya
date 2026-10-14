# Implementation plan: Astraya professional-astrology audit (issues #541–#566)

## Context

`docs/audit/ASTROLOGY_REVIEW.md` is a code-grounded professional astrology audit. It produced 26 concrete issues (#541–#566) organized under 4 phase epics (#537 A, #538 B, #539 C, #540 D) under a master epic (#536). The audit's verdict: Astraya has a strong computational core but isn't yet trustworthy for professional use because (1) a viewed chart's calculation settings aren't reliably bound to it through save/share/export, (2) body/point visibility control is incomplete, and (3) the orb model is a single consumer preset, not a professional orb system. Phase A fixes those three plus two correctness bugs; Phases B–D add traditional, modern, and interchange/research capability on top of a now-trustworthy foundation.

The implementation goal: all 26 issues, optimizing for the shortest correct path to a fully-done final state. Intermediate breakage across stages is explicitly acceptable — `npm run check` and the full test suite only need to be clean at the very end, not after every stage.

Two research passes (calculation-engine architecture, UI/nav/timing-technique architecture) and one synthesis pass established the facts below; the key correction from the synthesis pass that should override anything implied by earlier conversation: **`src/chart/extended-settings.ts`'s `ExtendedSettings` + `src/ui/default-calculation-profile.ts` are already most of the way to the "calculation snapshot" the audit wants** — this is a promotion/wiring job, not a greenfield type.

## Key existing building blocks (reuse, don't rebuild)

- `src/domain/chart-compute.ts` — `ChartCalculationOptions`, `ChartData`, `computeChartData`/`computeChartDataAtJd`. Settings are a partial, silently-defaulted, per-call bag today; `ChartData` carries no record of what produced it ("nothing here is cached or stored," by design).
- `src/ephemeris/engine.ts` + `test/astrology-houses.test.ts` — polar-latitude failure handling already exists and is not new scope for this plan: when Swiss Ephemeris reports that a requested quadrant system is undefined and names Porphyry as its fallback, the engine recomputes with Porphyry, returns `houses.system: 'O'`, and carries a visible warning naming the requested system and latitude. Preserve this behavior and its north/south regression coverage; do not add a competing Whole Sign/Equal fallback.
- `src/chart/extended-settings.ts` (`ExtendedSettings`) + `src/ui/default-calculation-profile.ts` — the real precursor to a calculation snapshot; already has a `toChartCalculationOptions`-style conversion-function pattern worth extending rather than replacing.
- `src/astrology/aspects.ts` — `OrbConfig`/`orbFor()` already fully configurable; `isApplying()` uses correct instantaneous speed for real bodies but angles/lots use the broken constant `ANGLE_SPEED_DEG_PER_DAY` in `chart-compute.ts`.
- `chart-compute.ts`'s `findPointAspects()` — already correctly treats calculated points (angles, Fortune, Spirit) as passive receptors, matching aspects using the real body's own orb category rather than inventing a luminary-sized orb for the point itself, and already skips Fortune's/Spirit's `redundantLuminary` pairing so the same Sun–Moon geometry isn't double-scored. Preserve both conventions untouched when #542 (visibility/aspect-participation policy) and #546 (motion fix) touch this function — their scope is the orb-profile/visibility policy and the speed source respectively, not this receptor/redundancy model.
- Five dignity-table modules, all complete and correct: `rulership.ts`, `dignities.ts` (exaltation), `triplicity.ts`, `bounds.ts`, `decans.ts` (face). `dispositors.ts` has 2-body mutual reception only. `almuten.ts` has `almutenOf`/`almutenFigurisOf`, deliberately partial, and defaults safely to traditional rulership internally — the leak is at call sites (`pdf-export-plan.ts:340`), not in `almuten.ts` itself.
- `src/astrology/arabic-parts.ts` — `arabicPart()`/`sectReversingPart()` is the canonical, reusable day/night-swap lot idiom; module deliberately omits disputed lots rather than guess.
- `src/domain/chart-share.ts`'s `ChartShareData.settings` bag already exists for exactly this purpose but nothing writes a full snapshot into it or reads it back — `SharedChartView.tsx` recomputes from the _viewer's_ ambient `useRulershipChoice()` instead. Same ambient-only pattern in `full-export.ts` and `pdf-export-plan.ts`'s `PdfPlanContext`.
- `test/engine-harness.ts` (`getEngine()`, `arcsecondsBetween()`) — the mandatory real-ephemeris, no-mock test idiom for every new test in this plan.
- `src/chart/multi-wheel.ts` (`renderMultiWheelSvg`, `WheelRingInput`, `CrossRingAspects`) — already generalized to 1–3 concentric rings sharing one wheel-space anchor; the natural extension point for multi-wheel overlays, not a new renderer.
- `src/astrology/harmonics.ts` + `HarmonicView.tsx` — already a fully general `longitude·n mod 360` with free-form n input; "custom harmonic charts" is close to done, "aspect families" (grouping/filtering by harmonic family) is the actual new piece.
- `src/astrology/stations.ts`/`transit-events.ts` — the sample-then-bisect idiom to reuse for the new sign-ingress and lunation finders Phase D needs.
- `src/ui/chart-sections.ts` (`CHART_VIEWS`), `src/ui/person-nav.ts` (`PersonTabKey`/`PERSON_TABS`/`PERSON_TAB_FAMILIES`), `src/ui/feature-registry.ts` (`FEATURES`, with an exhaustiveness test) — the registration points for any new view/tab/nav destination. `FeatureScope: 'document'` already exists (used by `export-builder`) — "Documents" workspace is a stubbed destination, just needs nav surfacing, per `AppNav.tsx`'s own doc-comment TODO.
- `src/ui/PdfExportBuilder.tsx` + `pdf-export-plan.ts` (`buildPdfPlan`) — adding a new technique's PDF section is mechanical: one more `defaultXSectionOptions`, one more checkbox, one more `buildPdfPlan` case, reusing the technique's own exported table columns.
- Settings UI pattern: `xFeatureSetting.ts` (storage+hook) + `XSetting.tsx` + co-located `{en,nl}` `XSetting.messages.ts` → mounted in `PreferencesView.tsx` (device-scoped) or `ExtendedSettingsPanel.tsx` (chart-draft-scoped, staged "Apply and redraw") → registered in `settings-registry.ts`.
- Genuinely greenfield (no existing module to extend): zodiacal releasing, firdaria, horary judgment beyond "considerations" (significators/perfection/reception-in-judgment/translation/prohibition), sign-ingress finder, lunation finder, AAF/A93 interchange, relocated-natal workflow, custom-point expression parser, batch/research tooling, print-specific layout, consultation dashboard.

## Decisions to lock in before Stage 2 (do not start coding Phase A's policy/snapshot work until these are settled)

**(a) The persisted contract is a versioned input snapshot plus a result fingerprint.** Promote `ExtendedSettings`, but separate the display-ruler choice from the traditional calculation scheme. An orb profile reference alone is insufficient: a recipient cannot resolve a device-local custom profile, and changing a registry entry in place would change an old chart. Persist the exact effective, serializable rules with immutable identity/provenance:

```ts
interface CalculationSnapshotV1 {
  readonly version: 1;
  readonly houseSystem: HouseSystem; // requested system; ChartData.houses.system is effective
  readonly zodiac: Zodiac;
  readonly displayRulership: RulershipChoice;
  readonly traditionalSchemeId: CalculationSchemeId;
  readonly orbProfile: {
    readonly id: string;
    readonly revision: number;
    readonly contentHash: string;
    readonly rules: OrbRuleSet;
  };
  readonly lilithVariant: 'mean' | 'true' | 'interpolated';
  readonly nodeVariant: 'mean' | 'true';
  readonly objectPolicy: Readonly<Record<ObjectKey, ObjectParticipationPolicy>>;
  readonly customPoints: readonly CustomPointDefinition[];
  readonly engine: {
    readonly astrayaVersion: string;
    readonly swephWasmVersion: string;
    readonly ephemerisAssetHashes: Readonly<Record<string, string>>;
    readonly deltaTModel: string;
  };
}

interface ChartFingerprint {
  readonly algorithm: 'sha-256';
  readonly snapshotHash: string;
  readonly resultHash: string; // canonical positions, houses, aspects and point state
}
```

Attach required `snapshot` and `fingerprint` fields to `ChartData`, and define one canonical `ChartArtifactV1` serializer for `{ snapshot, fingerprint, result }`. Saved chart entities, shares, JSON, PDF metadata, backups, and derived-chart constructors consume that artifact or its snapshot; none may consult ambient settings after the original computation. `ExtendedSettings` remains the UI draft and converts once at the computation boundary. Canonical hashing must normalize map/object order and floating-point representation explicitly.

**(b) Scheme bundles (#549) are pure, immutable selectors, never a second computation path.** `CalculationScheme` must bind explicit rulership, exaltation, triplicity, bounds, face, sect, lot-family, orb-profile, reception, and Almuten-method identifiers plus citations. The five dignity modules and `reception.ts`/`almuten.ts` take resolved explicit parameters and never know a scheme exists; the scheme fills those parameters atomically. Built-in scheme/profile IDs are versioned and their definitions never change in place. `Custom` stores the complete effective selections, not only a badge. #547/#548/#551 land as parameterized functions before #549 wires them.

**(c) #565 Jyotish scope — recommended default: sidereal stays coordinate-only; no dasha/Varga/yoga system.** `ayanamsas.ts`/`nakshatras.ts` are already presentation-level, and `harmonics.ts`'s own doc comment already admits its Varga shortcut diverges from classical Parashari rules — the codebase has implicitly made this choice once already. Formalize it: a disclaimer in whatever view surfaces the sidereal/Jyotish choice, no new dasha engine. Flag for product confirmation before Stage 6, but nothing else in this plan depends on the alternative.

**(d) #554's unified timeline is a genuine new shared abstraction, built now, not deferred.** Define `TimingTimelineEvent { kind, startJd, endJd?, label, sourceModule }` in a new `src/domain/timing-timeline.ts`; give each of the 7 existing technique families (profections, returns, secondary/minor progressions, solar arc, primary directions, transits, periodic forecasts) one small `toTimelineEvents()` adapter—their dedicated views/computations do not change. Zodiacal releasing and firdaria are built directly against this shape since they have no prior shape to slot into.

**(e) Backward compatibility and performance have explicit acceptance gates, not assumed remedies.** The snapshot/default-profile reader must be a versioned parser/normalizer that fills newly introduced keys from documented legacy defaults; a structurally non-null `settings` object is not sufficient validation. Unknown future versions fail clearly rather than being coerced. For the aspect matrix, measure synchronous input-shaping + SVG-generation + DOM-commit separately from asynchronous ephemeris recomputation. The current matrix is one generated SVG, not a React component per cell, so cell virtualization is not an applicable default remedy. In a production Chromium build, after warm-up and with every supported body/point enabled, 30 consecutive point-toggle redraws must have no long task over 50 ms and the matrix-only portion must meet a 16 ms p95 budget. If it misses, first stabilize/memoize `chartSheetInput` and selection callbacks; change the renderer only with profiler evidence.

**(f) Finite-difference motion has one defined numerical convention.** Sample the same requested zodiac, location, house-system policy, and formula convention at `t` and `t + Δt`; use circular unwrapping before division and verify the derivative by the issue's forward-distance acceptance test. For Fortune/Spirit, hold the chart's selected day/night formula branch fixed across the infinitesimal sample so a sunrise/sunset branch switch is not misread as physical velocity; at the exact sect boundary, return an explicit indeterminate applying/separating state rather than a fabricated rate. Pin `Δt` with convergence tests, and cover wraparound, high latitude, Vertex-sensitive geometry, and a near-stationary aspecting body.

## Dependency graph (precedence only; see Stage list below for the parallelizable groups)

```
#545, #546  (independent correctness fixes)       ─┐
#542 ⟂ #543 (object policy and orb-rule engine)   ─┼─ Phase A
          #542 + #543 → #541 → #544               ─┘
        │
        ▼
#547 ⟂ #548 ⟂ #551   (condition / reception / Almuten — parallel, each needs #543 + #545)
        │
        ▼
#549 (scheme bundles consume #547+#548+#551)
        │
        ├──▶ #550 (lots catalogue, scheme-aware labelling)
        └──▶ #554 (timeline + releasing + firdaria, needs #549 and benefits from #553)
#553 (primary directions expansion) — only needs #546, independent of #547-551
#552 (horary judgment) — needs #546 (applying/separating) + #547 + #548

Phase C: #542 + #543 → #555 (active-set midpoints and their orb rules)
         #541 → #559 (relocated chart with an attributable snapshot)
         #541 + #559 → #558 (multi-wheel last; each ring has its own snapshot)
         #556 and #557 are independent tracks after #541 captures their active state/provenance
         #560 (modern points opt-in) only needs #542, runs any time after it

Phase D: #541 → #561 (schema literally serializes the snapshot)
         #543 → #562 (needs new ingress/lunation finders first, reproducible via orb profile)
         #559 + #558 → #563 (dashboard/Documents surfaces relocation + overlays)
         #564 (print) last — must cover the final set of views
         #565 resolved early (decision only, doesn't block code)
         #566 needs #541 + #542 + #543 for persistence, visibility and aspect participation
```

## Staged build order

**Stage 0 — Lock decisions (a)–(f) above.**

**Stage 1 — Phase A bugfixes (#545, #546).** Cheapest, most load-bearing fixes; do first.

- #545: introduce an explicit traditional-scoring configuration consumed by essential dignity, reception, `almuten.ts`, chart tables, interpretations, and PDF/export call sites; the display-rulership preference must never enter that API. Fix `pdf-export-plan.ts:340` and the `chart-compute.ts:321` dignity-map path, not only the Almuten call site. Phase B's scheme bundle later supplies this configuration without another scoring rewrite. Test that toggling `modern`/`both` display rulers leaves every traditional dignity and Almuten result byte-identical.
- #546: add the finite-difference point sampler defined in decision (f); replace `ANGLE_SPEED_DEG_PER_DAY` for Ascendant/MC/Vertex/Fortune/Spirit and allow an explicit indeterminate state at a sect discontinuity. Scope is the motion source only—preserve `findPointAspects()`'s passive-receptor orb and `redundantLuminary` suppression. The acceptance test checks decreasing/increasing forward distance on both sides of a near-exact contact near a planetary station.

**Stage 2 — Phase A policy primitives: orb rules (#543) and object participation (#542), in parallel.**

- #543: replace `OrbConfig` with `resolveOrb(context, aspect, objectA, objectB, applyingState, profile)`, returning maximum orb plus rule provenance. Ship immutable `astraya-standard-v1`, one cited traditional-moiety profile, one modern per-aspect profile, and custom profiles. Profile snapshots include effective rules so a custom profile works in a fresh browser and built-in corrections require a new revision/ID. Fold `TRANSIT_ORB_CONFIG` into context-aware rules.
- #542: define the complete body/angle/lot/custom-point universe once. Each `ObjectParticipationPolicy` explicitly controls computation where optional, wheel, position table, matrix, aspect list, aspect participation, and interpretation. Presets fill the complete map; divergence displays `Custom`. Provide both an atomic "off everywhere" action (the GitHub acceptance criterion) and advanced independent surface controls; no hidden asteroid may keep aspecting.
- Run decision (e)'s production-browser matrix profile with Ascendant, MC, Vertex, Fortune, Spirit, Chiron, Lilith, Nodes, asteroids, and every supported body enabled. Record fixture, browser/build, p50/p95, and long-task count; optimize only if the gate fails.

**Stage 3 — Calculation snapshot/provenance (#541) + independent parity tests (#544).**

- Add `src/domain/calculation-snapshot.ts`, canonical artifact serialization, and deterministic SHA-256 hashing per decision (a). Capture effective settings plus app/engine/assets/delta-T provenance when computation starts; add the canonical result hash when it completes.
- Wire the snapshot/artifact into the saved chart entity and actual save/reload store path, `chart-compute.ts`, every derived-chart constructor, `chart-share.ts`, `SharedChartView.tsx`, `full-export.ts`, `pdf-export-plan.ts`, backups, CSV metadata, and printed provenance. Remove ambient `useRulershipChoice()`/default reads from consumers of an existing chart.
- Add one canonical `parseCalculationSnapshot()`/normalizer for save/share/import/default-profile reads. Reject invalid enum/range/hash values and unknown future versions; migrate absent/unversioned legacy fields to one explicitly labelled `legacy-defaults-assumed-v1` snapshot. Preserve unknown opaque share fields only outside the validated calculation contract.
- `test/calculation-snapshot-parity.test.ts` starts from one Whole Sign, Sidereal (Lahiri), true-node, custom-orb chart and tests each path independently: live→save→reload, live→share→fresh-browser view, live→JSON, live→PDF metadata, and live→backup/restore. Every path must reproduce the same snapshot hash, result hash, positions, houses, aspects, applying/separating state, displayed objects, requested/effective house systems, and warning state.
- Add fixtures for an unversioned legacy default and payloads missing each newly introduced field; assert deterministic migration, never typed `undefined`. Re-run the parity suite unchanged at the end of Stage 6.

**Stage 4 — Phase B, in dependency order.**

1. #547 condition table — new `src/domain/planetary-condition.ts` + `PlanetaryConditionView.tsx`, covering all required dignity, sect, phase, direct/retrograde/stationary speed, angularity, hayz/halb, combustion/cazimi, and besiegement factors. Every cell exposes the resolved rule/method citation; a cited known chart fixture verifies the whole row set.
2. #548 reception engine — new `src/astrology/reception.ts` extending beyond `dispositors.ts`'s 2-body case, covering domicile, exaltation, triplicity, bound, and face; mutual, mixed, and aspect-linked reception; and cited known-chart fixtures. The five existing dignity tables remain the sole positional source of truth.
3. #551 Almuten Figuris — extend `almuten.ts` across the complete standard point set and all five dignity types using one explicitly cited historical scoring table. Return the per-candidate score breakdown and citation, not only the winner, and verify against a published worked example.
4. #549 scheme bundles — new `src/domain/calculation-scheme.ts` per decision (b), atomically resolving every historical subsystem required by the issue. Ship materially distinct Hellenistic, Medieval-Arabic, and Renaissance-Lilly bundles plus Custom; selecting a bundle replaces all owned draft values and any divergence becomes Custom.
5. #550 lots catalogue — extend `arabic-parts.ts` with source-labelled lots through the existing arithmetic idiom; scheme-aware sets consume #549. Each lot definition carries structured `dayFormula`, `nightFormula`, `reversesBySect`, authority, source, and locator fields. Fortune and Spirit state operand order explicitly so natal sect reversal cannot be silently reused for a horary or author-specific fixed formula. UI and exports display this metadata. Existing corpus prose is immutable and is neither rewritten nor regenerated for this work.
6. #552 horary judgment — new `src/domain/horary-judgment.ts` + `src/astrology/horary-judgment.ts` on top of existing `horary.ts`, covering significator selection, aspect/reception perfection, translation, collection, prohibition, frustration, refranation, and degrees-to-perfect timing. #546 and #548 are load-bearing. Verify the complete judgment trace against a cited worked horary example rather than asserting only a final verdict.
7. #553 primary directions expansion — add converse directions, actual in-mundo calculation, explicit Placidus/Regiomontanus school selection where applicable, and configurable promissor/significator sets. Each mode carries method provenance and matches a cited calculation.
8. #554 timeline + zodiacal releasing + firdaria — new `zodiacal-releasing.ts`, `firdaria.ts`, and `timing-timeline.ts` per decision (d). Adapt profections, returns, secondary/minor progressions, solar arc, primary directions, transits, and periodic forecasts to the shared axis. The UI must show at least three enabled techniques simultaneously; releasing/firdaria each get cited reference fixtures.

**Stage 5 — Phase C, three parallel tracks.**

- Track 1: #556 expose the existing 90° dial, antiscia, and declination features consistently in settings, wheel/diagram, tables, JSON, and PDF, with enabled state in the snapshot and no per-surface reconfiguration. #557 keep arbitrary `longitude·n mod 360` as the shared engine, add aspect-family grouping/filtering, and label the harmonic number plus radix snapshot on every UI/export surface; verify positions against a cited harmonic example.
- Track 2: #555 compute direct and indirect/far midpoints for every #542-enabled object pair, with configurable #543 orb rules, 45°/90°/360° sorting, list and midpoint-tree views, and a cited stack fixture. In parallel, #559 adds saved alternate-location selection, recomputes only houses/angles at the unchanged birth instant, stores both natal/relocated snapshots, and provides the required side-by-side angles/houses comparison against a cited reference. Then #558 extends the existing 1–3-ring renderer only as necessary for independently addable/removable/reorderable natal, transit, progressed, directed, return, and relocated rings; every ring shows its own snapshot attribution and optional inter-ring aspects. A natal+transit+progressed triwheel is the minimum acceptance case—more than three rings is not itself a requirement.
- Track 3: #560 extends #542 with independent Chiron, each Lilith convention, Vertex, Eris, and other modern-point opt-ins. Add any genuinely missing body definition (including Eris) before exposing its toggle, and show mean/true/orbital-element convention and data source in UI/export metadata.

**Stage 6 — Phase D.**

1. #565 — execute decision (c): relabel sidereal as a coordinate choice, remove/qualify Jyotish/Vedic implications (including any approximate Varga naming), and state clearly that dashas/yogas/classical Vargas are not implemented.
2. #566 — new `src/domain/custom-point.ts` with a restrictive recursive-descent expression parser (no `eval`/`Function`), normalized dependency graph, cycle/depth/size limits, name collision rules, and algebraic/semantic duplicate detection against built-ins. Persist definitions in the snapshot and route results through #542/#543 so they appear correctly in wheel, tables, aspects, shares, and exports. This does not create or rewrite interpretation corpus prose.
3. #561 — publish `src/domain/interchange/astraya-schema-v1.ts` and a checked-in JSON Schema with compatibility policy, changelog discipline, validation tests, and snapshot/fingerprint fields. Research authoritative AAF/A93 specifications and licensing before deciding whether those adapters can ship; the documented Astraya schema satisfies the issue even if an external format cannot be implemented safely.
4. #562 — add sign-ingress, lunation, and exact-aspect finders alongside the existing station machinery, using the established sample-then-bisect pattern. Build date-range/filter input, navigable results, cancellation/progress, and reproducible CSV whose metadata includes every search parameter, snapshot/profile identity, engine provenance, time scale, and range boundary convention—not only the orb profile.
5. #563 — promote `AppNav.tsx`'s PDF link into a primary Documents destination and add `ConsultationDashboardView.tsx` plus `ChartSetupEditorView.tsx`. The editor must edit the exact snapshot draft consumed by Stage 3; all three destinations are primary-navigation reachable and reuse existing chart/technique components rather than recomputing through separate defaults.
6. #564 — fixed print compositions for wheel, matrix, tables, and documents; grayscale-safe patterns/text, deliberate page-break boundaries, no split atomic chart/table element, and snapshot/fingerprint provenance footer on every printed page. Validate a representative multi-page document in Chromium PDF and grayscale output. Sequence last so it covers every final view.

## Testing strategy

- Pure dignity/reception/lots/scheme logic does not need new ephemeris-position goldens, but it does require cited worked-example fixtures because #547, #548, #550, and #551 explicitly promise agreement with a named reference. Store the source/locator and every intermediate rule/score expected, not only the final winner/value.
- New reference-value tests are required for derived positions/timings: #546 finite-difference motion and forward-distance classification (including wrap, polar sensitivity, sect boundary, and a station); #552 complete horary trace; #553 converse/in-mundo directions; #554 releasing/firdaria periods; #555 midpoint/far-point stacks; #557 harmonic positions; #559 relocated angles/houses; and #562 stations/ingresses/lunations/exact aspects at known UTC instants.
- All new tests use `test/engine-harness.ts`'s `getEngine()`/`arcsecondsBetween()` idiom — no mocking, per CLAUDE.md.
- Unit-test every new pure `.ts` module directly: `reception.ts`, `zodiacal-releasing.ts`, `firdaria.ts`, `sign-ingress.ts`, `lunations.ts`, `horary-judgment.ts`, `aspect-families.ts`. The #566 expression parser additionally needs adversarial tests (malformed/injection-shaped/deeply-nested input) proving it's not an `eval` in disguise.
- Keep `test/astrology-houses.test.ts`'s north/south Placidus/Koch→Porphyry cases in the final gate and add snapshot/export coverage proving both the requested and effective house systems are represented without losing the warning. High-latitude primary-directions failures remain explicit errors; they are not made valid by the natal-house fallback.
- Add snapshot parser/migration/canonical-hash fixtures and the independent save/share/JSON/PDF/backup parity paths from Stage 3. PDF tests assert machine-readable fingerprint metadata and visible provenance rather than attempting to hash layout bytes.
- Run the production-browser matrix profile specified in decision (e) and Stage 2. The 16 ms budget applies only to synchronous matrix work, not real ephemeris calculation.
- Existing interpretation corpus prose is frozen. New UI labels, method names, formula displays, warnings, and citations live in co-located `{en,nl}` message/catalogue metadata and must pass locale parity; do not rewrite or regenerate corpus entries.
- `npm run check` and the full suite only need to be clean at the very end of Stage 6 (per the explicit instruction) — not gated per stage.

## Branching strategy

Given heavy intra-phase code dependencies (e.g. #544 needs #541's type to literally exist; #552 needs #546's bugfix to be correct; #549 imports #547/#548/#551's exports), 26 independent branches off `main` would mostly fail to compile until manually rebased anyway. Instead:

- One long-lived integration branch per phase (`epic/537-phase-a` → `epic/538-phase-b` → `epic/539-phase-c` → `epic/540-phase-d`), each branched from the **previous phase's branch tip** (not from `main`), since later phases need earlier phases' real code, not a merged release.
- Within a phase, independent issues (per the dependency graph) branch directly off that phase's integration branch and merge back in parallel; strictly-dependent issues stack directly on top of the branch they depend on (e.g. `fix/544-fingerprint-parity` branches off `fix/541-calculation-snapshot`, not off the phase branch) rather than waiting for an intermediate merge.
- Commit messages use `type(scope): subject` with scope = the specific issue number being worked, even when stacked on another issue's branch, so `git log` stays attributable regardless of branch topology.
- Final merge: `epic/540-phase-d` → `main` only once Stage 6 and the final `npm run check` + re-run of `calculation-snapshot-parity.test.ts` are both green.
