# Astraya Professional Astrology Review

**Audit date:** October 25, 2026  
**Version reviewed:** `0.42.12` (`0072d54`)  
**Scope:** Current TypeScript calculation, ephemeris, export/provenance, test, and practitioner-facing UI paths. This is a source-and-test audit, not a comparative hands-on study of third-party products or a substitute for practitioners validating every technique against their own authorities.

## 1. Executive Summary

Astraya is an unusually mature astrology application technically. Its calculation architecture has the right foundations for serious work: Swiss Ephemeris is contained behind an explicit `EphemerisProvider` boundary; calculations are represented as reproducible, versioned snapshots and artifacts; house-system failure is surfaced rather than concealed; and the code distinguishes a requested house system from the system that was actually computed. It is substantially more rigorous than the typical web-chart generator.

The application is **ready for serious natal, return, transit, progression, solar-arc, relocation, astrocartography, harmonic, and selected traditional consultation workflows**, provided the practitioner reviews the displayed settings and treats its default-orb policy as an Astraya convention rather than universal doctrine. It is **not yet fully professional-complete** for a practitioner whose method requires strict passive-receptor point orbs, a calculation-profile-consistent primary-directions workflow, comprehensive horary, a broad fixed-star/minor-body catalogue, or multiple historical primary-direction schools.

The most important calculation defect is narrow but real: when a user activates a per-body moiety orb profile, aspects to Ascendant, MC, Vertex, Fortune, and Spirit do not derive their allowance from the aspecting planet’s configured body orb. They silently fall back to a generic aspect tier. That conflicts with both the UI’s professional promise of per-body orbs and the calculation module’s own statement that point aspects use planet orbs. It should be fixed before presenting custom moiety profiles as exact point-aspect methodology.

The second material issue is reproducibility rather than spherical-trigonometry correctness: the primary-directions screen deliberately recomputes its natal basis with engine defaults (tropical Placidus/default rulers) instead of the practitioner’s confirmed calculation snapshot. Its artifact labels those defaults. This prevents a professional from maintaining one coherent house/zodiac/object/orb policy across the rest of a client file and primary directions.

### Audit evidence and validation

- Code paths reviewed include `src/astrology/`, `src/domain/chart-compute.ts`, `src/ephemeris/engine.ts`, calculation snapshots/artifacts, exports, the chart workspace, and the timing-technique screens.
- Focused astrology tests passed: **8 files / 199 tests** covering aspects, orb rules, point/matrix handling, Paulus lots, houses, primary directions, snapshots, and PDF planning.
- `npm run check` passed formatting, lint, and typecheck, then reached the full Vitest suite. In this sandbox, **3,829 tests passed and 118 failed** because the runner was denied the `tsx` IPC socket and loopback listener (`listen EPERM`); server/UI tests consequently cascaded. This is an environment limitation, not evidence that those 118 behaviours are defective. A host-capability rerun was requested but could not be authorized because the approval service returned HTTP 403 before executing it.

## 2. Computational & Astrological Correctness Audit

### 2.1 Ephemeris authority, provenance, and reproducibility — **Strong**

- Production numerical work is correctly delegated to Swiss Ephemeris through `EphemerisProvider`; the architecture prevents ordinary application code from importing `sweph-wasm` directly. `src/ephemeris/engine.ts` normalizes actual engine outputs and throws named ephemeris errors instead of manufacturing replacements.
- A chart’s settings, rulership choice, and custom points are represented by a versioned `CalculationSnapshot`; calculation artifacts capture inputs and result fingerprints. `src/domain/calculation-snapshot.ts:123`–`134` turns a snapshot into the actual `computeChartData` options, rather than retaining settings merely as a display annotation.
- The parser validates registered house systems, aspect keys, ayanamsas, orb scales, rules, and object policies. External strict decoding is distinct from repair-oriented legacy parsing. This is a sound model for shares, imports, PDFs, and later verification.
- PDF chart sections now obtain the same calculation options and visibility policy used by the live chart (`src/ui/pdf-export-plan.ts:472`–`497`, `572`–`580`, `1211`–`1231`). This avoids a common professional failure where a printout looks authoritative but was silently recalculated with defaults.

