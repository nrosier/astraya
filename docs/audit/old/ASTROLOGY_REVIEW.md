# Astraya Professional Astrology Audit

**Audit date:** 12 October 2026  
**Perspective:** Traditional Western (Hellenistic, Medieval, Renaissance, horary) and modern Western (psychological, evolutionary, midpoint/cosmobiological) practice  
**Scope:** Calculation engines, ephemeris boundary, time handling, chart composition, settings, wheel/matrix/table UI, advanced techniques, sharing, and exports

## 1. Executive Summary

### Verdict

Astraya has a notably serious computational foundation. Its Swiss Ephemeris integration, explicit data-file verification, refusal to use silent reduced-accuracy fallbacks, civil-time handling, broad house-system support, sect-correct Fortune/Spirit formulas, independent positional golden tests, and clean separation between pure astrological logic and UI code are all stronger than one normally finds in an early-stage astrology application. The code repeatedly chooses an explicit warning or refusal over a plausible-looking but untrustworthy chart. That is the correct professional instinct.

It is **not yet ready to replace a professional desktop workflow such as Solar Fire or AstroGold, nor to serve as a reproducible alternative to Astro-Seek**, for three decisive reasons:

1. A viewed chart's effective calculation settings are not reliably bound to the chart, share link, or export. A recipient or exported report can therefore show a different chart from the one the practitioner inspected.
2. Body and point control is incomplete. A normal chart computes and displays a crowded 17-body set, including four asteroids, without per-body visibility and aspect participation controls.
3. The orb model is a useful consumer preset, not a professional orb system. It cannot express planetary moieties, per-body or per-aspect orbs, different natal/transit/synastry rules, or distinct applying/separating allowances.

These are not cosmetic gaps. They affect repeatability, visual judgment, and the astrologer's ability to state exactly what rules produced a conclusion. Until they are corrected, Astraya should be presented as a **high-quality advanced beta/research workbench**, not as a chart authority for client records, published reports, or collaborative case work.

### Readiness by area

| Area                                           | Assessment                                          | Professional consequence                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ephemeris and ordinary planetary positions     | **Strong**                                          | Suitable within the declared 1800–2399 range, subject to the validation caveat below.                                     |
| Civil time, timezone, calendar, and provenance | **Excellent**                                       | Handles several common causes of historically wrong charts better than many consumer tools.                               |
| Houses and high latitudes                      | **Strong, transparent**                             | Broad selection and explicit fallback behavior; the practitioner can see when the requested geometry failed.              |
| Sect, Fortune, Spirit, and point redundancy    | **Strong core**                                     | Traditional day/night reversals and the principal redundant lot contact are correctly handled.                            |
| Applying/separating                            | **Strong for planets; qualified for angles/Vertex** | Planetary contacts use motion; angle and Vertex classifications use a fixed diurnal approximation.                        |
| Essential dignity                              | **Good foundation, incomplete practice model**      | Useful tables exist, but accidental dignity, full reception, and coherent traditional defaults are not complete.          |
| Modern bodies and techniques                   | **Broad but unevenly surfaced**                     | Many engines exist; body toggles, midpoint tooling, overlays, and workflow consistency lag behind.                        |
| Wheel, inspector, and tables                   | **Good interaction design**                         | Collision spreading and accessible tables are valuable, but default density and mobile matrix legibility remain problems. |
| Sharing/export reproducibility                 | **Critical failure**                                | The same named chart can be recalculated with different settings. This blocks professional reliance.                      |
| Overall professional readiness                 | **Not yet production-authoritative**                | Fix reproducibility, body control, and orb profiles before claiming professional equivalence.                             |

### Audit method and validation boundary

This is a code-grounded audit, not a review of marketing copy. Findings were traced through the ephemeris adapter, pure astrology modules, domain composition, UI settings, wheel/table renderers, sharing/export paths, and tests. The application contains unusually broad functionality, so the distinction between **calculation code that exists**, **functionality exposed in the UI**, and **functionality preserved in saved/shared output** is maintained throughout this report.

`npm run test` was attempted in the provided restricted environment. It reported 2,894 of 3,006 tests passing across 245 of 256 files. The 112 failures were associated with environment-denied listeners or IPC (`listen EPERM` on loopback/IPv6 or the `tsx` IPC path), not failed astrological assertions. Relevant astrology and golden-position suites were among the passing tests. These environment failures must be rerun in a permitted CI/runtime before release; they are not counted here as product defects.

## 2. Computational & Astrological Correctness Audit

### 2.1 Ephemeris source, range, and positional integrity

**Assessment: strong.**

- The application pins the Swiss Ephemeris/WASM assets by byte size and SHA-256 rather than trusting an upstream filename (`src/ephemeris/assets.ts:1-15`).
- Initialization verifies that every expected ephemeris file actually reached the WASM filesystem. A partial load aborts rather than allowing Swiss Ephemeris to fall back silently to Moshier theory (`src/ephemeris/engine.ts:210-230`).
- The shipped data range is explicitly limited to 1800–2399. Requests outside it throw instead of returning lower-precision results (`src/ephemeris/engine.ts:671-687`; `test/golden-chart.test.ts:146-157`).
- The golden suite compares ordinary-body longitude against independent JPL Horizons values at a demanding 0.2 arcsecond historical tolerance; future and asteroid tolerances are separately justified (`test/golden-chart.test.ts:60-75`). This is a meaningful independent check, not merely a self-comparison against Swiss Ephemeris output.

**Professional judgment:** This is one of Astraya's best qualities. The application makes its supported range and degradation boundary explicit. A future release should expose the engine version, asset hashes, delta-T model/version, zodiac/ayanamsa, and topocentric/geocentric mode in every export so this rigor is visible outside the source tree.

### 2.2 Civil time, calendar, and location handling

**Assessment: excellent.**

The resolver retains provenance and alternatives instead of flattening an uncertain historical time into one falsely certain UTC instant. It supports explicit offset override, automatic Julian/Gregorian selection, Local Mean Time before standard time, timezone-boundary warnings, nonexistent spring-forward times, and ambiguous fall-back times (`src/time/resolve.ts:1-18`, `src/time/resolve.ts:37-71`, `src/time/resolve.ts:74-156`). It also stores a timezone-database fingerprint.

This matters astrologically: a one-hour error can change the Ascendant by roughly a sign, alter house cusps, switch sect near sunrise/sunset, and reverse time-sensitive lots or lots' house positions. Surfacing uncertainty is preferable to silently choosing the first timezone answer.

**Remaining requirement:** Share, JSON, CSV/PDF, and printed chart metadata should include the resolved offset, offset provenance, timezone identifier, tzdb fingerprint, calendar, coordinates, and warnings. Correct internal resolution is insufficient if the exported chart cannot be independently reconstructed.

### 2.3 House systems and high-latitude behavior

**Assessment: strong and unusually broad.**

The canonical list includes Equal, Alcabitius, Campanus, Horizon, Koch, Morinus, Porphyry, Placidus, Regiomontanus, Whole Sign, and numerous specialist systems (`src/astrology/houses.ts:42-67`). This comfortably meets the requested Placidus/Whole Sign/Koch/Regiomontanus/Equal/Campanus baseline.

