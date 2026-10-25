# Astraya Professional Astrology Audit

**Audit date:** 2026-10-19  
**Audited revision:** `138344e` (`main`, application version `0.42.2`)  
**Perspective:** Traditional Western (Hellenistic, Medieval, Renaissance and horary), modern Western (psychological and evolutionary), cosmobiology, and professional astrological software practice  
**Evidence labels:** **Confirmed** means directly established in current source or tests; **Qualified** means implemented with a disclosed limitation; **Missing** means no professional-grade implementation was found.

## 1. Executive Summary

Astraya is no longer a rudimentary chart calculator. Its numerical foundation and breadth are unusually strong for a browser application: Swiss Ephemeris is isolated behind a provider boundary; unsupported ephemeris dates are refused instead of silently degraded; point aspects use body-side orbs and sampled motion; Fortune and Spirit reverse correctly by sect; polar house failures produce an explicit Porphyry fallback; custom orb rules, object policies, traditional condition tables, modern derived charts, AAF interchange, and versioned JSON artifacts all exist.

The application is nevertheless **not yet fully reliable as a professional end-to-end instrument**. The principal risk is no longer raw longitude accuracy. It is semantic drift between calculation, display, interpretation, sharing, and PDF output. Four confirmed defects are adoption blockers for practitioners who depend on exact configuration fidelity:

1. The calculation-snapshot parser defines a version validator but does not call it, and also accepts unbounded ayanamsa and orb-scale numbers. A future or malformed snapshot can therefore be silently reinterpreted as the current schema (`src/domain/calculation-snapshot.ts:64-70`, `src/domain/calculation-snapshot.ts:137-142`, `src/domain/calculation-snapshot.ts:263-268`, `src/domain/calculation-snapshot.ts:288-305`).
2. Wheel and table visibility rules deliberately do not govern interpretation. Hidden bodies or aspects can still influence the report (`src/domain/chart-tables.ts:118-131`, `src/interpretation/rules.ts:172-208`, `src/interpretation/rules.ts:227-278`).
3. Interpretation salience measures aspect tightness against `DEFAULT_ORB_CONFIG`, not the effective custom/profile orb that produced the aspect. This can reorder a report under custom or body-moiety rules (`src/interpretation/rules.ts:227-245`).
4. PDF chart sections calculate with effective settings but render with empty visibility options, while PDF interpretation recomputes a separate default chart using only the rulership choice. A single PDF can therefore disagree with the on-screen chart and with itself (`src/ui/pdf-export-plan.ts:439-477`, `src/ui/pdf-export-plan.ts:540-556`, `src/ui/pdf-export-plan.ts:1154-1178`).

**Professional-readiness verdict:** suitable for research, advanced personal work, and supervised professional use; not yet suitable for unattended client deliverables or archival calculations until configuration equivalence across screen, report, save/share, and export is enforced by tests.

**Immutable-corpus boundary:** the interpretation prose is not itself defective merely because formulas or calculation conventions are absent from it. The corpus is treated here as immutable. Formula identity, sect rule, authority, orb/profile revision, object policy, requested/effective house system, engine/assets/tzdb identity, warnings, and hashes belong in structured calculation metadata, visible UI provenance, and exports. No recommendation in this audit requires rewriting corpus prose.

## 2. Computational & Astrological Correctness Audit

### 2.1 Numerical authority and ephemeris integrity

**Confirmed strength.** All astronomical calculation is routed through the `EphemerisProvider` boundary, with `sweph-wasm` confined to `src/ephemeris/`. The engine refuses dates outside the shipped 1800-2399 ephemeris assets rather than allowing Swiss Ephemeris to fall back silently to reduced-accuracy theory (`src/ephemeris/engine.ts:671-687`). This is the correct professional posture: a hard, disclosed range is preferable to an undocumented precision change.

