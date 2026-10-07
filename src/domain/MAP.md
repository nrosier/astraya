# src/domain/ Map

One level up from `src/astrology/`: composes pure astrological calculation functions into the
shapes a screen actually renders. Still pure/async, no DOM, no React.

### `astrocartography.ts`
**Domain purpose:** Backs the ACG/relocation feature (#171) — "where in the world is this planetary line active for me". **Responsibility:** Computes astrocartography lines (MC/IC/AC/DC), Local Space lines, and relocated houses from a natal moment. **Key dependencies:** `astrology/astrocartography.js` for the line math, `ephemeris/types.js` for provider calls; used by the astrocartography screen.

### `chart-compute.ts`
**Domain purpose:** The single source of truth for "what is in this chart" — every other domain module that needs a full chart (synastry, transit, composite, etc.) builds on this. **Responsibility:** Computes positions, houses, aspects, dignities, sect, Arabic parts, declinations, obliquity and fixed-star longitudes from a birth moment or Julian day. **Key dependencies:** `astrology/aspects.js`, `astrology/rulership.js`, `astrology/arabic-parts.js`, `astrology/sect.js`, `astrology/bodies.js`; consumed by nearly every other file in this directory.

### `chart-share.ts`
**Domain purpose:** Enables sharing a chart via URL with no server round-trip (#65), core to the local-first pitch. **Responsibility:** Encodes/decodes a birth moment plus chart settings as versioned URL query parameters. **Key dependencies:** `time/encode.js` for the birth-moment half; `store/ops.js`'s `JsonValue` for the settings bag type.

### `chart-tables.ts`
**Domain purpose:** Turns the chart's raw data into exactly what the UI's tables, wheel and sheet need to display (#44). **Responsibility:** Shapes a `ChartData` into position/house/aspect/dignity/dispositor/declination/antiscia/fixed-star rows, a wheel-ring input, and a chart-sheet input. **Key dependencies:** `astrology/almuten.js`, `astrology/antiscia.js`, `astrology/declinations.js`, `astrology/dispositors.js`, `astrology/fixed-stars.js`, `astrology/jones-shapes.js`, `astrology/midpoints.js`, `chart-compute.js`; feeds `chart/multi-wheel.js` and `chart/chart-sheet.js`.

### `chart.ts`
**Domain purpose:** Models the persisted "chart" entity a user names and keeps, distinct from the computed `ChartData`. **Responsibility:** Assembles a `Chart` record (person reference, kind, label, verbatim settings) from op-log field values, preserving unknown settings/kinds for forward compatibility. **Key dependencies:** `store/ops.js`'s `JsonValue`; `id.js` for person-id validation.

### `composite.ts`
**Domain purpose:** Supports the composite-chart relationship feature (#169) — a synthetic third chart distinct from synastry. **Responsibility:** Computes near-arc midpoint positions and midpoint-of-cusps houses from two natal charts, then a fresh single-chart aspect/dignity/sect/parts pass over the result. **Key dependencies:** `astrology/aspects.js`, `astrology/midpoints.js`, `astrology/rulership.js`, `astrology/sect.js`, `astrology/arabic-parts.js`, `chart-compute.js`.

### `demibirthday.ts`
**Domain purpose:** Supports the demibirthday timing feature (#50) — the solar-year "halfway point" chart. **Responsibility:** Finds the moment the Sun opposes its natal longitude in a given year and casts a chart there, with contacts back to the natal chart. **Key dependencies:** `astrology/aspects.js`, `astrology/planetary-returns.js`, `ephemeris/generated-constants.js`.

### `draconic.ts`
**Domain purpose:** Supports the draconic-chart feature (#398), a lunar-node-based alternate zodiac reading. **Responsibility:** Transforms natal positions into the draconic frame (natal houses unchanged) and computes a fresh aspect/dignity/sect/parts set for that transformed chart. **Key dependencies:** `astrology/draconic.js` for the transform; `chart-compute.js` for the natal chart and the single-chart engine pieces it reuses.

### `export-filename.ts`
**Domain purpose:** Small but used by every chart-export path (#67/#68) — ensures a downloaded file is self-identifying. **Responsibility:** Derives a safe filename from a person's display name and chart kind. **Key dependencies:** None (pure string utility); used by export UI code.

### `full-export.ts`
**Domain purpose:** Backs the whole-device data export/backup feature. **Responsibility:** Builds a complete JSON export (every person's birth record plus, where computable, their natal chart tables) and a CSV of people. **Key dependencies:** `chart-compute.js`, `chart-tables.js`, `person.js`, `astrology/rulership.js`.

### `harmonic.ts`
**Domain purpose:** Supports harmonic/Vedic Varga chart features (#170), e.g. D9 Navamsha. **Responsibility:** Transforms natal positions/houses by a harmonic number and computes a fresh single-chart aspect/dignity/sect/parts set. **Key dependencies:** `astrology/harmonics.js` for the transform math; `chart-compute.js` for the natal chart and reused engine pieces.

### `horary.ts`
**Domain purpose:** Supports the horary-astrology feature (#406) — judging a question cast at the moment it was asked. **Responsibility:** Computes an ordinary chart (Regiomontanus houses by default) plus the traditional considerations-before-judgment and void-of-course Moon check. **Key dependencies:** `astrology/horary.js`, `astrology/void-of-course.js`, `astrology/emphasis.js`, `chart-compute.js`.

### `house-overlays.ts`
**Domain purpose:** Supports the synastry "house overlay" reading staple (#422). **Responsibility:** Computes which of the other person's houses each of a synastry pair's real bodies falls into, in both directions. **Key dependencies:** `astrology/emphasis.js`'s `houseOf`; `synastry.js`'s `SynastryData`; `chart-compute.js`'s `housesAreDefined`.

### `id.ts`
**Domain purpose:** Enables local-first id generation without server coordination. **Responsibility:** Generates CSPRNG-backed, prefixed, base32 record ids for people and charts, and validates id shape. **Key dependencies:** None beyond the Web Crypto API; used throughout `store/` and wherever a new person/chart is created.

### `lunar-returns.ts`
**Domain purpose:** Supports the lunar-return timing feature (#49). **Responsibility:** Finds every lunar return (Moon-to-natal-longitude) within a date range and casts a chart with natal contacts for each. **Key dependencies:** `astrology/solar-lunar-returns.js`, `astrology/aspects.js`, `ephemeris/generated-constants.js`.

### `minor-progression.ts`
**Domain purpose:** Supports tertiary/minor progression timing techniques (#48). **Responsibility:** Computes a progressed chart for a target date under either the tertiary or minor progression method, with contacts to the fixed natal chart. **Key dependencies:** `astrology/minor-progressions.js`, `astrology/progressions.js`, `astrology/aspects.js`.

### `pdf-export-sections.ts`
**Domain purpose:** Drives the PDF export builder's selectable content (#441). **Responsibility:** Declares which chart types/tables/sections are exportable, their own per-section options, and ready-made presets (executive summary, complete archive), plus helpers to apply/match a preset or detect an empty selection. **Key dependencies:** `ui/chart-sections.js`'s `ChartType`; consumed by `chart/pdf-export.ts` and `ui/PdfExportBuilder.tsx`.

### `periodic-transit.ts`
**Domain purpose:** Backs the periodic transit-forecast feature (#207) — the "what's happening now" dashboard at four grains. **Responsibility:** Builds daily/weekly/monthly/yearly transit forecasts (Moon aspects, exact-aspect events, stations, solar return, demibirthday) against one natal chart. **Key dependencies:** `astrology/transit-events.js`, `astrology/stations.js`, `astrology/aspects.js`, `demibirthday.js`, `lunar-returns.js`, `progressed-lunar-return.js`, `solar-return.js`, `chart-compute.js`.

### `person-form.messages.ts`
**Domain purpose:** Supplies the user-facing validation error text for the birth-record form (#158). **Responsibility:** English/Dutch message catalogue for every validation failure `person-form.ts`'s `validateDraft` can produce. **Key dependencies:** None; consumed by `person-form.ts` and `ui/PersonForm.tsx`.

### `person-form.ts`
**Domain purpose:** Models the birth-data entry form as pure, testable logic (#45) rather than component code. **Responsibility:** Defines the `Draft` shape, validates it field-by-field, and converts validated changes into minimal op-log mutations (changed fields only). **Key dependencies:** `person.js`, `person-form.messages.js`, `time/types.js`, `store/oplog.js`, `store/ops.js`.

### `person.ts`
**Domain purpose:** The root entity of the whole app — every chart traces back to a `Person`. **Responsibility:** Defines the `Person` shape (birth moment, place label, time accuracy, notes, offset witness) and assembles/validates one from op-log register values. **Key dependencies:** `time/types.js`; read by nearly every other domain module that needs a birth moment.

### `planetary-return.ts`
**Domain purpose:** Generalizes return-chart timing to any body (#50), not just Sun/Moon. **Responsibility:** Searches forward from a given date for the next return of a chosen body to its natal longitude and casts a chart with natal contacts. **Key dependencies:** `astrology/planetary-returns.js`, `astrology/aspects.js`, `astrology/bodies.js`.

### `profections.ts`
**Domain purpose:** Supports the annual/monthly profections timing technique (#168), a Hellenistic method. **Responsibility:** Computes the profected sign/house/ruler for a target moment's year and month, from the natal Ascendant alone. **Key dependencies:** `astrology/profections.js`, `astrology/rulership.js`, `astrology/progressions.js`, `astrology/signs.js`.

### `progressed-lunar-return.ts`
**Domain purpose:** Supports the progressed-lunar-return timing technique (#50), a monthly analogue to a solar return. **Responsibility:** Finds the most recent moment the real Moon crossed the secondary-progressed Moon's position and casts a chart with natal contacts there. **Key dependencies:** `astrology/planetary-returns.js`, `astrology/aspects.js`.

### `rectification.ts`
**Domain purpose:** Supports birth-time rectification (#408) for people with an uncertain time of birth. **Responsibility:** Turns a range of candidate clock times into resolved moments (respecting DST) and ranks them against supplied life events via `astrology/rectification.js`. **Key dependencies:** `astrology/rectification.js`, `time/julian.js`, `time/resolve.js`.

### `relationship-themes.ts`
**Domain purpose:** Powers the synastry relationship-summary reading (#422). **Responsibility:** Groups a synastry pairing's cross-chart aspects into customary themes (bond, attraction, communication, etc.), classifies aspect valence, and computes body-to-angle contacts. **Key dependencies:** `astrology/aspects.js`, `astrology/bodies.js`, `synastry.js`, `chart-compute.js`.

### `return-chart.ts`
**Domain purpose:** Lets a solar/lunar return be browsed as a first-class chart on the Charts page. **Responsibility:** Wraps `computeSolarReturn`/`computeLunarReturns` with `computeChartDataAtJd` to produce a full displayable `ChartData` plus natal contacts filtered to match what the chart actually shows. **Key dependencies:** `chart-compute.js`, `lunar-returns.js`, `solar-return.js`, `astrology/aspects.js`.

### `secondary-progression.ts`
**Domain purpose:** Supports the secondary-progression timing technique (#46), the day-for-year method. **Responsibility:** Computes a progressed chart for a target Julian day, including the progressed MC via one of three methods, with contacts to the fixed natal chart. **Key dependencies:** `astrology/progressions.js`, `astrology/aspects.js`, `astrology/bodies.js`.

### `solar-arc-directions.ts`
**Domain purpose:** Supports the solar arc directions timing technique (#47). **Responsibility:** Applies the natal Sun's progressed arc uniformly to every body and angle, finds contacts to the fixed natal chart, and resolves each contact's exact date. **Key dependencies:** `astrology/solar-arc-directions.js`, `astrology/progressions.js`, `astrology/aspects.js`.

### `solar-return.ts`
**Domain purpose:** Supports the solar-return timing technique (#49), the classic "birthday chart". **Responsibility:** Finds the moment the Sun returns to its natal longitude in a given year and casts a chart with natal contacts, at a chosen or default location. **Key dependencies:** `astrology/solar-lunar-returns.js`, `astrology/aspects.js`, `ephemeris/generated-constants.js`.

### `synastry.ts`
**Domain purpose:** Core of the two-person compatibility feature (#172). **Responsibility:** Computes two independent natal charts and the cross-chart aspects between them, plus importance-ranked aspects for the relationship summary. **Key dependencies:** `astrology/aspects.js`, `astrology/synastry-importance.js`, `chart-compute.js`; used by `house-overlays.js` and `relationship-themes.js`.

### `transit.ts`
**Domain purpose:** Core of the "sky right now" transit feature (#172). **Responsibility:** Computes a natal/transiting chart pair for a chosen moment and the aspects from the moving transiting positions to the fixed natal chart. **Key dependencies:** `astrology/aspects.js`, `chart-compute.js`.