At polar latitudes, a recognized Swiss Ephemeris failure is explicitly recomputed in Porphyry, with the requested and effective systems distinguished and a warning retained (`src/ephemeris/engine.ts:355-386`). The adapter also rejects malformed/missing cusp values and detects a geometrically degenerate Horizon result rather than rendering it (`src/ephemeris/engine.ts:388-419`).

**Professional judgment:** The fallback policy is defensible only because it is explicit. The UI and every export must show **“Requested Placidus; calculated Porphyry because Placidus was undefined at this latitude”** with equal visual prominence. A fallback chart must never be labelled simply “Placidus.” Whole Sign and Equal should be proactively offered when the requested quadrant system is undefined.

### 2.4 Sect and day/night formulas

**Assessment: correct for the implemented lots.**

Fortune uses Ascendant + Moon − Sun by day and Ascendant + Sun − Moon by night. Spirit reverses those operands. The reversal is centralized rather than duplicated (`src/astrology/arabic-parts.ts:34-62`). That is the standard traditional convention requested in this audit.

Only Fortune and Spirit are implemented, intentionally (`src/astrology/arabic-parts.ts:12-17`). That restraint is preferable to silently choosing disputed formulas, but professionals need source-labelled formula families for a wider catalogue. The application should eventually let the user choose a named authority/convention and print the literal formula used.

### 2.5 Orb mechanics and passive calculated points

**Assessment: internally coherent but professionally underpowered.**

Astraya has three fixed tiers: most major aspects, sextile, and all minor aspects, plus a luminary bonus and one global percentage scaler (`src/astrology/aspects.ts:54-90`). The defaults are 7° major/10° with a luminary, 4° sextile/5°30′ with a luminary, and 2°30′ for every minor aspect (`src/astrology/aspects.ts:62-68`, `src/astrology/aspects.ts:85-90`).

For Ascendant, MC, Vertex, Fortune, and Spirit contacts, the point is treated as a passive non-luminary. The orb comes from the body/aspect rule, with a luminary bonus only when the body is Sun or Moon (`src/domain/chart-compute.ts:185-196`). This is a reasonable modern software convention and avoids inventing an independent “Vertex orb” or “lot orb.”

However, the system cannot express common professional approaches:

- individual planetary orbs or moieties;
- a smaller orb for angles, nodes, Vertex, lots, asteroids, or fixed stars;
- per-aspect overrides;
- different profiles for natal, transit-to-natal, progression, direction, synastry, composite, and midpoint work;
- different maximum orbs for applying and separating contacts;
- dexter/sinister or mundane versus zodiacal aspect policies;
- “only conjunction/opposition to this point” constraints.

The global percentage setting is therefore a convenience control, not a professional orb editor. Calling the current numbers “standard orbs” is acceptable as an application default, but not as a neutral astrological standard.

### 2.6 Redundancy suppression

**Assessment: good for the known lot identity, incomplete as a general provenance system.**

Points never aspect other points, which avoids meaningless angle-to-angle and lot-to-angle entries. For Fortune and Spirit, the engine also suppresses the luminary contact that merely restates the corresponding Ascendant–luminary relationship (`src/domain/chart-compute.ts:176-218`, `src/domain/chart-compute.ts:338-372`). This directly addresses the classic redundancy problem: because a lot is `Asc + A − B`, one of its luminary contacts reproduces an existing angular relationship.

The next step is a general derived-point dependency model. Every calculated point should carry its formula/dependencies and each emitted aspect should be testable for algebraic equivalence to an already-listed contact. Suppression should be auditable in the UI (“omitted as mathematically redundant”), not silent, and user-configurable for research work.

### 2.7 Applying versus separating and motion vectors

**Assessment: correct for ordinary planetary longitude; approximate for some points.**

Planet-to-planet applying/separating is based on the signed separation and the difference of instantaneous longitudinal speeds (`src/astrology/aspects.ts:134-150`). This correctly handles retrogradation and is materially better than classifying solely from current angular separation.

Fortune and Spirit receive derived speeds combining the diurnal angle rate with the luminary speed difference. Ascendant, MC, and Vertex receive a fixed 360.9856°/day rate (`src/domain/chart-compute.ts:113-118`, `src/domain/chart-compute.ts:338-369`). The lot treatment is thoughtful, but a single sidereal rate is not the true instantaneous ecliptic motion of the Ascendant, MC, or especially Vertex; the rate varies with latitude, obliquity, and sidereal time. Near sensitive geometries, “applying” and “separating” can therefore disagree with a finite-difference ephemeris evaluation.

**Required correction:** Derive point motion numerically from the same chart geometry at `t − Δt` and `t + Δt`, with circular unwrapping and high-latitude tests. Until then, label applying/separating for angle/Vertex contacts as approximate or omit it.

### 2.8 Bodies, points, and aspect participation

**Assessment: computationally broad, operationally over-inclusive.**

The canonical set contains Sun through Pluto, both selectable node models, three selectable Lilith models, Chiron, Ceres, Pallas, Juno, and Vesta (`src/astrology/bodies.ts:41-61`). Chart composition collapses the alternative node and Lilith variants but retains every other body, yielding 17 ordinary displayed positions by default (`src/domain/chart-compute.ts:258-280`). Asteroids remain aspect subjects; only Chiron, Lilith, and nodes have aspect-participation gates (`src/domain/chart-compute.ts:305-316`).

The display filter can hide Chiron but has no general body filter (`src/domain/chart-tables.ts:103-124`). Fortune, Vertex, and midpoint settings govern derived rows/point calculations, not a complete independent model of body visibility, wheel visibility, matrix visibility, and aspect participation. The wheel uses that limited position filter (`src/domain/chart-tables.ts:613-624`).

**Professional consequence:** A traditional astrologer cannot reduce a chart cleanly to the seven visible planets; a modern astrologer cannot independently enable only Chiron or a chosen asteroid; a consultation chart begins with unnecessary glyph and chord pressure. Visibility and calculation participation must be separate controls.

### 2.9 Essential dignity, reception, dispositors, and sect condition

**Assessment: strong base tables, incomplete traditional judgment.**

Implemented foundations include Egyptian and Ptolemaic bounds, Chaldean faces, Dorothean/Lilly triplicity roles, domicile/exaltation/detriment/fall, sect, peregrine scoring, dispositors, and domicile mutual reception (`src/astrology/MAP.md:5-16`, `src/astrology/MAP.md:37`, `src/astrology/MAP.md:45`). The essential-dignity score uses the familiar 5/4/3/2/1 weights and defaults to traditional rulership plus Egyptian bounds (`src/astrology/almuten.ts:68-77`, `src/astrology/almuten.ts:93-124`).

There is nevertheless a coherence defect at the UI boundary. The application default rulership choice is modern (`src/astrology/rulership.ts:31-35`), and dignity rows pass that choice into the medieval dignity score (`src/domain/chart-tables.ts:327-343`). Yet the candidate list remains only the seven traditional planets (`src/astrology/almuten.ts:57-66`). In Scorpio, Aquarius, or Pisces, a modern ruler can take domicile status away from Mars, Saturn, or Jupiter while Pluto, Uranus, or Neptune cannot become the almuten candidate. This can yield historically incoherent medieval scoring.

