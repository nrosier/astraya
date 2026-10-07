# src/domain/ — Map

One level above `src/astrology/`: composes pure astrological calculations into shapes screens render. Still pure/async, no DOM/React.

- `astrocartography.ts` — Astrocartography lines (MC/IC/AC/DC) + Local Space + relocated houses. Deps: `astrology/astrocartography`, `ephemeris/types`.
- `chart-compute.ts` — Single source of truth: "what is in this chart" (positions, houses, aspects, dignities, sect, Arabic parts, declinations, fixed stars). Deps: `astrology/aspects`, `astrology/rulership`, `astrology/arabic-parts`, `astrology/sect`, `astrology/bodies`.
- `chart-share.ts` — Share chart via URL (no server round-trip). Encodes/decodes birth moment + settings as versioned query params. Deps: `time/encode`, `store/ops` (JsonValue).
- `chart-tables.ts` — Converts chart data into UI table/wheel/sheet rows. Deps: `astrology/almuten`, `astrology/antiscia`, `astrology/declinations`, `astrology/dispositors`, `astrology/fixed-stars`, `astrology/jones-shapes`, `astrology/signs`, `./chart-compute`.
- `chart.ts` — Persisted "chart" entity (distinct from computed ChartData): person ref, kind, label, settings. Deps: `store/ops`, `./id`.
- `composite.ts` — Composite chart (synthetic midpoint + fresh aspect/dignity/sect/parts). Deps: `astrology/aspects`, `astrology/midpoints`, `astrology/rulership`, `astrology/sect`, `astrology/arabic-parts`, `./chart-compute`.
- `demibirthday.ts` — Demibirthday timing (Sun opposes natal longitude each year). Deps: `astrology/aspects`, `astrology/planetary-returns`, `ephemeris/generated-constants`.
- `draconic.ts` — Draconic chart (lunar-node-based zodiac shift, same houses). Deps: `astrology/draconic`, `./chart-compute`.
- `export-filename.ts` — Safe filename from person + chart kind. Deps: none (pure string).
- `full-export.ts` — Whole-device backup export (every person + computable natal tables + CSV). Deps: `./chart-compute`, `./chart-tables`, `./person`, `astrology/rulership`.
- `harmonic.ts` — Harmonic/Vedic Varga charts (D9 Navamsha, etc.). Deps: `astrology/harmonics`, `./chart-compute`.
- `horary.ts` — Horary chart + considerations-before-judgment + void-of-course check. Deps: `astrology/horary`, `astrology/void-of-course`, `astrology/emphasis`, `./chart-compute`.
- `house-overlays.ts` — Synastry house overlays (which houses each person's bodies fall in, both directions). Deps: `astrology/emphasis`, `./synastry`, `./chart-compute`.
- `id.ts` — Local-first CSPRNG-backed prefixed base32 id generation (people/charts). Deps: Web Crypto API only.
- `lunar-returns.ts` — Lunar returns (every Moon-to-natal-longitude each cycle). Deps: `astrology/solar-lunar-returns`, `astrology/aspects`, `ephemeris/generated-constants`.
- `minor-progression.ts` — Tertiary/minor progressions (day-for-lunar-month / lunar-month-for-year). Deps: `astrology/minor-progressions`, `astrology/progressions`, `astrology/aspects`.
- `pdf-export-sections.ts` — PDF export builder content (selectable chart types/tables/sections + presets). Deps: `ui/chart-sections` (ChartType).
- `periodic-transit.ts` — Periodic transit forecast (daily/weekly/monthly/yearly sky events). Deps: `astrology/transit-events`, `astrology/stations`, `astrology/aspects`, `./demibirthday`, `./lunar-returns`, `./progressed-lunar-return`, `./solar-return`, `./chart-compute`.
- `person-form.messages.ts` — i18n for birth-record form validation errors. Deps: none.
- `person-form.ts` — Birth-data entry form logic: Draft validation + minimal op-log mutations. Deps: `./person`, `./person-form.messages`, `time/types`, `store/oplog`, `store/ops`.
- `person.ts` — Root entity: birth moment, place label, time accuracy, notes, offset witness. Deps: `time/types`.
- `planetary-return.ts` — Any-body return chart (not just Sun/Moon). Deps: `astrology/planetary-returns`, `astrology/aspects`, `astrology/bodies`.
- `profections.ts` — Annual/monthly profections (Hellenistic house-per-year timing). Deps: `astrology/profections`, `astrology/rulership`, `astrology/progressions`, `astrology/signs`.
- `progressed-lunar-return.ts` — Progressed-lunar-return timing (monthly Solar-Return analogue). Deps: `astrology/planetary-returns`, `astrology/aspects`.
- `rectification.ts` — Birth-time rectification (ranks candidate times by life-event contacts). Deps: `astrology/rectification`, `time/julian`, `time/resolve`.
- `relationship-themes.ts` — Synastry relationship-summary themes (bond, attraction, communication, etc.). Deps: `astrology/aspects`, `astrology/bodies`, `./synastry`, `./chart-compute`.
- `return-chart.ts` — Solar/lunar return as first-class displayable chart (with natal contacts). Deps: `./chart-compute`, `./lunar-returns`, `./solar-return`, `astrology/aspects`.
- `secondary-progression.ts` — Secondary progressions (day-for-year, three MC methods). Deps: `astrology/progressions`, `astrology/aspects`, `astrology/bodies`.
- `solar-arc-directions.ts` — Solar arc directions (apply progressed Sun's arc to all bodies). Deps: `astrology/solar-arc-directions`, `astrology/progressions`, `astrology/aspects`.
- `solar-return.ts` — Solar return (Sun returns to natal longitude each year). Deps: `astrology/solar-lunar-returns`, `astrology/aspects`, `ephemeris/generated-constants`.
- `synastry.ts` — Two-person compatibility core (independent charts + cross-chart aspects + importance ranking). Deps: `astrology/aspects`, `astrology/synastry-importance`, `./chart-compute`.
- `transit.ts` — Transit bi-wheel (natal + moving positions + natal aspects). Deps: `astrology/aspects`, `./chart-compute`.