The calculation artifact records the effective rules and reproducibility inputs, canonically hashes them with SHA-256, records asset and tzdb identity plus requested/effective house system, and supports recomputation verification (`src/domain/calculation-artifact.ts:86-168`, `src/domain/calculation-artifact.ts:170-249`, `src/domain/calculation-artifact.ts:272-369`). Full export carries settings, custom points, effective chart data, and the artifact (`src/domain/full-export.ts:114-159`, `src/domain/full-export.ts:250-319`). Share links carry the snapshot and custom points (`src/ui/ChartView.tsx:1628-1656`; `src/ui/SharedChartView.tsx:60-108`). This is close to best-in-class provenance architecture.

**Confirmed defect — strictness at the trust boundary.** `validateSnapshotVersion()` exists but `parseCalculationSnapshot()` never invokes it. The parser reconstructs a current-version object from any record. It also accepts any numeric sidereal ayanamsa and any numeric orb scale, including non-finite or nonsensical values (`src/domain/calculation-snapshot.ts:64-70`, `src/domain/calculation-snapshot.ts:137-142`, `src/domain/calculation-snapshot.ts:263-268`, `src/domain/calculation-snapshot.ts:288-305`). A hash is only meaningful if the input schema is interpreted under the version that created it.

**Required professional rule:** imported, shared, or restored calculation snapshots must use a strict, version-dispatched decoder. Unsupported future versions must be refused, not defaulted. Legacy migration must be explicit and testable.

### 2.2 Orb mechanics, passive points, and redundancy suppression

**Confirmed strength.** Angles, Vertex, Fortune, and Spirit are treated as point-to-body receptors rather than bodies with invented independent moieties. Points never aspect one another. The effective orb comes from the body side, including luminary treatment (`src/domain/chart-compute.ts:263-305`). This is mathematically and astrologically defensible.

**Confirmed strength.** The engine suppresses the lot/luminary aspect that merely duplicates the corresponding Ascendant/luminary relation: the redundant luminary is identified when the Fortune and Spirit formulas are built and skipped in point-aspect generation (`src/domain/chart-compute.ts:452-519`). It avoids presenting algebraic identity as a second independent testimony.

**Confirmed strength.** Orb profiles are not limited to a global percentage. The engine supports per-aspect overrides and body moieties (`src/astrology/aspects.ts:88-178`; `src/chart/extended-settings.ts:34-184`). This is materially more useful than the fixed presets found in many consumer products.

**Confirmed defect — interpretation salience.** Aspects are calculated under the effective configuration, but report ranking normalizes tightness with `DEFAULT_ORB_CONFIG` (`src/interpretation/rules.ts:227-245`). This can cause an aspect admitted under a narrow or wide custom rule to receive the wrong relative importance. The report should use the aspect's effective allowance captured at computation time, or derive salience from a versioned effective-orb context.

### 2.3 Applying and separating motion

**Confirmed strength.** Body-body applying/separating state uses relative longitude speed, not static angular separation (`src/astrology/aspects.ts:198-215`). Angles and lots receive one-minute finite-difference motion sampled from their actual later positions; circular unwrapping handles the 0°/360° seam (`src/domain/chart-compute.ts:458-519`; `src/ephemeris/finite-difference.ts:17-52`). This directly addresses a common weakness in web astrology software.

**Qualification.** Applying/separating remains an ecliptic-longitude aspect model. That is appropriate for ordinary zodiacal aspects, but it should not be described as a universal mundane, primary-direction, or in-mundo contact model.

### 2.4 Lots and day/night formula precision

**Confirmed strength.** Fortune is `Asc + Moon - Sun` by day and `Asc + Sun - Moon` by night; Spirit is the mirror formula. The reversal is centralized in a sect-aware function (`src/astrology/arabic-parts.ts:35-63`). Structured metadata provides day and night formulas, reversal behavior, authority, and source note (`src/astrology/arabic-parts.ts:66-106`). This is exactly where such conventions belong.

**Qualified breadth.** Only Fortune and Spirit are provided as built-in lots. This is honest and safer than shipping an uncited catalogue because formula traditions differ. A professional expansion should add source-labelled formula definitions—possibly user-selectable by authority—without changing the immutable interpretation corpus.

### 2.5 House systems and high latitudes