Mutual reception is domicile-only (`src/astrology/dispositors.ts:69-85`). Missing or incomplete professional requirements include:

- reception and mutual reception by exaltation, triplicity, bound, and face;
- mixed reception and reception chains;
- generosity/virtue distinctions and reception linked to applying aspects;
- accidental dignity/debility: angularity, house strength, speed, direct/retrograde, oriental/occidental, combustion/cazimi/under beams, free of beams, besiegement, benefic/malefic aspects, joys, hayz/halb, ferality, and planetary condition summaries;
- sect benefic/malefic condition and rejoicing conditions;
- a complete, source-labelled Almuten Figuris including planetary hour and prenatal syzygy where the chosen method requires them;
- UI selection and provenance for Egyptian versus Ptolemaic bounds.

Traditional calculations should be pinned to a coherent traditional scheme regardless of a separate modern display-ruler preference, unless an explicitly labelled experimental hybrid is selected.

### 2.10 Predictive, relational, horary, and specialist techniques

**Assessment: exceptionally broad engine coverage, variable depth.**

The repository includes secondary, tertiary/minor, and solar-arc progressions; solar/lunar/planetary returns; profections; transits and stations; synastry/composite; eclipses; antiscia; declination; fixed stars/parans; astrocartography/local space; rectification; draconic and harmonic charts; electional scoring; void-of-course; primary directions; and more (`src/astrology/MAP.md:3-46`; `src/domain/MAP.md:5-37`). Breadth is a genuine strength.

Important qualifications:

- Primary directions are direct-only, Placidian semi-arc, zodiacal, and normally use zero ecliptic latitude. Converse, in-mundo, Regiomontanus, and other major schools are not supported (`src/astrology/primary-directions.ts:8-29`). The code documents these choices admirably, but the feature must not be presented as generic “primary directions.”
- Horary implements considerations before judgment and void-of-course support, not horary judgment. Its own source explicitly limits the checks to Ascendant degree, void Moon, Via Combusta, and Saturn in the seventh (`src/astrology/horary.ts:11-31`). It lacks significator assignment, perfection, reception, translation/collection of light, prohibition, frustration, refranation, house-derived questions, timing, and outcome synthesis.
- Harmonic calculations are sound as general longitude multiplication, but the named D10 Varga is explicitly an approximation that omits a classical odd/even restart convention (`src/astrology/harmonics.ts:20-35`). This must be visible at selection and export time, not only in a source comment.
- Nakshatra placement exists, but the presence of a sidereal profile should not imply a full Jyotish suite. Dashas, classical Varga conventions beyond the documented approximation, yogas, and other core Jyotish methods are absent.

### 2.11 Reproducibility of saved, shared, and exported charts

**Assessment: critical failure.**

The data model anticipates versioned calculation profiles and opaque settings in share links, but the live paths do not preserve the viewed chart:

- Share links deliberately encode `settings: {}` (`src/ui/ChartView.tsx:1055-1073`).
- The shared view ignores decoded settings and recalculates with the recipient device's current rulership choice (`src/ui/SharedChartView.tsx:55-81`).
- Confirmed extended settings are one global in-memory value shared by chart screens and are not persisted per chart (`src/ui/extended-settings-store.ts:1-20`).
- Profile source comments explicitly state that provenance storage is not yet implemented (`src/chart/calculation-profiles.ts:9-18`).
- Full-device export says it recalculates with application defaults—Placidus, tropical, standard orbs—rather than exporting each viewed chart's effective settings (`src/domain/full-export.ts:68-81`).
- PDF chart sections call computation with rulership alone, leaving house system, zodiac, orb, node/Lilith model, body/aspect set, and point settings at defaults (`src/ui/pdf-export-plan.ts:280-296`).

This breaks the fundamental professional invariant:

> Same birth data + same effective settings + same ephemeris/version must produce the same named chart everywhere.

A chart link sent after selecting Whole Sign/sidereal/custom orbs can open as Placidus/tropical/default orbs. A PDF can disagree with the screen from which it was requested. No amount of positional precision can compensate for applying the wrong configuration.

## 3. Pillar Analysis (Strengths vs. Weaknesses)

### Strengths

#### Computational and architectural strengths

1. **Failure is explicit.** Missing ephemeris files, out-of-range dates, unrecognized house failures, and degenerate Horizon cusps are rejected rather than disguised.
2. **Independent accuracy evidence exists.** JPL Horizons golden data and distinct ordinary/future/asteroid tolerances demonstrate a mature validation approach.
3. **Historical time is treated as astrological data, not plumbing.** LMT, calendar, DST ambiguity, zone boundaries, explicit offsets, and provenance are first-class.
4. **House-system breadth is professional-grade.** Astraya supports far more than the usual Placidus/Whole Sign pair and makes high-latitude fallback explicit.
5. **Sect-correct principal lots.** Fortune and Spirit formulas reverse correctly by day/night, and the code avoids guessing at disputed additional lots.
6. **Motion-aware planetary aspects.** Instantaneous speeds correctly distinguish applying from separating for ordinary positions, including retrogradation.
7. **Derived-point redundancy has received real mathematical attention.** The lot/luminary identity is suppressed and points are not allowed to generate nonsensical point-to-point aspect lists.
8. **Pure astrology modules are separated from React/UI.** The code map shows calculation logic that is independently unit-testable (`src/astrology/MAP.md:1-3`; `src/domain/MAP.md:1-3`). This makes cross-engine fixtures and regression tests practical.
9. **Technique breadth is unusually ambitious.** Traditional, modern, relational, mundane/location, and predictive modules coexist in one codebase.

#### UX and visual strengths

1. **Wheel collision handling is thoughtful.** Crowded glyphs are deterministically spread with leader lines back to true longitude (`src/chart/glyph-layout.ts:1-33`, `src/chart/glyph-layout.ts:176-220`). This preserves both legibility and positional truth.
2. **The wheel/inspector workbench has an explicit responsive contract.** It switches at a container-based 68rem threshold and keeps the wheel first in DOM/focus order (`src/ui/app.css:2073-2099`; `src/ui/ChartView.tsx:1302-1343`).
3. **Accessible tabular equivalents are intentional.** The SVG wheel is hidden from assistive technology while the exact data remains available as text tables (`src/ui/ChartView.tsx:1313-1324`).
4. **Tables support real practice workflows.** They are sortable, copyable, and downloadable as CSV, with accessible column state (`src/ui/SortableTable.tsx:1-14`, `src/ui/SortableTable.tsx:52-77`, `src/ui/SortableTable.tsx:92-123`).
5. **The aspect matrix is keyboard-operable.** Interactive cells have button roles, focus, pressed state, and descriptive labels (`src/chart/aspect-matrix.ts:358-365`).
6. **Matrix and wheel do not pretend unlimited density is harmless.** The matrix explicitly drops orb text below a minimum readable size (`src/chart/aspect-matrix.ts:101-109`), and minor aspect chords are withheld from the wheel while retained in tables/matrix (`src/domain/chart-tables.ts:603-624`). These are good protective choices, though they do not replace user control.

