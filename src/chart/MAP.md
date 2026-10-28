# src/chart/ — Map

Hand-rolled SVG rendering layer: chart wheels (single/bi-/tri-ring), aspect webs, overlays (antiscia/declination/dial90), aspect matrix, diagrams, glyphs, settings, and export support. No third-party charting library (except one adapter); CSP forbids icon fonts.

- `acg-map.ts` — Astrocartography world map (AC/DC/MC/IC + local-space lines). Deps: `astrology/astrocartography`, `astrology/bodies`, `domain/astrocartography`.
- `antiscia-overlay.ts` — Antiscia/contra-antiscia chord overlay. Deps: `astrology/antiscia`, `./wheel`.
- `aspect-matrix.ts` — Lower-triangular aspect staircase grid: under the wheel in the sheet and PDF export; its position and orb helpers also feed the on-screen `ui/AspectMatrixGrid`. Deps: `astrology/signs`, `./aspect-web`, `./glyphs`, `./sheet-geometry`.
- `coastline-110m.ts` — Generated Natural Earth 1:110m coastline (public domain) as a degree-space SVG path, loaded lazily under the ACG map (#667). Deps: none.
- `pdf-map-data.ts` — Generated Natural Earth 1:50m land and borders for the PDF birth-place map, loaded lazily (#711). Deps: none.
- `birth-map.ts` — Draws the PDF birth-place map as SVG (±20° around the birthplace) with an unlabelled pin on the birth coordinates (#711). Deps: `./svg-primitives`.
- `aspect-web.ts` — Aspect chord rendering (cross-ring variant for bi-/tri-wheels). Deps: `astrology/aspects`, `astrology/bodies`, `./wheel`.
- `astrochart-adapter.ts` — Interop with `@astrodraw/astrochart` library (dev-only reference wheel). Deps: `astrology/bodies`, `domain/chart-compute`.
- `body-id.ts` — Multi-ring body identifier codec (`key@ring`). Deps: none (pure string codec).
- `calculation-profiles.ts` — Three built-in, versioned calculation profiles (Modern Western/Traditional Western/Sidereal (Lahiri)) as complete settings+rulership snapshots (#506/#510). Deps: `astrology/ayanamsas`, `astrology/rulership`, `./extended-settings`, `./object-policy`.
- `chart-sheet.ts` — Whole printable/exportable chart sheet (header + wheel + panels), plus the wheel-only dial shown on screen. Deps: `./aspect-matrix`, `./degree-strip`, `./emphasis-grid`, `./multi-wheel`, `./sheet-geometry`.
- `cycle-diagram.ts` — Planetary-cycle zodiac plot (successive exact-aspect points). Deps: `astrology/signs`, `./glyphs`, `./wheel`.
- `declination-overlay.ts` — Parallel/contraparallel declination chord overlay. Deps: `astrology/declinations`, `./wheel`.
- `degree-strip.ts` — 0–30° same-degree distribution strip. Deps: `astrology/signs`, `./glyphs`, `./sheet-geometry`.
- `dial90.ts` — Traditional cosmobiology 90-degree dial. Deps: `astrology/midpoints`, `./glyph-layout`, `./wheel`.
- `emphasis-grid.ts` — Element × modality balance table. Deps: `astrology/emphasis`, `astrology/signs`, `./glyphs`, `./sheet-geometry`.
- `extended-settings.ts` — Chart settings bag (house system/zodiac/bodies/aspects/colours/wheel style). Deps: `astrology/aspects`, `domain/chart-compute`, `domain/chart-tables`, `./object-policy`, `./wheel`.
- `glyph-layout.ts` — Glyph collision avoidance on wheel (spreads stelliums). Deps: `astrology/signs`, `./glyphs`, `./svg-primitives`, `./wheel`.
- `glyph-variants.ts` — Alternate glyph forms (Uranus/Pluto historical variants). Deps: none (module state).
- `glyph-weight.ts` — Glyph stroke-weight setting (fine/regular/bold). Deps: none (module state).
- `glyphs.ts` — Vector-path glyph registry (all bodies/signs/aspects) + `renderGlyph`. Deps: `./glyph-variants`, `./glyph-weight`, `./symbol-class`, `./symbol-text`.
- `jones-shape-diagram.ts` — Jones chart-shape abstract diagram. Deps: `astrology/jones-shapes`, `./svg-primitives`, `./wheel`.
- `multi-wheel.ts` — Main chart wheel renderer (single/bi-/tri-ring with shared anchor, glyphs, cusps, aspect webs, accessible legend, leader arrows). Deps: `astrology/aspects`, `astrology/signs`, `./aspect-web`, `./glyph-layout`, `./glyphs`, `./sheet-geometry`, `./wheel`.
- `object-policy.ts` — Unified per-object visibility/aspect-participation policy (#585): every body (Pholus default off, #804) plus Vertex/Fortune/Spirit, keyed the same way everywhere, plus the Core/Traditional/All presets; `interpreted` flag (#721) feeds report exclusions, separate from display. Deps: none (plain data, documented against pre-#585 defaults it reproduces).
- `overlay-options.ts` — Persisted overlay settings bridge (antiscia/declination/dial90/midpoint-tree). Deps: `store/ops` (JsonValue).
- `sheet-geometry.ts` — Chart sheet layout authority (800px reference frame, linear scaling, per-ring planet bands). Deps: none (pure geometry).
- `standalone-svg.ts` — Inlines `src/ui/app.css` light-theme palette into exported SVG `<style>`. Deps: none (string manipulation).
- `svg-primitives.ts` — Shared low-level SVG builders (line/circle/rect/polygon/text/escapeXml). Deps: none (no colour emission).
- `symbol-class.ts` — Device-wide symbol-class setting (glyphs/Unicode/text). Deps: none (module state).
- `symbol-text.ts` — Unicode + text-code alternatives for bodies/signs/aspects. Deps: none (static lookup).
- `wheel-options.ts` — Persisted wheel display settings bridge (orientation/sweep/wedge style). Deps: `store/ops` (JsonValue), `./wheel`.
- `wheel.ts` — Shared wheel coordinate system (wheelAngle/pointOnCircle functions, orientation/sweep types). Deps: none beyond ephemeris types.