**Confirmed strength.** The registry covers the requested professional systems, including Placidus, Whole Sign, Koch, Regiomontanus, Equal, Campanus, Porphyry, and additional Swiss Ephemeris systems (`src/astrology/houses.ts:42-67`). For known polar failures, the engine catches the Swiss Ephemeris result, recomputes with Porphyry, records the effective system, and attaches a warning. Unknown failures are not swallowed (`src/ephemeris/engine.ts:355-445`). Horizon-house degeneracy is detected geometrically and refused rather than rendered as a plausible chart (`src/ephemeris/engine.ts:401-419`).

This is professionally responsible behavior. The remaining requirement is consistency: every surface must display both requested and effective house system plus the warning. The artifact already has the data; the PDF/report equivalence defect prevents confidence that every output faithfully exposes it.

### 2.6 Traditional astrology

**Confirmed strengths.** The implementation includes sect; domicile, exaltation, detriment, fall, triplicity, bounds, and faces; Egyptian and Ptolemaic bounds; Dorothean/Lilly triplicity options; reception; planetary condition; and almuten calculations. Essential-dignity scoring is deliberately traditional even when the display rulership preference is modern (`src/domain/chart-tables.ts:445-482`). That separation is correct: a modern display preference must not rewrite a historical dignity doctrine.

**Qualified — Almuten Figuris.** The current model covers the principal positional dignity inputs but omits planetary-hour and prenatal-syzygy bonuses (`src/astrology/almuten.ts:32-42`). It should be labelled as an almuten/essential-dignity computation, not a complete universal Almuten Figuris doctrine.

**Qualified — accidental condition.** Stationary status is triggered only at exact zero speed rather than by a configurable station window, and besiegement does not model benefic intervention/rescue (`src/astrology/planetary-condition.ts:73-85`, `src/astrology/planetary-condition.ts:109-124`). These are meaningful for horary and electional judgement.

**Qualified — horary.** The app supplies significators, receptions, prohibitions, translation/collection concepts, timing, and judgement aids, but some testimony and timing logic is explicitly simplified in `src/domain/horary-judgment.ts`. It is a decision-support tool, not a substitute for practitioner judgement. The UI should consistently say so and reveal the rule that produced each testimony.

### 2.7 Modern, midpoint, and derived-chart practice

**Confirmed strengths.** The body model includes outer planets, Chiron, node variants, Lilith variants, and asteroids (`src/astrology/bodies.ts:41-62`). Per-object visibility and aspect participation are independently configurable (`src/chart/object-policy.ts:23-130`). The wider application includes harmonics, draconic charts, returns, transits, progressions, solar arc, primary directions, synastry, composite, relocated charts, astrocartography/local-space facilities, horary/electional tools, rectification, and timing timelines.

**Qualified — fixed stars.** Natal enrichment intentionally exposes seven stars—Regulus, Spica, Algol, Aldebaran, Antares, Fomalhaut, and Sirius—rather than the full Swiss catalogue (`src/domain/chart-compute.ts:55-69`). This is useful but not a full fixed-star workbench. Professionals need searchable catalogue selection, magnitude/orb policy, precession/proper-motion provenance where applicable, and user-defined lists.

**Qualified — aspect patterns.** The detector covers stellium, grand trine, T-square, grand cross, yod, cradle, and mystic rectangle, but not Kite; its scope is the ten planets from Sun through Pluto (`src/astrology/aspect-patterns.ts:23-55`). The omission is disclosed, but pattern users should be able to select participating points and a documented Kite definition.

**Qualified — harmonics/Varga.** General harmonic charts are coherent, and D9 is documented as matching the classical Parashari result. D10 deliberately uses continuous `longitude × 10 mod 360` rather than the classical odd/even sign restart (`src/astrology/harmonics.ts:20-29`, `src/astrology/harmonics.ts:112-127`). The UI discloses this (`src/ui/HarmonicView.tsx:183`). That is acceptable only if exports preserve the qualification and ordinary natal-report prose is not presented as though it were a dedicated Varga interpretation.

**Qualified — cosmobiology.** Midpoint trees and a 90° dial provide a real foundation, but a complete Uranian/cosmobiological environment would also need planetary-picture searching, configurable midpoint structures, and optional hypothetical points with explicit school/provenance. It should be a named future module, not implied by midpoint support alone.