#### Where Astraya can offer novel value

Astraya's strongest differentiator is not one exotic technique. It is the combination of transparent time provenance, explicit calculation conventions, local-first data, independently testable pure engines, accessible tables, and refusal to conceal ephemeris/geometry failure. If calculation snapshots and provenance are completed, this could become a more auditable workflow than opaque consumer websites and a more portable one than legacy desktop software.

### Weaknesses

#### Critical weaknesses

| ID   | Weakness                                                                             | Impact                                                                                             | Root cause                                                                       | Required remedy                                                                                                              |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Viewed settings are not preserved in share links, shared views, PDF, or full export. | Recipient/report may show a materially different zodiac, houses, bodies, or aspects.               | Settings are global/in-memory; computation callers pass partial/default options. | Persist an immutable effective calculation snapshot per chart and require every compute/share/export path to consume it.     |
| C-02 | No professional body/point visibility and aspect-participation matrix.               | Default 17-body charts are cluttered; practitioners cannot isolate a traditional or custom corpus. | Canonical positions and display filtering are only partially configurable.       | Add independent include-in-computation, show-on-wheel, show-in-table/matrix, and allow-aspect controls for every body/point. |
| C-03 | Orb controls cannot encode practitioner methods.                                     | Different schools and chart types cannot be reproduced; point/asteroid contacts can be overstated. | Three hard-coded tiers plus one global scaler.                                   | Introduce versioned, named orb profiles with per-body/per-point/per-aspect and chart-context rules.                          |

#### High weaknesses

| ID   | Weakness                                                                                                 | Impact                                                                                                      | Evidence/qualification                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H-01 | Modern ruler preference can feed medieval almuten scoring while only traditional planets are candidates. | Traditional dignity results can become internally inconsistent.                                             | `src/astrology/rulership.ts:31-35`; `src/astrology/almuten.ts:57-77`; `src/domain/chart-tables.ts:327-343`.        |
| H-02 | Applying/separating for Asc/MC/Vertex uses a fixed sidereal rate.                                        | Point-contact direction can be wrong near exactness or sensitive latitudes.                                 | `src/domain/chart-compute.ts:113-118`, `src/domain/chart-compute.ts:345-350`.                                      |
| H-03 | No accidental-dignity and full reception layer.                                                          | Traditional chart judgment remains a collection of placements rather than an integrated condition analysis. | Existing modules cover essential dignity/dispositors but not the full judgment stack.                              |
| H-04 | Many advanced engines have a narrower convention than their feature label suggests.                      | Users may assume generic primary directions, Varga, or horary support.                                      | Primary directions, D10, and horary limitations are documented in source but must be visible in product UI/export. |
| H-05 | No standard chart-data interoperability.                                                                 | Client archives and collaboration remain locked to Astraya-specific JSON/CSV shapes.                        | No AAF/A93 import/export or documented stable external chart schema was found.                                     |

#### Usability and ergonomic weaknesses

1. **Default clutter is too high.** Collision spreading prevents direct overlap, but it cannot make 17 bodies plus angles/points and a dense aspect web cognitively equivalent to a seven-planet chart.
2. **Core data is distributed across tabs.** Placements, dignity/condition, and aspects are individually well presented, but a practitioner cannot scan the core chart state in under three seconds from one compact consultation dashboard.
3. **The matrix degrades by shrinking.** With all bodies/points enabled, it scales cells until orb text is omitted. On phones, “everything enabled” cannot remain professionally readable without filtering, virtualized detail, pagination, or landscape/print layouts.
4. **No consultation-wide shortcut layer was found.** Matrix cells are keyboard-operable, but there is no discoverable command system for switching tabs, searching a body, toggling isolation, opening settings, moving between exact contacts, or invoking export during a live reading.
5. **Point controls are semantically mixed.** Showing a point, computing it, allowing it to receive aspects, listing it in a table, and drawing it on the wheel should be distinct and understandable operations.
6. **Implemented overlays are not consistently exposed.** Overlay settings include antiscia, declination, 90° dial, and midpoint-tree options, but the code itself notes conservative defaults “until the UI exposes its own control” (`src/chart/overlay-options.ts:21-38`).
7. **Midpoint display is minimal.** The chart-derived list exposes only ASC/MC and Sun/Moon midpoints (`src/domain/chart-tables.ts:566-600`), insufficient for cosmobiology or midpoint-tree practice despite deeper midpoint engine code.

## 4. Professional Feature Gap Analysis

Priority reflects whether the omission prevents reliable professional adoption, not whether the feature is fashionable.

### Priority 0 — Adoption blockers

1. **Immutable chart calculation snapshot and provenance**
   - Store effective zodiac/ayanamsa, house system and effective fallback, topocentric/geocentric mode, node/Lilith variants, body/point set, aspect set, orb profile/version, rulership/dignity schemes, and profile ID/version with each chart.
   - Carry the same snapshot through share URLs, saved chart entities, PDF/CSV/JSON, backup/restore, and every advanced chart derived from it.
   - Include app version, Swiss Ephemeris/WASM version, asset hashes, date range, timezone database fingerprint, resolved offset/calendar, coordinates, and warnings.

2. **Complete body/point control**
   - Per-body controls for seven traditional planets, outers, Chiron, each asteroid, selected node, selected Lilith, angles, Vertex, Fortune, Spirit, fixed stars, and user-defined points.
   - Separate columns: calculate/load, display on wheel, include in tables/matrix, allow as aspect source/receiver, include in interpretations/export.
   - Ship named Traditional 7, Modern 10, Modern + Chiron, Asteroid, Horary, Cosmobiology, and Custom display sets.

3. **Professional orb profiles**
   - Named, versioned natal/traditional, natal/modern, transit, progression, direction, synastry, midpoint, fixed-star, and horary profiles.
   - Per-aspect and per-body/point rules; optional moiety calculation; distinct applying/separating maxima; conjunction-only rules for stars/lots where desired.
   - Print the active profile and resolved pair-specific orb beside exported aspects.

4. **Share/export parity tests**
   - A golden test must compare the on-screen `ChartData` fingerprint to saved, shared, reloaded, PDF-plan, and JSON-export recomputation.
   - Any difference must be either impossible or explicitly identified as a new derived chart.

### Priority 1 — Traditional-practice essentials

