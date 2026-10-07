# src/astrology/ — Module Map

Pure astrological calculation for Astraya: bodies, aspects, houses, dignities/rulership,
sect, Arabic parts, progressions, directions, returns, synastry, electional/horary/
rectification math, void-of-course, eclipses, fixed stars, harmonics, draconic transform,
astrocartography math. No DOM, no React — every function here takes typed data (often
positions already resolved via an `EphemerisProvider`) in and returns typed data out, so
this directory is unit-testable without WASM and without a browser.

Listed alphabetically.

### `almuten.ts`
Domain purpose: implements Ibn Ezra's Almuten Figuris (essential-dignity component) for scoring which planet holds the most dignity at a point. Responsibility: scores a planet's five essential dignities at a longitude and picks the winning planet(s) for one point or across several "vital points". Key dependencies: `bodies.ts`, `bounds.ts`, `decans.ts`, `rulership.ts`, `sect.ts`, `triplicity.ts`.

### `antiscia.ts`
Domain purpose: supports the classical "hidden conjunction" technique of antiscia/contra-antiscia. Responsibility: reflects longitudes across the solstitial and equinoctial axes and finds other bodies within orb of those reflected points. Key dependencies: `aspects.ts` (`angularSeparation`).

### `arabic-parts.ts`
Domain purpose: computes the two best-attested Arabic/Hermetic lots. Responsibility: implements the general lot formula and the sect-correct Part of Fortune and Part of Spirit. Key dependencies: `sect.ts` (`Sect`).

### `aspects.ts`
Domain purpose: the shared aspect-finding engine every timing technique and chart view in Astraya builds on. Responsibility: defines the Ptolemaic/minor aspect set, orb configuration, and functions to match/find aspects (including cross-chart) with applying/separating direction. Key dependencies: `bodies.ts` (`BodyCategory`); used by nearly every other file in this directory.

### `astrocartography.ts`
Domain purpose: astrocartography (ACG) and Local Space line calculation for the map-based chart feature. Responsibility: computes MC/IC/AC/DC lines and great-circle Local Space lines from a point's equatorial coordinates. Key dependencies: `fixed-stars.ts` (`armcAtAngle`, `EquatorialPoint`).

### `ayanamsas.ts`
Domain purpose: the UI's sidereal-mode picker list. Responsibility: derives the canonical set of selectable ayanamsas from the generated Swiss Ephemeris constants, excluding the user-custom mode. Key dependencies: `../ephemeris/generated-constants.js`.

### `bodies.ts`
Domain purpose: the single source of truth for "what counts as a body" across the whole app. Responsibility: defines the canonical body list (luminaries, planets, nodes, Lilith variants, Chiron, asteroids) with lookup helpers and the south-node formula. Key dependencies: `../ephemeris/generated-constants.ts`; used throughout `src/astrology/**`, `domain/`, and chart rendering.

### `bounds.ts`
Domain purpose: supplies the two classical "terms" tables essential-dignity and almuten scoring need. Responsibility: holds the Egyptian and Ptolemaic bounds tables and resolves which planet's bound a longitude falls in. Key dependencies: `bodies.ts`, `signs.ts`; used by `almuten.ts`.

### `decans.ts`
Domain purpose: decan/face rulership for essential-dignity readings. Responsibility: computes the Chaldean face ruler and the sign-based triplicity decan ruler for a longitude. Key dependencies: `bodies.ts`, `dignities.ts` (`rulerOf`), `signs.ts`; used by `almuten.ts`.

### `declinations.ts`
Domain purpose: equatorial (declination-based) contacts, the out-of-ecliptic analogue of aspects. Responsibility: detects parallels/contraparallels between bodies and flags declinations beyond the Sun's obliquity ("out of bounds"). Key dependencies: none beyond ephemeris types.

### `dignities.ts`
Domain purpose: the base essential-dignity tables (rulership, exaltation, detriment, fall) other modules build scoring on top of. Responsibility: resolves a sign's ruler/exaltation/detriment/fall under the traditional or modern scheme. Key dependencies: `bodies.ts`, `signs.ts`; used by `rulership.ts`, `decans.ts`, `emphasis.ts`.

### `dispositors.ts`
Domain purpose: dispositor-chain and mutual-reception analysis for a chart. Responsibility: walks a body's dispositor chain to its final dispositor or a cycle, and checks whether two bodies are in mutual reception. Key dependencies: `rulership.ts`, `signs.ts`.