### 2.8 Interpretation and immutable prose

The corpus prose is accepted as fixed content. The engineering question is whether the application selects and contextualizes that prose faithfully.

**Confirmed defect — hidden objects still speak.** The chart-table policy explicitly states that interpretation does not consult object visibility (`src/domain/chart-tables.ts:118-131`). `derivePlacements()` and aspect selection read the full chart arrays (`src/interpretation/rules.ts:172-208`, `src/interpretation/rules.ts:227-278`), and `ReportView` supplies chart and rulership rather than the effective object policy (`src/ui/ReportView.tsx:430-471`). Consequently, a practitioner can hide or disable an object on the chart yet still receive prose based on it.

There are two legitimate product semantics, but they must not be mixed:

- **Display-only visibility:** hiding declutters the wheel but the report clearly states it still interprets the full calculation set.
- **Interpretation participation:** an independent toggle controls whether an object/aspect may select prose.

Astraya already distinguishes display and aspect participation in object policy. It should add or explicitly define interpretation participation rather than silently coupling it to neither.

### 2.9 Export, sharing, and reproducibility

**Confirmed strengths.** Astraya provides documented, versioned native JSON and AAF birth-record interchange (`docs/domain/EXPORT_SCHEMA.md:4-12`; `docs/domain/AAF_INTERCHANGE.md:1-5`). It should not be criticized as lacking interchange wholesale. The calculation artifact and full export are particularly strong foundations.

**Confirmed defect — PDF visibility drift.** A PDF chart section computes with effective settings and custom points, but calls `chartSheetInput` and `tablesOf` with empty/default visibility options (`src/ui/pdf-export-plan.ts:439-477`, `src/ui/pdf-export-plan.ts:540-556`). Objects hidden on screen can reappear in the deliverable.

**Confirmed defect — PDF calculation drift.** The interpretation section independently recomputes the natal chart with `{ rulership }` only (`src/ui/pdf-export-plan.ts:1154-1178`). It omits the selected house system, zodiac/ayanamsa, orb configuration, node/Lilith choices, object policies, and custom points. The chart pages and prose in the same PDF can therefore describe different charts.

For professional work, export must consume one already-resolved calculation artifact and one effective presentation/interpretation policy. Recomputing loosely from a person record is unacceptable.

### 2.10 UX, visual ergonomics, and consultation workflow

**Confirmed strengths.** The chart workbench places an inspector adjacent to the wheel and adapts responsively (`src/ui/ChartView.tsx:2124-2152`; `src/ui/app.css:2132-2158`). The aspect matrix scales cells to available width and drops orb labels when cells become too small (`src/chart/aspect-matrix.ts:21-30`, `src/chart/aspect-matrix.ts:101-176`). Exact values remain available in tables. These are thoughtful clutter-management measures.

**Qualified limitation.** With every body, point, and minor aspect enabled, scaling preserves containment but not rapid comprehension. Fixed small typography and the absence of virtualization, focus isolation, or an alternate dense/list mode make the all-enabled matrix intrinsically cramped (`src/ui/app.css:2874-2902`). The wheel likewise manages but cannot eliminate overload. Professional defaults should present a restrained core set and make layers easy to reveal temporarily.

**Confirmed information-architecture drift.** The implementation plan defines a four-view chart contract, while the current registry exposes six peer views: wheel, aspects, matrix, elements, placements, and patterns (`src/ui/chart-sections.ts:30-34`). All six are useful, but peer-level fragmentation works against the under-three-second scanning goal. Aspects/matrix and placements/elements can be consolidated as modes within fewer stable destinations.

**Consultation readiness.** The adjacent inspector and table views are good, but a live practitioner workflow still needs stronger keyboard traversal, saved workspace presets, one-action focus/isolation, and a compact consultation mode in which placements, dignity/condition, and exact aspects remain simultaneously scannable.

## 3. Pillar Analysis — Strengths vs. Weaknesses

### Strengths