1. **Full planetary condition table** combining essential and accidental dignity/debility, sect, speed, phase from Sun, angularity, joys, hayz/halb, combustion/cazimi/under beams, retrogradation, stations, besiegement, and relevant benefic/malefic testimony.
2. **Complete reception engine** across domicile, exaltation, triplicity, bounds, and face, including mixed/mutual reception, aspect linkage, and configurable authority/scheme.
3. **Coherent scheme bundles**: Hellenistic, Medieval/Arabic, Renaissance/Lilly, and Custom. Each should bind rulers, triplicity lords, bounds, faces, sect conventions, lots, orb doctrine, and terminology.
4. **More source-labelled lots** with displayed formulas and sect-reversal convention. At minimum provide configurable, cited lots commonly used by Hellenistic/Medieval practitioners rather than an uncited undifferentiated catalogue.
5. **Complete Almuten Figuris** with an explicitly selected historical method, including the components that method requires; keep this separate from simple almuten-of-a-degree.
6. **Horary judgment tools**: derived houses, significator selection, Moon's next/last aspects, perfection, reception, translation/collection, prohibition/frustration/refranation, antiscia, timing units, and a testimony worksheet. Do not automate a verdict without exposing testimony.
7. **Primary-direction options**: converse, in mundo, actual latitude, Regiomontanus and other supported systems, promissor/significator selection, mundane/zodiacal aspects, and key provenance.
8. **Timing integration**: combine profections, solar return, transits, directions, progressions, and time-lord periods on a synchronized timeline. Add zodiacal releasing and firdaria if the product intends serious Hellenistic/Medieval coverage.

### Priority 1 — Modern/cosmobiological essentials

1. **Full midpoint structures**: all selected body pairs, direct/indirect midpoints, midpoint trees, 45°/90°/360° sorting, configurable modulus and orb, hit navigation, and Ebertin-style axis workflows without forcing interpretive text.
2. **Expose the existing 90° dial, antiscia, and declination options** consistently in chart settings and exports.
3. **Custom harmonic charts and aspect families** with explicit radix/harmonic provenance and context-specific orbs.
4. **Multi-wheel overlays** that preserve independently configurable natal, transit, progressed, directed, return, and relocated rings, with ring-specific bodies/aspects and uncluttered contact tables.
5. **Relocation workflow** beyond map lines: a first-class relocated natal chart with relocated angles/houses, natal-vs-relocated comparison, saved locations, and export parity.
6. **Modern points** as independent opt-ins: Chiron, selected Black Moon convention, Vertex, Eris and other bodies only where ephemeris support and naming are explicit. Avoid treating “Lilith” as a single unqualified object.

### Priority 2 — Data, workflow, and specialist depth

1. **AAF/A93-compatible import/export** or another well-documented interchange format, plus a stable versioned Astraya JSON schema. Import should preserve source text and flag lossy fields.
2. **Batch ephemeris and research tools**: searchable aspect/event lists, exact-hit navigation, date-range scans, station/ingress/lunation filters, and reproducible CSV output.
3. **Consultation mode**: one-screen placements/condition/aspects summary, fast body search/isolation, shortcut help, presentation-safe notes, and a clean client-facing display.
4. **Print strategy**: fixed-size professional wheel and matrix layouts, overflow rules, monochrome-safe aspect encoding, legends, provenance footer, and page-break control.
5. **Jyotish scope clarity**: either keep “Sidereal (Lahiri)” as a coordinate/profile option without implying full Jyotish, or implement source-specific dashas, Vargas, and related rules with appropriate expertise and tests.
6. **User-defined points and formulas** with safe expression parsing, named formula provenance, day/night variants, and redundancy detection.
7. **Solar return/profection and other overlay presets** that select a coherent technique stack rather than requiring manual assembly across screens.

## 5. Actionable Recommendations

### Critical Fixes

#### 1. Make calculation settings a required value object

Create a versioned `CalculationSnapshot` that contains every computation-affecting choice. Do not allow `computeChartData`, share/export builders, or derived-chart constructors to rely on ambient device state or defaults once a chart exists.

Implementation sequence:

1. Define the schema and canonical serialization; separate calculation settings from presentation-only settings.
2. Add a deterministic snapshot hash.
3. Persist the snapshot on saved chart entities and attach it to computed `ChartData` provenance.
4. Migrate existing charts by recording an explicit “legacy defaults assumed” snapshot, never by leaving fields absent.
5. Pass the snapshot into shared view, full export, PDF export, returns, transits, progressions, directions, synastry, composite, relocation, and harmonic code.
6. Display effective settings and warnings in chart headers and exports.
7. Add screen/share/reload/export fingerprint parity tests.

**Acceptance threshold:** A Whole Sign, Sidereal (Lahiri), true-node, custom-orb chart shared to a fresh browser and exported to PDF/JSON must reproduce identical positions, houses, aspects, applying/separating state, and displayed points, with the same snapshot hash.

#### 2. Replace partial visibility toggles with a body/point policy

Use a normalized policy per object rather than special booleans such as `chironVisible` and `aspectsToLilith`.

Minimum fields:

- `positionEnabled`
- `wheelVisible`
- `tableVisible`
- `matrixVisible`
- `aspectEnabled`
- `interpretationEnabled`

Angles and formula-derived points can omit `positionEnabled` where computation is intrinsic, but still need the remaining controls. Presets should initialize this policy; a Custom state should appear immediately after divergence.

**Acceptance threshold:** A user can render a seven-planet traditional wheel, a ten-planet modern wheel, and a custom Chiron-only extension without hidden asteroids contributing aspects or matrix rows.

#### 3. Introduce a real orb-rule engine

Resolve an orb from `(chart context, aspect, object A, object B, applying state, profile)` and return both the numeric maximum and a provenance string. Support symmetric rules by default and explicit one-way receptor rules for points where required.

Preserve today's values as a versioned `astraya-standard-v1` profile for backward compatibility; do not silently change it.

**Acceptance threshold:** The user can reproduce at least one traditional moiety profile and one modern per-aspect profile, save them, share them, and see the exact resolved maximum orb in aspect detail/export.

#### 4. Isolate traditional dignity from modern display rulership

Do not feed `modern` or `both` directly into a medieval almuten candidate set. Either force traditional rulers for traditional calculations or define a complete, explicitly nontraditional scoring system in which modern candidates and all weights are coherent.

**Acceptance threshold:** Changing a cosmetic/display ruler preference cannot silently alter a traditional almuten result. Changing the selected traditional scheme can, and is recorded in provenance.

#### 5. Correct or qualify point motion

Compute Ascendant, MC, Vertex, Fortune, and Spirit rates by finite difference from the actual geometry. Include wraparound, station-like behavior, high-latitude, and near-polar regression cases.

**Acceptance threshold:** Applying/separating agrees with whether the absolute distance from exactness decreases/increases in a small forward time step for every supported point, including Vertex.

### Enhancements

#### 1. Build a professional condition/reception workspace

Combine essential dignity, accidental condition, sect, reception, dispositors, phase, speed, and house strength in one sortable table. Every judgment cell should reveal the rule and source convention on demand. Avoid collapsing everything into a single opaque score.

#### 2. Turn advanced engines into explicit convention-driven tools

For primary directions, horary, Varga, void-of-course, and lots, present the method name and limitations before calculation and in exports. A user should never need to read a TypeScript comment to learn that a direction is direct-only or a D10 is approximate.

#### 3. Add a consultation dashboard

Provide a compact top layer containing:

- luminaries, Ascendant/MC, chart ruler, sect, and Moon phase;
- selected body placements with dignity/condition badges;
- closest applying major aspects and exact upcoming contacts;
- warnings (unknown/ambiguous time, house fallback, out-of-range or approximation notices).

Keep the detailed tabs, but make the principal chart state scannable without switching context.