### `draconic.ts`
Domain purpose: the draconic chart, used for soul-level/karmic chart readings. Responsibility: re-measures a body's longitude from the natal North Node instead of zero Aries, leaving houses and all other motion data untouched. Key dependencies: none beyond ephemeris types.

### `eclipses.ts`
Domain purpose: eclipse-based timing and natal-contact analysis. Responsibility: finds solar/lunar eclipses in a span via the ephemeris's own search and determines which natal points they touch. Key dependencies: `bodies.ts`, `../ephemeris/types.js` (`EphemerisProvider`).

### `electional.ts`
Domain purpose: electional astrology — choosing an auspicious moment to begin something. Responsibility: evaluates a small, individually selectable rule set against sampled moments and ranks the best-scoring time windows. Key dependencies: `aspects.ts`, `bodies.ts`, `emphasis.ts` (`houseOf`), `lunar-phase.ts`, `void-of-course.ts`.

### `emphasis.ts`
Domain purpose: chart-balance readings (element/modality/dominant sign-house-planet, quadrant/hemisphere weighting). Responsibility: tallies body positions into these various partitions, with optional per-body weighting. Key dependencies: `dignities.ts` (`rulerOf`), `signs.ts`.

### `fixed-stars.ts`
Domain purpose: fixed-star astrology — conjunctions and the mundane "paran" technique. Responsibility: finds star/body ecliptic conjunctions and computes angle-crossing (paran) contacts from equatorial coordinates. Key dependencies: `aspects.ts` (`angularSeparation`); used by `astrocartography.ts`.

### `harmonics.ts`
Domain purpose: harmonic charts (Western) and Vedic Varga/divisional charts under one shared mechanism. Responsibility: multiplies longitudes (and whole-sign houses) by a whole number `n`, with named Varga presets (D1/D9/D10) on top. Key dependencies: `signs.ts`.

### `horary.ts`
Domain purpose: horary astrology's "considerations before judgment" radicality check. Responsibility: evaluates the four chart-level cautions (Ascendant too early/late, Moon void, Via Combusta, Saturn in the 7th) from Lilly's Christian Astrology. Key dependencies: `signs.ts` (`degreesInSign`).

### `houses.ts`
Domain purpose: the UI's house-system picker list. Responsibility: lists the canonical house systems Astraya exposes, with stable keys mapped to Swiss Ephemeris's single-character codes. Key dependencies: `../ephemeris/types.js` (`HouseSystem`).

### `jones-shapes.ts`
Domain purpose: Marc Edmund Jones's chart-shape classification (bundle/bowl/locomotive/bucket/seesaw/splay/splash). Responsibility: measures the chart's body distribution and classifies its overall shape, restricted to the traditional ten planets. Key dependencies: `bodies.ts`.

### `lunar-phase.ts`
Domain purpose: Moon-phase reporting (name, waxing/waning, illumination). Responsibility: computes Sun-Moon elongation and maps it to Dane Rudhyar's eight-fold lunation-cycle names. Key dependencies: none beyond ephemeris types.

### `midpoints.ts`
Domain purpose: midpoint astrology (Ebertin-style cosmobiology). Responsibility: computes near/far midpoints between bodies, all pairwise midpoints, and 90-degree-dial "midpoint tree" hits. Key dependencies: none beyond ephemeris types.

### `minor-progressions.ts`
Domain purpose: tertiary and minor progressions, two further day-for-X timing techniques. Responsibility: computes the progressed Julian day for tertiary (day-for-lunar-month) and minor (lunar-month-for-year) progressions. Key dependencies: `progressions.ts` (`ageInYears`); used by `planetary-returns.ts`.

### `mutual-aspects.ts`
Domain purpose: planetary-cycle timing (e.g. Jupiter-Saturn conjunctions) independent of any natal chart. Responsibility: finds exact aspects between two moving bodies via a sample-then-bisect search. Key dependencies: `aspects.ts`.

### `nakshatras.ts`
Domain purpose: Vedic/sidereal nakshatra (lunar mansion) placement. Responsibility: computes the nakshatra, pada, and lord for a sidereal longitude. Key dependencies: none beyond ephemeris types.

### `planetary-returns.ts`
Domain purpose: return-based timing techniques (planetary returns, demibirthday, progressed lunar return). Responsibility: finds a body's return to its natal longitude via exact root-finders (Sun/Moon) or an iterative crossing search (every other body), plus the demibirthday and progressed-lunar-return searches. Key dependencies: `minor-progressions.ts`, `progressions.ts`, `../ephemeris/generated-constants.js`.