**Verdict:** The calculation/provenance model is professional-grade and should be retained as a non-negotiable design boundary.

### 2.2 Aspects, orbs, applying/separating — **Strong core; one high-priority point-orb defect**

#### What is correct

- Major aspects plus semisextile, semisquare, quintile, square, trine, sesquiquadrate, biquintile, quincunx, and opposition are explicitly registered in `src/astrology/aspects.ts:42`–`54`; minor aspects are opt-in rather than silently mixed into every chart.
- The engine records the **effective allowed orb** on every matched aspect, including profile, override, body-moiety, and scale effects (`src/astrology/aspects.ts:217`–`231`). Subsequent salience/ranking can therefore use the actual rule that admitted the contact.
- Applying/separating is not inferred from static distance. `isApplying()` uses signed separation and each position’s instantaneous longitude speed (`src/astrology/aspects.ts:198`–`215`). Cross-chart static references are deliberately given zero speed, preventing natal-at-birth motion from contaminating transit/progression direction (`src/astrology/aspects.ts:287`–`304`).
- Angles and calculated points receive finite-difference rates calculated from a later ephemeris sample rather than a generic sidereal constant (`src/domain/chart-compute.ts:514`–`574`). This is especially important for the Vertex and for lots whose motion is not identical to the Ascendant’s.
- Redundancy is handled intelligently. Fortune/Spirit suppress the one luminary aspect that merely repeats the Ascendant-to-luminary geometry, and point-to-point aspect spam is not generated (`src/domain/chart-compute.ts:319`–`361`, `553`–`574`). This directly addresses a common misleading “extra aspect” problem.

#### Finding C1 — per-body moiety profiles do not govern point aspects — **High**

`OrbConfig.bodyOrbs` is documented as a professional per-body moiety system: if both bodies are known, their moieties are added (`src/astrology/aspects.ts:119`–`129`, `141`–`178`). Yet `findPointAspects()` constructs each point with a synthetic ID such as `asc` or `partOfFortune` and calls the ordinary pair matcher (`src/domain/chart-compute.ts:340`–`360`). Since those point IDs are not registered bodies, `matchAspect()` cannot provide two known body keys to `orbFor()` (`src/astrology/aspects.ts:240`–`258`), so `bodyOrbs` is skipped and the generic aspect tier is used.

This means a user can select a cited/custom body-moiety profile and receive:

- correct planet-to-planet moiety sums;
- generic-tier planet-to-Ascendant/MC/Vertex/Fortune/Spirit aspects;
- no explicit indication that a different rule has been applied.

The normal default tiers remain internally consistent enough for routine work, and per-aspect overrides still apply. The fault occurs when the app advertises a per-body system and a practitioner expects a passive point to derive its allowance from the aspecting planet.

**Required correction:** define and document one explicit point-orb convention for each profile (for example, an aspecting body’s full orb, its moiety, or a dedicated point rule), then implement a point-aware orb resolver rather than routing synthetic point IDs through two-body moiety logic. Add real-Swiss regression cases for Ascendant, MC, Vertex, Fortune, and Spirit under a body-moiety profile, including a contact that differs from the generic tier.

#### Default orb policy — **Usable but not universal**

The shipped generic default is 7°/10° for major aspects, 4°/5°30′ for sextiles, and 2°30′ for all enabled minors (`src/astrology/aspects.ts:105`–`138`). The module candidly states these are Astraya defaults, not a verified published authority. That transparency is good; the numbers themselves are not “wrong,” because orb doctrine is school- and purpose-dependent.

However, a serious practitioner should not be led to believe that these defaults are a neutral professional standard. Astraya already has versioned cited Lilly presets and named calculation schemes. The application should make the active source/convention as visually prominent as the active house system and zodiac, and require a conscious choice when entering a traditional workflow.