#### 4. Make density adaptive through filtering, not only shrinking

For the wheel and matrix, add body groups, aspect-family filters, orb cutoffs, exactness sort, hide-unaspected, focus/isolate, and print presets. On small screens, prefer a filterable list/detail matrix to illegibly small cells.

#### 5. Add a discoverable shortcut system

Include a command palette or shortcut help overlay for body search, next/previous aspect, tab switching, isolate/clear, settings, export, and chart comparison. Keep all commands accessible by visible controls as well.

#### 6. Complete interoperability and provenance exports

Publish a stable JSON schema and add AAF/A93 import/export where licensing/specification access permits. CSV is useful for tables but cannot preserve a full chart calculation contract.

### Application Structure, Layout, Configuration, and Export Blueprint

The recommendations above require an information architecture that can grow without adding another permanent top-level item for every technique. Astraya already groups person techniques into families and keeps the Tools menu one dropdown level deep (`src/ui/person-nav.ts:57-83`; `src/ui/tools-nav.ts:1-46`). Preserve that discipline, but stop mixing person navigation, global tools, and document creation in the same horizontal strip. The current header does all three (`src/ui/AppNav.tsx:5-18`), which will become harder to scan as professional features are added.

#### Design direction: an astrologer's instrument, not a generic dashboard

The interface should feel like a precise observing and consultation instrument: restrained, data-dense when requested, and visually quiet around the chart. Avoid decorative star fields, zodiac gradients, glass panels, and a grid of interchangeable rounded “cards.” The wheel is the distinctive object; application chrome should help read it rather than compete with it.

Recommended visual foundation:

| Role                | Recommendation                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light canvas        | Cool paper `#F6F7F9`, with white `#FFFFFF` only for active work surfaces.                                                                                                                                                                 |
| Dark canvas         | Deep blue-black `#131923`, not pure black; preserve chart-line contrast without a theatrical “space” theme.                                                                                                                               |
| Primary ink         | `#202938`; secondary text `#5A6472`; divider `#CCD2DA`.                                                                                                                                                                                   |
| Calculation accent  | Solar ochre `#8A5A00` for the active profile, selected chart frame, and provenance—not for every button.                                                                                                                                  |
| Applying/separating | Blue-green `#087B70` for applying and brick `#A94332` for separating, always paired with `A`/`S` text or line pattern so color is never the sole carrier.                                                                                 |
| Typography          | A highly legible humanist sans such as Source Sans 3 for controls/data and STIX Two Text for report prose or interpretive headings. Use tabular numerals for degrees, times, and orbs; do not use monospace merely to signal “technical.” |
| Shape               | Small radii for controls and inspectors; square or very lightly rounded data tables. Reserve stronger enclosure for dialogs and the selected inspector only.                                                                              |

Keep normal prose below roughly 75 characters per line. Numerical tables can use the available width. Prefer sentence-case labels and literal actions: “Apply to chart,” “Save as new profile,” “Export current chart,” and “Build document.”

#### Proposed overall application hierarchy

Use two navigation layers with different ownership:

1. **Global header:** product identity, People, Tools, Documents, global search/command palette, sync status, and account/preferences.
2. **Person workspace navigation:** the selected person and only the destinations that operate on that person's data.

Do not place chart views, technique parameters, or export formats in the global header. Do not add a third level of flyout menus.

Recommended hierarchy:

```text
Astraya
├── People
│   └── [Selected person]
│       ├── Overview
│       ├── Birth data
│       ├── Charts
│       ├── Timing
│       ├── Relationships
│       ├── Location
│       └── Interpretation
├── Tools
│   ├── Sky & cycles
│   ├── Questions & planning
│   └── Birth data
├── Documents
│   ├── New document
│   ├── Templates
│   └── Recent exports
└── Preferences
    ├── General
    ├── Astrology defaults
    ├── Appearance & accessibility
    └── Data & privacy
```

“Recent exports” can initially mean locally retained export definitions and filenames rather than storing generated client documents. The purpose is to let a practitioner recreate a document, not to introduce unnecessary cloud document retention.

#### Desktop, tablet, and mobile layout

On wide screens, use a stable global header, a compact person rail, and a content canvas. On chart screens only, the existing inspector becomes the optional right column. This retains the sound 46rem + 20–24rem chart-workbench contract already present in `src/ui/app.css:2073-2099`.

```text
┌ Global header: People | Tools | Documents              Search  Account ┐
├───────────────┬──────────────────────────────────────┬─────────────────┤
│ Person        │ Page title + calculation basis      │                 │
│ Overview      │ Local controls / view tabs           │                 │
│ Birth data    ├──────────────────────────────────────┤ Inspector       │
│ Charts        │                                      │ or context      │
│ Timing        │ Chart / table / technique workspace  │ panel           │
│ Relationships │                                      │                 │
│ Location      │                                      │                 │
│ Interpretation│                                      │                 │
└───────────────┴──────────────────────────────────────┴─────────────────┘
```

- **Wide desktop:** show a 13–15rem person rail. Let the chart workbench activate its two-column wheel/inspector layout only when the content container itself reaches 68rem; do not base it on viewport width.
- **Tablet/narrow desktop:** collapse the person rail to a “Person workspace” button or a single horizontal, scrollable first-level row. Keep local page tabs visible; do not hide both navigation layers behind the same hamburger.
- **Mobile:** use a compact global header, a person switcher row, a page header, then one local-view selector. Keep the wheel first and inspector directly after it. Use bottom sheets for short display filters, but a full-screen staged editor for chart calculation settings.
- **Print/export:** do not reuse responsive screen breakpoints. Define fixed print compositions for wheel-only, wheel + key data, table report, and full document.

The content width should vary by task. Birth data and preferences should remain a readable 48–60rem form column; charts and maps should use a wide canvas; tables should be allowed to fill the canvas. A single global maximum width is inappropriate for all three.

#### Person workspace and feature placement

The current person registry already separates Overview, Birth record, Charts, Report, Astrocartography, timing techniques, and relationship charts (`src/ui/person-nav.ts:13-54`). Reorganize those destinations around practitioner questions:

| Destination        | Local tabs or sections                                                       | Features that belong here                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**       | Snapshot, Current timing, Notes                                              | Consultation dashboard: luminaries/angles, sect, chart ruler, top applying contacts, warnings, recent/favorite techniques. No full settings editor.                                                                                |
| **Birth data**     | Record, Time provenance, Locations                                           | Civil data, coordinates, offset/calendar/LMT evidence, time accuracy, source notes, rectification status.                                                                                                                          |
| **Charts**         | Natal, Draconic, Harmonic, Returns, Relocated                                | The chart-type selector already represented by `ChartTypeSelector`; each type then uses the same view structure. Return and relocated charts may also be linked from Timing/Location, but should have one canonical chart route.   |
| **Timing**         | Timeline, Transits, Forecast, Profections, Progressions, Directions, Returns | A shared date/as-of control and synchronized event timeline. Put secondary/tertiary/minor choices inside Progressions; put solar arc/primary directions inside Directions rather than making every method a permanent global item. |
| **Relationships**  | Synastry, Composite, future Davison                                          | Partner picker, bi-wheel, cross-aspects, overlays, relationship summary. Partner choice belongs in the workspace header and persists while switching these tabs.                                                                   |
| **Location**       | Relocated chart, Astrocartography, Local Space                               | Saved comparison location, relocated houses/angles, maps, line filters, natal-vs-relocated comparison.                                                                                                                             |
| **Interpretation** | Practitioner notes, Generated report, Sources                                | Human notes and deterministic corpus first; AI material clearly separated with provenance. Document export is an action, not another interpretation tab.                                                                           |