| Area                 | Professional value                                                                          | Evidence status           |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------- |
| Numerical authority  | Swiss Ephemeris boundary, explicit 1800-2399 asset range, no silent low-precision fallback  | **Confirmed**             |
| Point aspects        | Body-side/luminary-aware orbs, point-to-body only, redundant lot identity suppressed        | **Confirmed**             |
| Motion               | Relative body speeds and finite-difference motion for angles/lots                           | **Confirmed**             |
| Lots                 | Correct sect reversal for Fortune and Spirit plus structured formula/authority metadata     | **Confirmed**             |
| Houses               | Broad system support, explicit Porphyry fallback, effective-system warning, Horizon refusal | **Confirmed**             |
| Traditional practice | Dignities, sect, reception, condition, bounds/faces/triplicities, almuten foundation        | **Confirmed / qualified** |
| Modern practice      | Object policies, outer bodies, custom orbs/moieties, derived charts and timing techniques   | **Confirmed**             |
| Reproducibility      | Canonical artifact, provenance, hashes, share/full-export carriage, verification path       | **Confirmed**             |
| Interchange          | Versioned native JSON and AAF people import/export                                          | **Confirmed**             |
| UI foundation        | Responsive workbench, adjacent inspector, matrix adaptation, exact-value tables             | **Confirmed**             |

Compared with browser-first tools such as Astro-Seek, Astraya's strongest differentiator is not the number of techniques but the attempt to make conventions and reproducibility explicit. Compared with Solar Fire, Astraya remains less mature in high-density workflow, report/export equivalence, specialist fixed-star/Uranian tooling, and decades of practitioner-tested defaults.

### Weaknesses

| Severity            | Weakness                                                                   | Practitioner consequence                                                           |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Critical**        | Snapshot version and numeric bounds are not strictly decoded               | A restored/shared future payload may be silently interpreted under the wrong rules |
| **Critical**        | PDF interpretation recomputes with incomplete settings                     | Client prose and chart can refer to different zodiac, houses, points, or aspects   |
| **High**            | PDF wheel/tables ignore effective visibility                               | Hidden or excluded objects can reappear in a deliverable                           |
| **High**            | Interpretation ignores object policy                                       | The report can contradict the visible chart and practitioner intent                |
| **High**            | Aspect salience uses default rather than effective orb                     | Custom orb profiles can change report ordering incorrectly                         |
| **Medium**          | Six peer chart views diverge from the four-view contract                   | Consultation scanning and navigation are less coherent than designed               |
| **Medium**          | Dense all-enabled wheel/matrix degrades rapidly                            | 15+ object practice becomes slower and more error-prone                            |
| **Medium**          | Almuten, accidental condition, horary judgement remain doctrinally partial | Traditional practitioners must independently verify advanced testimonies           |
| **Medium**          | Fixed-star list and cosmobiology suite are selective                       | Specialist practitioners cannot replace dedicated software                         |
| **Low / disclosed** | Kite absent; D10 simplified                                                | Feature claims require qualification, not concealment                              |

## 4. Professional Feature Gap Analysis

### Priority 0 — Trust and equivalence gates

1. **Strict versioned snapshot decoding.** Reject unsupported versions; validate finite/ranged orb scales; validate ayanamsa against a registry or a documented bounded custom mode; migrate known older versions explicitly.
2. **One calculation artifact per professional document.** Chart, tables, overview, report, and metadata must all consume the same resolved artifact. No section may independently recompute from defaults.
3. **One explicit policy model.** Keep calculation participation, display visibility, and interpretation participation distinct, named, persisted, and shown to the user.
4. **Effective-orb-aware interpretation.** Persist each aspect's admitted allowance or pass the effective orb rules into salience scoring.

Until these are complete, Astraya should show a “configuration verified” indicator only where artifact equivalence has actually been checked.

### Priority 1 — Professional workflow essentials