### 2.3 Lots, sect, and day/night formulas — **Correct and responsibly scoped**

- Fortune and Spirit use the correct sect reversal: Fortune is Asc + Moon − Sun by day and Asc + Sun − Moon by night; Spirit is the inverse (`src/astrology/arabic-parts.ts:44`–`68`).
- The lot implementation is not limited to a vague “Arabic Parts” checkbox. It explicitly models Paulus’s seven Hermetic lots, records formula/source metadata, and avoids silently mixing other authors’ variants (`src/astrology/arabic-parts.ts:1`–`29`).
- Sect, solar phase, cazimi, combustion, and under-the-beams are discrete domain logic rather than presentation-only labels.

**Professional qualification:** different historical authors use different lots and formula variants. Astraya’s refusal to invent a blended formula is correct. The next requirement is a source-labelled lot catalogue and an explicit UI choice when an alternative tradition is genuinely supported; it must never overwrite the current Paulus meaning under the same label.

### 2.4 House systems and difficult latitudes — **Excellent**

- The selectable registry covers the systems serious Western practitioners expect, including Placidus, Koch, Regiomontanus, Campanus, Equal, Whole Sign, Porphyry, Alcabitius, Morinus, Gauquelin sectors, and additional Swiss Ephemeris systems (`src/astrology/houses.ts:41`–`66`).
- Placidus and Koch failure at polar latitudes is handled honestly. On the documented Swiss Ephemeris failure, the engine recomputes using Porphyry, sets `houses.system` to the effective system, and emits a latitude-specific warning (`src/ephemeris/engine.ts:355`–`445`). Real-engine tests cover both northern and southern cases (`test/astrology-houses.test.ts:74`–`119`).
- The Horizon system receives a separate geometric-winding check and is rejected when it degenerates rather than being rendered as a false chart (`src/ephemeris/engine.ts:401`–`420`).

**Verdict:** This is the right professional behavior. A silent Whole Sign/Equal substitution would be less honest. The remaining UX requirement is to make the **effective** house system unmissable on every wheel, table, share page, and export—not merely place the warning in a transient status surface.

### 2.5 Primary directions — **Mathematics credible; workflow incomplete**

The primary-directions engine is not a superficial solar-arc substitute. It implements direct/converse, zodiacal/in-mundo, Placidus semi-arc methodology, and Naibod/Ptolemy keys with published worked-example tests described in `src/astrology/primary-directions.ts:1`–`53`. It correctly refuses polar/circumpolar conditions rather than calculating partial nonsense.

#### Finding C2 — primary directions ignore the practitioner’s current calculation snapshot — **High**

`generatePrimaryDirections()` computes the natal basis with a hard-coded Placidus-house option (`src/domain/primary-directions.ts:232`–`246`). The UI openly creates an `ENGINE_DEFAULTS_SNAPSHOT` (`src/ui/PrimaryDirectionsView.tsx:84`–`85`) and passes it into the artifact while generating directions without the person’s active settings (`src/ui/PrimaryDirectionsView.tsx:187`–`195`). The module header likewise states that it does not yet take a user-configurable calculation snapshot (`src/ui/PrimaryDirectionsView.tsx:17`–`20`).

For a Placidus/tropical practitioner this is coherent. For a user whose client record is sidereal, Regiomontanus, Whole Sign, uses a selected node/Lilith model, or has a documented object policy, it creates a consultation record with two incompatible calculation bases. A provenance footer saying “engine defaults” is honest but does not make the workflow professionally adequate.

**Required correction:** make `CalculationSnapshot` (or a deliberately constrained, source-labelled primary-directions profile) an explicit input to primary directions and artifacts. If the technique is intentionally Placidus/tropical only, lock and explain that method before calculation, label it in the navigation and export title, and prevent a misleading “same chart settings” expectation.

### 2.6 Accuracy verdict