Use a first-level link for each row above. Within a destination, use a single row of local tabs or a select on mobile. Avoid nested hover flyouts. A technique with only two or three modes should use an in-page segmented control, not create another route family.

#### Chart workspace structure

The current chart has six peer views—Wheel, Aspects, Matrix, Elements, Placements, and Patterns (`src/ui/chart-sections.ts:29-30`). This exposes implementation outputs rather than a practitioner's reading sequence. Replace them with five stable first-level views:

1. **Wheel** — chart, selection inspector, compact legend, density/focus controls.
2. **Placements** — bodies, angles, houses, lots/derived points, fixed stars; use secondary tabs only when needed.
3. **Aspects** — `List`, `Matrix`, `Midpoints`, and `Declination` as an in-page view switch. The 90° dial belongs beside Midpoints, not in global settings.
4. **Condition** — essential dignity, accidental condition, sect, reception, dispositors, planetary phase/speed, and traditional warnings.
5. **Patterns** — elements/modalities, hemispheres/quadrants, Jones shape, aspect patterns, emphasis, and research summaries.

This keeps the frequently used wheel/placements/aspects one click away while giving dignity and reception a first-class professional home. “Elements” becomes one section of Patterns rather than consuming a permanent tab. Preserve deep links to every first- and second-level view.

The chart page header should contain:

- person and chart-type title;
- a calculation-basis line such as `Tropical · Whole Sign · Traditional Western v1 · Mean node`;
- warning badges for ambiguous time, house fallback, approximate method, or unsaved custom settings;
- `Chart setup`, `Display`, `Share`, and `Export` actions.

`PageHeader` already supports a compact basis line and page-scoped exports (`src/ui/PageHeader.tsx:36-49`, `src/ui/PageHeader.tsx:89-139`). Extend that component rather than adding another toolbar lower on the page. The basis line should open a read-only provenance summary; editing should remain a separate, explicit action.

#### Configuration and setting ownership

The present Extended Settings dialog mixes calculation settings, display settings, and device preferences, with different commit behavior in one surface (`src/ui/ExtendedSettingsPanel.tsx:1-20`). Split it by scope. Every setting should answer “what does this affect?” before the user changes it.

| Scope                         | Home                                                      | Examples                                                                                                                | Commit behavior                                                                            |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Chart calculation**         | `Chart setup` full-screen dialog/side sheet               | Profile, zodiac/ayanamsa, house system, body set, node/Lilith model, aspect set, orb profile, rulership/dignity schemes | Staged; `Apply to chart`; persisted in that chart's immutable calculation snapshot.        |
| **Technique calculation**     | The relevant Timing/Relationship/Location screen          | As-of date, progression method, time key, return location, partner, transit filter, direction mode                      | Staged when expensive; stored with that saved technique view/document definition.          |
| **Chart display**             | `Display` popover on wide screens; bottom sheet on mobile | Glyph style, labels, aspect-line families, colors, density, wheel orientation, show houses/degree ticks                 | Preview live; must never change computed chart data.                                       |
| **Device/account preference** | Preferences                                               | Language, theme, motion, default density, symbol set, default calculation profile                                       | Saves immediately or with one page-level Save; applies only to future charts where stated. |
| **Data and privacy**          | Preferences → Data & privacy                              | Backup/restore, AAF/JSON import, all-data export, deletion, sync controls                                               | Explicit confirmation and clear scope.                                                     |

##### Chart setup editor

Replace the long mixed modal with a staged editor whose internal navigation is visible:

```text
Chart setup
├── Profile & provenance
├── Zodiac & houses
├── Bodies & points
├── Aspects & orbs
└── Traditional / advanced options

[Revert]                    [Save as new profile] [Apply to chart]
```

- Show a sticky summary of changed values and which chart outputs will be recomputed.
- `Profile & provenance` shows the source profile, version, Custom state, app/ephemeris basis, and effective fallback warnings.
- `Bodies & points` uses a table with columns for Position, Wheel, Table/Matrix, Aspects, and Interpretation. Provide group toggles for Traditional 7, Outer planets, Points, Centaurs, and Asteroids.
- `Aspects & orbs` starts with an orb-profile picker and an “Edit a copy” action. Do not mutate a built-in versioned profile in place.
- `Traditional / advanced options` contains bounds, triplicity, dignity/reception convention, lot formula family, topocentric/geocentric options, and other calculation choices that require provenance.
- `Save as new profile` asks for a name and description, creates a user profile, and selects it. “Save as my default” belongs in Preferences → Astrology defaults, where the affected scope can be explained clearly.
- If the user closes with unapplied changes, offer `Discard` and `Continue editing`; never write device preferences live and then attempt to roll them back on Cancel.

##### Preferences workspace

The existing General/Astrology/Appearance/Data grouping is sound (`src/ui/PreferencesView.tsx:1-24`). As it grows, use a left-side anchor list on desktop and a section select on mobile rather than tab panels; URLs should continue to address each section.

Recommended contents:

- **General:** language, locale-dependent date/number format, default start screen, keyboard shortcut reference.
- **Astrology defaults:** default calculation profile, user profile library, orb-profile library, default chart display set, default location/topocentric policy. Clearly say “used for new charts”; never silently rewrite existing charts.
- **Appearance & accessibility:** theme, symbols/glyph variants, contrast, applying/separating encoding, motion, density, table text size, print defaults.
- **Data & privacy:** complete backup/restore, people import/export, AAF/A93/JSON interoperability, sync status, storage usage, destructive deletion.

Do not put current-chart house system, zodiac, bodies, or orbs here. Preferences chooses the starting default; Chart setup owns the effective saved snapshot.

#### Export and document architecture

Astraya currently has three export contexts: screen-specific actions in `PageHeader`, a global custom PDF link in the main navigation, and full-data/people CSV actions in Preferences (`src/ui/AppNav.tsx:13-18`; `src/ui/PreferencesView.tsx:16-24`; `src/ui/PageHeader.tsx:69-130`). Keep all three capabilities but give each an unambiguous purpose.

##### 1. Quick export — current screen

Keep `Export` in the page header. It should export exactly the current screen/snapshot and offer only relevant formats:

- Wheel: SVG, PNG sizes, print/PDF one-page chart, chart JSON/AAF.
- Table: CSV, TSV copy, print table, chart JSON where meaningful.
- Map: SVG/PNG, line table CSV, print map.
- Timing/relationship view: current event/contact CSV, one-page PDF, calculation JSON.

Every quick export should open a compact review sheet showing subject, chart type, effective calculation profile/snapshot hash, date/location, included bodies/aspects, warnings, and filename before download. “What you see” and “what will export” must be identical.