### `profections.ts`
Domain purpose: annual/monthly profections, a Hellenistic house-per-year timing technique. Responsibility: rotates the natal Ascendant by whole signs per year (and subdivides by month), preserving its degree within the new sign. Key dependencies: `signs.ts`.

### `progressions.ts`
Domain purpose: secondary (day-for-year) progressions — the most widely used progression technique. Responsibility: computes the progressed Julian day and progressed houses under the quotidian/naibod/solarArc MC methods. Key dependencies: `../ephemeris/types.js`; used by `minor-progressions.ts`, `planetary-returns.ts`, `rectification.ts`, `solar-arc-directions.ts`.

### `rectification.ts`
Domain purpose: birth-time rectification — narrowing an uncertain birth time against known life events. Responsibility: scores candidate birth moments by solar-arc and slow-planet-transit contacts to the angles and ranks them by score and lift over the mean. Key dependencies: `bodies.ts`, `progressions.ts` (`ageInYears`).

### `rulership.ts`
Domain purpose: the single place that resolves "who rules this sign" under the reader's chosen rulership scheme, consumed consistently by every rulership-dependent feature. Responsibility: resolves rulers/co-rulers (modern, traditional, or both) and essential dignities under that choice. Key dependencies: `dignities.ts`, `signs.ts`; used by `dispositors.ts`, `transit-importance.ts`, and the chart-ruler/dispositor features.

### `sect.ts`
Domain purpose: sect (day/night) and Sun-proximity conditions — foundational to several other techniques (almuten, electional, horary). Responsibility: determines day/night sect, oriental/occidental solar phase, and cazimi/combust/under-the-beams conditions. Key dependencies: `aspects.ts` (`angularSeparation`); used by `almuten.ts`, `electional.ts`.

### `signs.ts`
Domain purpose: the base zodiac-sign partition nearly every other module in this directory relies on. Responsibility: defines the 12 tropical signs with element/modality, and sign-index/degree-in-sign helpers. Key dependencies: none; used throughout `src/astrology/**`.

### `solar-arc-directions.ts`
Domain purpose: solar arc directions — a whole-chart directional timing technique. Responsibility: shifts every natal body/angle by the progressed Sun's true solar arc and finds exact contacts to the natal chart. Key dependencies: `aspects.ts`, `bodies.ts`, `progressions.ts` (`mcArc`, `ageInYears`, `progressedJulianDay`).

### `solar-lunar-returns.ts`
Domain purpose: the simplest return-based techniques, solved by exact ephemeris root-finders. Responsibility: finds the solar return within a calendar year and lunar returns within a period. Key dependencies: `../ephemeris/types.js` (`EphemerisProvider`).

### `stations.ts`
Domain purpose: retrograde/direct station timing. Responsibility: finds the moments a planet's longitude speed crosses zero via sample-then-bisect search. Key dependencies: `../ephemeris/types.js` (`EphemerisProvider`).

### `synastry-importance.ts`
Domain purpose: ranks the Synastry screen's aspect table so the most meaningful cross-chart contacts surface first. Responsibility: scores a synastry aspect by body weight, aspect weight, and orb closeness, and ranks a list of aspects by that score. Key dependencies: `aspects.ts`, `bodies.ts`.

### `transit-events.ts`
Domain purpose: exact transit-to-natal aspect timing (the #207 weekly/monthly tier). Responsibility: finds the Julian day(s) a transiting body makes an exact aspect to a fixed natal longitude, via sample-then-bisect search. Key dependencies: `aspects.ts`.

### `transit-importance.ts`
Domain purpose: the Transits/Forecast screens' filtering and ranking engine. Responsibility: defines daily/yearly filter presets and a deterministic importance score used to rank which transits are shown first. Key dependencies: `aspects.ts`, `bodies.ts`, `rulership.ts`.

### `triplicity.ts`
Domain purpose: triplicity rulership (Dorothean/Lilly table), feeding into almuten/essential-dignity scoring. Responsibility: resolves the day/night/participating ruler of an element's or longitude's triplicity. Key dependencies: `bodies.ts`, `signs.ts`; used by `almuten.ts`, `decans.ts`.

### `void-of-course.ts`
Domain purpose: void-of-course Moon detection, used directly and as a building block for electional/horary searches. Responsibility: determines whether the Moon has made its last exact aspect before leaving its sign, via sample-then-bisect search over an hourly grid. Key dependencies: `aspects.ts`, `bodies.ts`; used by `electional.ts`.