No systemic ephemeris, lot-reversal, applying/separating, or high-latitude fabrication error was found in the reviewed code. The calculation core is trustworthy **within its stated conventions**. C1 and C2 are important because they create convention drift precisely in advanced workflows where a professional relies on settings being exact.

## 3. Pillar Analysis (Strengths vs. Weaknesses)

### Strengths

1. **A genuine numerical-authority boundary.** Swiss Ephemeris is not casually scattered through React components; the app has a replaceable provider boundary, real-engine tests, typed positions/speeds, and calculation artifacts.
2. **Reproducible chart identity.** Snapshots, custom-point definitions, hashes, requested/effective conditions, and export-oriented provenance give Astraya an advantage over chart sites that cannot explain how an old result was made.
3. **Astrologically literate aspect handling.** Configurable minor aspects, cited/profiled orbs, actual speed-vector applying/separating, finite-difference point motion, and redundancy suppression are all above normal web-app practice.
4. **High-latitude integrity.** Correctly warning and changing to the actual Porphyry result is safer than false quadrant cusps and stronger than silently substituting a preferred system.
5. **Broad, coherent technique coverage.** The application includes traditional dignities, bounds, faces, triplicities, sect, reception, condition, lots, almutens, annual profections, firdaria, returns, progressions, solar arcs, primary directions, harmonics, draconic charts, relocated charts, astrocartography/Local Space, fixed stars, declinations, midpoints, and custom formula points.
6. **Object and aspect control.** Settings unify visibility, aspect participation, and interpretation eligibility. Practitioners can control nodes, Lilith variants, Chiron, Vertex, Fortune, Spirit, midpoint views, minor aspects, and orb rules rather than accepting a one-size-fits-all chart.
7. **Working data products.** AAF’97 import/export and structured full exports exist; PDF calculation sections reuse live chart settings instead of producing a decorative but different chart.
8. **Accessible alternatives to graphics.** The aspect matrix supports keyboard activation, and the data tables are the accessible path to information represented by the `aria-hidden` SVG wheel.

### Weaknesses

1. **C1: point orbs lose custom body-moiety semantics.** This is the clearest professional calculation flaw in the current review. It affects advanced settings, not ordinary defaults, but should not be deferred indefinitely.
2. **C2: primary directions use defaults rather than the active client profile.** The technique is mathematically serious but operationally siloed.
3. **Default orb authority is weak.** Astraya acknowledges that its generic default resembles software practice rather than a named source. That is acceptable only if the UI treats it as a house convention, not hidden doctrine.
4. **Horary is partial by design.** `src/astrology/horary.ts` implements four Lilly “considerations before judgment” and explicitly states that other judgment requirements depend on the actual question (`src/astrology/horary.ts:42`–`105`). There is no evidence in the reviewed paths of a full horary judgement workspace: significators/turned houses, perfection, translation and collection of light, prohibition/frustration, reception in judgement, antiscia policy, planetary-hour/radicality conventions, or a source-labelled rule-set chooser.
5. **Fixed-star policy is deliberately narrow.** Natal calculations list only seven prominent stars—Regulus, Spica, Algol, Aldebaran, Antares, Fomalhaut, and Sirius (`src/domain/chart-compute.ts:60`–`74`). This is a defensible default, but not sufficient for fixed-star specialists without a searchable, sourced, user-configurable catalogue and explicit parans/precession policy.
6. **Primary directions remain one school.** Placidus semi-arc directions are a respectable choice, but a professional directions suite needs an explicit scope statement and eventually configurable historical schools/key policies rather than appearing universally complete.
7. **Live-wheel efficiency is mouse/touch-led.** The inspector explicitly describes itself as a mouse/touch enhancement on an `aria-hidden` wheel (`src/ui/SelectionInspector.tsx:26`–`29`). Matrix cells and tables are keyboard accessible, but a live consultation benefits from direct keyboard traversal and shortcuts for bodies, aspects, filters, print/export, and clearing isolation.
8. **Density is practitioner-managed rather than intelligently profiled.** The object-policy controls are powerful, but the review found no demonstrated automatic “consultation,” “traditional,” “modern,” and “research” display-density profiles that preserve legibility at 15+ objects and many aspect lines. The UI should prove this with visual and task-time acceptance tests rather than rely on a large settings card.