##### 2. Documents — composed client output

Move “Build custom PDF” from a lone global header link to a first-class **Documents** workspace. The present builder exposes many large disclosure groups on one page (`src/ui/PdfExportBuilder.tsx:440-508`, `src/ui/PdfExportBuilder.tsx:510-716`, `src/ui/PdfExportBuilder.tsx:752-812`). Replace that with a four-step builder:

1. **Document:** subject(s), title, language, template, date range.
2. **Content:** ordered outline of charts, tables, interpretations, timing, maps, and notes. Add/reorder/remove sections.
3. **Appearance:** page size, wheel size, color/monochrome, headers/footers, privacy options.
4. **Review & build:** page outline, calculation snapshots/warnings, estimated pages, missing data, then `Build PDF`.

Selecting a content block should open its options in a right inspector instead of expanding nested checkboxes inside the outline. Save the builder definition as a reusable local template. Examples: `Natal consultation`, `Annual forecast`, `Relationship report`, and `Traditional chart dossier`.

##### 3. Data portability — complete records

Keep full backup, people CSV, restore, and future migration tools under Preferences → Data & privacy. These are data-management actions, not chart exports and not client documents. Label the app-specific backup clearly; separately offer standards-based chart exchange when implemented.

##### Export quality contract

All exported artifacts should include or embed:

- the effective calculation snapshot or stable snapshot hash;
- app and ephemeris versions plus asset identifiers;
- civil time, resolved offset/provenance, calendar, coordinates, and timezone warning state;
- requested and effective house system;
- zodiac/ayanamsa, body/point set, aspect set, and orb profile;
- method/convention qualifications, such as direct-only primary directions or approximate D10;
- creation timestamp and locale;
- accessible text or tagged tables where the output format supports it.

PDF/SVG/PNG should share one fixed export layout engine so a wheel does not reflow differently by format. CSV should use locale-independent machine values with explicit units and stable keys; translated labels can be additional columns, not replacements. JSON schemas must be versioned and documented.

#### Placement of the highest-priority new features

| Feature                                            | Add it here                                                                                | Do not put it here                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Per-body/point visibility and aspect participation | Chart setup → Bodies & points                                                              | Appearance preferences or an unlabeled wheel-only filter |
| Named orb profiles and moieties                    | Chart setup → Aspects & orbs; manage reusable profiles in Preferences → Astrology defaults | One global percentage slider                             |
| Accidental dignity, reception, hayz/halb           | Charts → Condition                                                                         | Generic interpretation report                            |
| Lots/formula selection                             | Chart setup → Traditional/advanced; results under Placements → Lots                        | Tools menu as separate calculators                       |
| Midpoint trees and 90° dial                        | Charts → Aspects → Midpoints                                                               | Global display preferences                               |
| Declination/parallels                              | Charts → Aspects → Declination                                                             | Hidden overlay-only toggle                               |
| Return charts and profection overlays              | Timing → Returns/Timeline, linked to canonical chart routes                                | More top-level global tabs                               |
| Relocated natal chart                              | Location → Relocated chart                                                                 | Astrocartography map settings dialog only                |
| AAF/A93/JSON chart exchange                        | Quick Export for one chart; Preferences → Data & privacy for bulk import/export            | PDF builder                                              |
| Calculation provenance                             | Page-header basis summary and every export review/footer                                   | About screen only                                        |
| Custom profile manager                             | Preferences → Astrology defaults                                                           | Current chart dialog as an unbounded list                |
| Keyboard shortcuts/command search                  | Global command palette and Preferences shortcut reference                                  | Undiscoverable key handlers on individual pages          |

#### Navigation and layout rules for future features

1. Add a new global destination only if it applies independently of any person and contains multiple durable workflows.
2. Add a person-workspace destination only if it answers a distinct practitioner question; otherwise add a local tab/section to an existing destination.
3. Keep menus one flyout deep. If a group exceeds roughly seven items, route to a landing page with search/favorites rather than add nested submenus.
4. Keep chart calculation, technique calculation, display, device preference, and data-management scopes separate in both storage and UI.
5. Every technique page uses the same skeleton: title/basis/warnings, primary parameters, view switch, result workspace, context inspector, quick export.
6. Every expensive calculation has explicit `Apply/Calculate`; cosmetic display changes preview immediately.
7. Every page supports a useful empty state, loading state, calculation warning state, error recovery, and print state.
8. Preserve selection and local parameters when switching views within a technique, but never let them leak into a different person's chart.
9. Use badges only for actionable state—Custom, Unsaved, Approximate, Fallback, Ambiguous—not as decoration.
10. Test the information architecture with three practitioner tasks: cast and export a seven-planet traditional natal; build a modern transit consultation; compare and export a synastry report. Each should require no hunting through device preferences or unrelated global tools.

This structure is deliberately conservative about top-level navigation. It gives the broad calculation engine room to grow while keeping the practitioner's mental model stable: **choose a person, choose the kind of work, choose a view, inspect the evidence, export the same calculation**.

### Future Roadmap

#### Phase A — Trustworthy chart contract

Deliver immutable calculation snapshots, complete body policies, professional orb profiles, export/share parity, provenance footers, and regression fixtures. This phase should precede new techniques.

#### Phase B — Traditional professional suite

Deliver full condition/reception, scheme bundles, source-labelled lots, horary worksheet, expanded primary directions, and an integrated timing timeline. Validate against published worked examples from more than one tradition and document every convention.

#### Phase C — Modern and cosmobiological suite

Expose complete midpoint/dial workflows, ring-specific overlays, harmonic/aspect-set customization, declination/antiscia controls, relocated-chart comparison, and research/event search.

#### Phase D — Exchange, research, and institutional confidence

Add documented interchange, batch calculations, reproducible case bundles, signed calculation manifests, wider independent golden datasets, property-based tests around sign/cusp/time boundaries, and cross-check fixtures against Swiss Ephemeris CLI plus at least one independent implementation.

### Release gates for a “professional-ready” claim

Astraya should not claim professional calculation parity until all of the following are true:

- identical chart fingerprints survive save, reload, share, PDF, JSON, and backup/restore;
- every displayed body/point and aspect is user-controllable and its participation is explicit;
- named orb profiles are versioned, exportable, and context-aware;
- house fallback and every approximation are visible in the chart and export;
- traditional dignity uses internally coherent scheme bundles;
- angle/Vertex applying-separating is geometrically derived or clearly withheld;
- the full test suite passes in a permitted CI environment, with independent golden fixtures retained;
- printed/exported output includes enough provenance for another astrologer to reproduce the chart without access to the original device.

### Final assessment

Astraya is closer to professional quality in its **calculation ethics** than in its **professional workflow contract**. The engine often knows when not to bluff, which is rare and valuable. The immediate development priority should therefore not be another advanced technique. It should be making one chart—its settings, provenance, bodies, orbs, warnings, sharing, and exports—an immutable, reproducible object. Once that foundation is complete, the existing breadth can become a genuine professional advantage rather than an impressive collection of calculations whose effective configuration is too easy to lose.