1. **Consultation workspace presets:** traditional, modern, cosmobiology, relationship, horary, and user-defined presets that govern views, columns, layers, orb profile, and interpretation participation.
2. **Dense-chart focus tools:** isolate selected body, hide non-contacting bodies, aspect-family filters, keyboard next/previous contact, searchable table, and split wheel/table consultation layout.
3. **Traditional completion:** documented station windows, benefic rescue in besiegement, configurable doctrine bundles, fuller Almuten Figuris inputs, and source-visible horary timing/testimony rules.
4. **Fixed-star workbench:** searchable Swiss catalogue, named lists, magnitude and orb policies, conjunction/paran distinction, and exported provenance.
5. **Dedicated technique reports:** harmonic/Varga, primary directions, horary, and derived charts should not silently reuse natal interpretive assumptions without a conspicuous technique qualification.
6. **Regression parity matrix:** tropical/sidereal, true/mean node, each Lilith model, custom points, custom moieties, polar fallback, hidden objects, and derived charts across screen, save, share, restore, PDF, and JSON.

### Priority 2 — Specialist expansion

1. Source-labelled additional lots with authority-specific formula sets.
2. Full Uranian planetary pictures, optional hypothetical points, configurable 90°/45° dials, and midpoint-tree searches.
3. User-configurable aspect-pattern participation and a documented Kite definition.
4. Relocation/return comparison dashboards, profection-return-transit synthesis, and technique-specific timeline overlays.
5. Expanded professional export: machine-readable calculation artifact attached to every PDF, plus an importable chart package that round-trips presentation and interpretation policies as well as numerical data.

### Adoption blockers by practitioner type

| Practitioner                     | Current fit                  | Blocking gap                                                                  |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| General natal / psychological    | Strong with supervision      | Interpretation and PDF can diverge from visible/custom settings               |
| Traditional natal                | Strong foundation            | Advanced condition/Almuten doctrine remains partial                           |
| Horary / electional              | Useful decision support      | Simplified testimony/timing and incomplete accidental-condition nuance        |
| Predictive / timing              | Broad feature coverage       | Cross-technique output equivalence and dedicated interpretation qualification |
| Cosmobiologist / Uranian         | Partial                      | No complete planetary-picture/hypothetical-point environment                  |
| Fixed-star specialist            | Partial                      | Seven-star natal subset is insufficient                                       |
| Client-report-heavy professional | Not ready for unattended use | PDF can disagree internally and with the screen                               |

## 5. Actionable Recommendations

### Critical Fixes

#### 1. Make snapshots strict and version-dispatched

- Call `validateSnapshotVersion()` before parsing settings.
- Return a typed decode error for unsupported versions instead of rebuilding defaults.
- Require `Number.isFinite` and an explicit supported range for `orbScalePercent`.
- Resolve sidereal modes through the canonical ayanamsa registry; if custom numeric ayanamsa is a product feature, represent it as a distinct tagged mode with documented bounds.
- Add adversarial tests for `version: 999`, `NaN`, `Infinity`, negative and extreme scales, unknown houses, unknown minor aspects, and unknown ayanamsas.

**Acceptance criterion:** no untrusted snapshot can change version, zodiac, house system, orb rules, or object policy through silent coercion. Every supported legacy version either migrates deterministically or fails with a user-visible reason.

#### 2. Eliminate PDF recomputation and visibility drift

- Build or receive one `CalculationArtifact` and resolved `ChartData` before assembling sections.
- Pass effective object visibility to `chartSheetInput`, all table builders, and report selection.
- Remove `computeChartData(person.moment, provider, { rulership })` from the interpretation builder.
- Print requested/effective house system, zodiac/ayanamsa, node/Lilith mode, orb-profile identity/revision, warnings, engine/assets/tzdb identity, snapshot hash, and result hash in a compact provenance appendix.

**Acceptance criterion:** for a Whole Sign, Sidereal (Lahiri), true-node chart with a hidden outer planet, a custom point, and custom moieties, screen/share/restored view/PDF/JSON must have identical positions, houses, aspects, applying state, visible objects, interpretation inputs, and artifact hashes.

#### 3. Define interpretation participation explicitly

- Add an `interpretation` participation dimension or publish display-only semantics in the policy model.
- Pass that policy into `assembleReport`/placement derivation.
- Filter both placement keys and aspect candidates before salience ranking.
- Show a compact “Report includes …” summary so the practitioner can verify scope.

