# src/chart/ — Map

Hand-rolled SVG rendering layer: chart wheels (single/bi-/tri-ring), aspect webs, overlays (antiscia/declination/dial90), aspect matrix, diagrams, glyphs, settings, and export support. No third-party charting library (except one adapter); CSP forbids icon fonts.

- `acg-map.ts` — Astrocartography world map (AC/DC/MC/IC + local-space lines). Deps: `astrology/astrocartography`, `astrology/bodies`, `domain/astrocartography`.
- `antiscia-overlay.ts` — Antiscia/contra-antiscia chord overlay. Deps: `astrology/antiscia`, `./wheel`.
- `aspect-matrix.ts` — Lower-triangular aspect staircase grid under wheel. Deps: `astrology/signs`, `./aspect-web`, `./glyphs`, `./sheet-geometry`.
- `aspect-web.ts` — Aspect chord rendering (cross-ring variant for bi-/tri-wheels). Deps: `astrology/aspects`, `astrology/bodies`, `./wheel`.
- `astrochart-adapter.ts` — Interop with `@astrodraw/astrochart` library (dev-only reference wheel). Deps: `astrology/bodies`, `domain/chart-compute`.
- `body-id.ts` — Multi-ring body identifier codec (`key@ring`). Deps: none (pure string codec).
- `chart-sheet.ts` — Whole printable/exportable chart sheet (header + wheel + panels). Deps: `./aspect-matrix`, `./degree-strip`, `./emphasis-grid`, `./multi-wheel`, `./sheet-geometry`.
- `cycle-diagram.ts` — Planetary-cycle zodiac plot (successive exact-aspect points). Deps: `astrology/signs`, `./glyphs`, `./wheel`.
- `declination-overlay.ts` — Parallel/contraparallel declination chord overlay. Deps: `astrology/declinations`, `./wheel`.
- `degree-strip.ts` — 0–30° same-degree distribution strip. Deps: `astrology/signs`, `./glyphs`, `./sheet-geometry`.
- `dial90.ts` — Traditional cosmobiology 90-degree dial. Deps: `astrology/midpoints`, `./glyph-layout`, `./wheel`.
- `emphasis-grid.ts` — Element × modality balance table. Deps: `astrology/emphasis`, `astrology/signs`, `./glyphs`, `./sheet-geometry`.
- `extended-settings-presets.ts` — Named tradition presets (modern/traditional/vedic) for chart settings. Deps: `astrology/ayanamsas`, `astrology/rulership`, `./extended-settings`.
- `extended-settings.ts` — Chart settings bag (house system/zodiac/bodies/aspects/colours/wheel style). Deps: `astrology/aspects`, `domain/chart-compute`, `domain/chart-tables`, `./wheel`.
- `glyph-layout.ts` — Glyph collision avoidance on wheel (spreads stelliums). Deps: `astrology/signs`, `./glyphs`, `./svg-primitives`, `./wheel`.
- `glyph-variants.ts` — Alternate glyph forms (Uranus/Pluto historical variants). Deps: none (module state).
- `glyph-weight.ts` — Glyph stroke-weight setting (fine/regular/bold). Deps: none (module state).
- `glyphs.ts` — Vector-path glyph registry (all bodies/signs/aspects) + `renderGlyph`. Deps: `./glyph-variants`, `./glyph-weight`, `./symbol-class`, `./symbol-text`.
- `jones-shape-diagram.ts` — Jones chart-shape abstract diagram. Deps: `astrology/jones-shapes`, `./svg-primitives`, `./wheel`.
- `multi-wheel.ts` — Main chart wheel renderer (single/bi-/tri-ring with shared anchor, glyphs, cusps, aspect webs, legend). Deps: `astrology/aspects`, `astrology/signs`, `./aspect-web`, `./glyph-layout`, `./glyphs`, `./sheet-geometry`, `./wheel`.
- `overlay-options.ts` — Persisted overlay settings bridge (antiscia/declination/dial90/midpoint-tree). Deps: `store/ops` (JsonValue).
- `sheet-geometry.ts` — Chart sheet layout authority (800px reference frame, linear scaling, per-ring planet bands). Deps: none (pure geometry).
- `standalone-svg.ts` — Inlines `app.css` light-theme palette into exported SVG `<style>`. Deps: none (string manipulation).
- `svg-primitives.ts` — Shared low-level SVG builders (line/circle/rect/polygon/text/escapeXml). Deps: none (no colour emission).
- `symbol-class.ts` — Device-wide symbol-class setting (glyphs/Unicode/text). Deps: none (module state).
- `symbol-text.ts` — Unicode + text-code alternatives for bodies/signs/aspects. Deps: none (static lookup).
- `wheel-options.ts` — Persisted wheel display settings bridge (orientation/sweep/wedge style). Deps: `store/ops` (JsonValue), `./wheel`.
- `wheel.ts` — Shared wheel coordinate system (wheelAngle/pointOnCircle functions, orientation/sweep types). Deps: none beyond ephemeris types.