### UI and visual-ergonomics verdict

The chart workspace is substantially better organized than a simple static wheel. It provides wheel, aspects, matrix, elements, placements, and patterns views (`src/ui/chart-sections.ts:23`–`34`), click-to-isolate, an inspector, and a keyboard-operable aspect matrix. This makes dense charts tractable.

It does **not** yet prove the requested “under three seconds” consultation scan. That is a measurable usability claim, not a source-code property. The application needs scripted expert tasks at desktop and laptop widths, with maximum-density charts, to measure: (1) identifying the Big Three and chart ruler, (2) finding an exact applying major aspect, (3) checking dignity/condition, and (4) changing to a saved display/orb profile without losing context.

## 4. Professional Feature Gap Analysis

### Priority 0 — block “exact custom methodology” claims

1. **Point-orb resolver for passive receptors.** Correct C1, make the convention visible, preserve it in snapshots/artifacts/PDF/AAF metadata, and add regression tests.
2. **Primary-directions calculation profile.** Correct C2 or clearly isolate and label a mandatory Placidus/tropical directions profile. Artifacts must record all effective settings.
3. **Effective-house-system visibility everywhere.** Show `requested → effective` prominently in live charts, shares, print/PDF, and exports whenever Swiss Ephemeris requires a fallback.

### Priority 1 — essential for broad professional adoption

4. **Saved named consultation profiles.** Provide first-class, versioned display/calculation presets: for example Traditional/Hellenistic, Medieval/Horary, Modern Psychological, Cosmobiology, and Research. Each must declare bodies, point participation, aspect set, orb authority, house system, rulers, bounds, lots, interpretation exclusions, and export identity. Do not mutate prose corpus content to encode these policies.
5. **Full horary workspace.** Build it as a question-specific, source-labelled technique rather than extending a generic natal chart with a few warnings. Include question time/place provenance, significator selection, turned-house navigation, perfection/translation/collection/prohibition/reception judgments, applying/separating conventions, and a judgment audit trail.
6. **Directions expansion with explicit schools.** Add historical/school options only when each is sourced, tested with published examples, named in artifacts, and differentiated in the UI. Do not present Placidus semi-arc results as generic “primary directions.”
7. **Fixed-star and minor-body policy.** Permit user-managed, source-tagged catalogues with precession/epoch, ecliptic versus equatorial/paran method, orb policy, and calculation source. Keep the seven-star default as a restrained preset.
8. **External interchange verification.** Retain AAF and full JSON, then add documented round-trip fixtures against representative external AAF/A93 producers and a stable calculation-artifact JSON schema. Exports should always state zodiac/ayanamsa, house system requested/effective, coordinates/altitude, time-zone resolution, ephemeris asset/version, orb profile revision, and custom-point formulas.

### Priority 2 — high-value enhancements

9. **Visual density profiles and matrix scale controls.** Create an automatic “consultation” view that prioritizes luminaries/angles/chart ruler/tight applying aspects, alongside an unfiltered research view. Add a persistent density warning or decluttering recommendation when object/aspect counts exceed an empirically tested limit.
10. **Keyboard-first consultation workflow.** Provide documented shortcuts and focus order for chart selection, next/previous aspect, filtering, table-to-wheel synchronization, print, and clearing isolation. Preserve the current data-table accessibility path.
11. **Technique parity matrix.** Publish a per-technique table that tells practitioners which settings apply, which are locked, what objects participate, whether aspects are recomputed, how applying/separating is defined, and what is included in exports/PDF. This avoids silent configuration drift.
12. **More tradition-specific lots and timing.** Add only author-labelled formulas, variants, and citations. Candidates include family lots and author-specific Eros/Necessity variants; do not replace the current Paulus definitions under existing labels.
13. **Expanded Vedic scope only as a separate declared system.** The existing D1/D9/D10 support is not a substitute for a complete Jyotish workstation. Any expansion needs ayanamsa, varga, dignity, dashā, aspect, and house conventions designed as a coherent, cited package.