**Acceptance criterion:** hiding an object never changes interpretation unless the UI explicitly says visibility controls interpretation; disabling interpretation participation always removes that object's placements and contacts from report selection, with tests for bodies, angles, lots, and custom points.

#### 4. Rank aspects with their effective allowance

- Capture `maxOrb` or a normalized tightness value on each computed aspect, or evaluate salience through the effective versioned orb config.
- Do not look up `DEFAULT_ORB_CONFIG` when the aspect was admitted by another rule set.

**Acceptance criterion:** changing a per-aspect orb or body moiety produces deterministic, mathematically correct salience ordering, and the ranking survives save/share/export unchanged.

### Enhancements

#### 5. Restore a coherent four-destination chart workbench

- Keep **Wheel**, **Tables**, **Analysis**, and **Patterns** as stable destinations.
- Make placements/elements modes within Tables or Analysis; make aspect list/matrix modes within one Aspects surface.
- Preserve direct links and keyboard shortcuts to each mode.
- Add a consultation preset with wheel, key placements/conditions, and exact aspects visible together.

**Acceptance criterion:** a practitioner can reach any placement, dignity, or exact aspect in one action from the wheel and can switch list/matrix without losing selection or inspector context.

#### 6. Add genuine dense-chart controls

- Provide selected-body isolation, “contacts to selection,” major/minor family filters, and object-group toggles.
- Use a scrollable/virtualized matrix or a split exact-contact list below a defined minimum cell size; never solve density only by shrinking type.
- Persist user workspace presets independently from calculation settings.

**Acceptance criterion:** with 20 objects and all supported aspects enabled at 1280 px and 768 px widths, labels remain readable, exact orbs are reachable by keyboard, and selection persists across wheel/list/matrix.

#### 7. Complete and qualify traditional modules

- Add configurable station windows based on speed relative to body norms and imminent station time.
- Add benefic intervention/rescue to besiegement and expose the chosen definition.
- Expand Almuten Figuris only through cited, switchable doctrine inputs.
- For horary, surface rule-by-rule evidence, confidence/qualification, and the method used for timing.

**Acceptance criterion:** every traditional judgement states its doctrine bundle and source identity; switching bundles changes only the intended rules and is captured in the artifact.

#### 8. Make specialist limitations impossible to miss

- Label the fixed-star feature as a seven-star natal subset.
- Keep the D10 non-classical continuous rule adjacent to the selector and in exports.
- Label pattern detection as ten-planet scope with no Kite.
- Mark natal-style prose shown for derived/harmonic charts as a transformed-chart reading rather than technique-specific doctrine.

### Future Roadmaps

#### 9. Specialist catalogues as data, not prose changes

Create structured, versioned registries for additional lots, fixed-star sets, hypothetical points, planetary pictures, doctrine bundles, and orb authorities. Each entry should carry stable ID, label, formula/rule, authority, source reference, revision, applicability, and locale-neutral machine fields. The immutable prose remains untouched.

#### 10. Practitioner-grade validation programme

- Retain the non-waivable Swiss/NASA numerical gates.
- Add external-oracle research fixtures for selected charts without making another engine the production authority.
- Publish a calculation conformance document with tolerances, ephemeris range, time/calendar handling, house fallback behavior, and known doctrinal choices.
- Recruit separate traditional, modern, horary, cosmobiology, and accessibility reviewers; do not treat one school's approval as universal.

**Release gate:** no professional-readiness claim until the complete parity matrix passes in a permitted environment and at least one real exported client document has been manually checked against its on-screen artifact.

### Validation note for this audit

`npm run check` passed in a permitted environment: formatting, lint, type-check, and all 3,641 tests across 318 files completed successfully. An earlier restricted run denied local IPv4/IPv6 listeners and `tsx` IPC sockets; the clean permitted rerun confirms those failures were sandbox effects rather than application failures.

---

**Bottom line:** Astraya's engine is computationally serious and in several areas unusually transparent. Its next milestone should not be more technique count. It should be proof that one exact chart contract—rules, objects, visibility, interpretation participation, provenance, and hashes—survives every user-facing path without drift.

eof