## 5. Actionable Recommendations

### Critical Fixes

1. **Implement `orbForPoint` (or equivalent).**
   - Input: aspect key, aspecting body key/category, point key, effective orb profile, and explicit point-orb convention.
   - Output: effective allowed orb plus machine-readable provenance of why it was chosen.
   - Replace the synthetic-point two-body path in `findPointAspects()`.
   - Test ordinary defaults, cited Lilly profiles, custom body moieties, per-aspect override precedence, Fortune/Spirit suppression, and applying/separating with finite-difference point speed.
   - Acceptance criterion: a point-aspect result must never silently fall back from a selected body profile to generic tiers.

2. **Thread a calculation snapshot through primary directions.**
   - Pass active settings/rulership/custom points to the natal basis where the technique can meaningfully honor them.
   - Lock Placidus/tropical only when mathematically required, explain the lock before calculation, and record `requested`/`effective` values in the artifact.
   - Acceptance criterion: a primary-directions artifact can be independently recomputed from its recorded inputs and cannot be mistaken for a user’s incompatible natal profile.

3. **Surface effective fallback state.**
   - Render a persistent, printable “Requested Placidus; computed Porphyry at 70° latitude” banner whenever `houses.warning` is set.
   - Include it in shared charts, PDF headings, AAF/full-export extension metadata, and verification output.
   - Acceptance criterion: no export can display a requested system label alone when the engine used another system.

### Enhancements

4. **Promote source-labelled orb/scheme choice into the consultation header.** Display profile name, revision, authority or “Astraya convention,” scale, and minor-aspect set beside zodiac/house system. The user should not need to reopen settings to know what was used.

5. **Build profile-driven decluttering.** Start with four opt-in profiles and test chart legibility against defined maximum objects/aspects. Preserve user overrides and record the effective display profile in print/export metadata.

6. **Build the horary module as a complete workflow.** Define its scope from authorities first, then create worked-chart fixtures for each judgment rule. Keep uncertain/question-dependent doctrine visible as practitioner input rather than automated certainty.

7. **Add expert interaction tests.** Use keyboard and pointer E2E tests for matrix/wheel/table synchronization, dense-chart opening, fallback warnings, profile changes, and PDF parity. Add timed usability sessions with working astrologers for the four core consultation tasks.

### Future Roadmaps

8. **Expand primary directions by named school, not feature checklist.** Separate Placidus semi-arc, Regiomontanus, and other systems into separately cited/tested modes with worked-reference charts and clear eligibility rules.

9. **Create a sourced research catalogue layer.** Fixed stars, minor bodies, lots, and specialty points should be enabled through versioned catalogues with authorship, epoch, formula, orb, and provenance—not hardcoded incrementally into generic chart tables.

10. **Publish interoperability and reproducibility documentation.** Document the AAF/full-JSON schemas, artifact verification workflow, ephemeris assets/date range, error treatment, and a compatibility matrix for import/export fields.

## Final Professional Verdict

Astraya should be regarded as an advanced astrology application with a serious computational conscience, not as a casual chart generator. Its strongest differentiators are numerical provenance, finite-motion aspect logic, lot/sect discipline, robust house-system handling, reproducible artifacts, and unusually broad integrated technique coverage.

It can support professional practice now when the practitioner operates within its documented methods. It should not yet claim universal professional completeness. Resolve C1 and C2, make default conventions and effective fallbacks impossible to miss, and grow horary/directions/catalogue coverage through named authorities and worked-reference tests. That path will preserve the application’s existing rigor instead of diluting it with feature-count inflation.
