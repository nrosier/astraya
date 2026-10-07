# `src/chart/` map

Astraya's SVG rendering layer: the chart wheel, bi-/tri-wheels, aspect matrix, overlay
diagrams, glyphs, settings bridges, and the standalone-export stylesheet. All hand-rolled
SVG — no third-party charting library except the one adapter noted below — because the
app's CSP forbids an icon font and every export path (standalone SVG, PNG, print) needs a
self-contained SVG string.

### `acg-map.ts`

**Domain purpose:** Astrocartography world map (#171).
**Responsibility:** Renders AC/DC/MC/IC and local-space lines over a graticule-only
equirectangular world projection, splitting point runs at antimeridian crossings.
**Key dependencies:** `../astrology/astrocartography.js`, `../astrology/bodies.js`,
`../domain/astrocartography.js`, `svg-primitives.ts`.

### `antiscia-overlay.ts`

**Domain purpose:** Antiscia/contra-antiscia overlay on the wheel (#31, #148).
**Responsibility:** Filters (toggle + orb, with mirrored-pair dedup) and draws antiscial
contacts as chords, matching `aspect-web.ts`'s drawing idiom.
**Key dependencies:** `../astrology/antiscia.js`, `wheel.ts`.

### `aspect-matrix.ts`

**Domain purpose:** The Astro-Seek-style aspect grid under the wheel (#413).
**Responsibility:** Renders a positions table plus a lower-triangular aspect staircase so
every body pair's aspect (or lack of one) is a lookup, not a scan.
**Key dependencies:** `../astrology/signs.js`, `aspect-web.ts` (`TIGHT_ORB_DEG`), `glyphs.ts`,
`sheet-geometry.ts`, `svg-primitives.ts`.

### `aspect-web.ts`

**Domain purpose:** Aspect chord rendering across the wheel's inner circle (#42, #51).
**Responsibility:** Draws one chord per computed `Aspect` at a fixed radius, with display
filters (type/family/orb) and a cross-ring variant for bi-/tri-wheels; defines the
tight-orb threshold other panels reuse.
**Key dependencies:** `../astrology/aspects.js`, `../astrology/bodies.js`, `wheel.ts`.

### `astrochart-adapter.ts`

**Domain purpose:** Interop with the third-party `@astrodraw/astrochart` library.
**Responsibility:** The sole file translating Astraya's `ChartData` into that library's
`radix()` input shape; isolates the one external charting dependency from the rest of the
hand-rolled renderers.
**Key dependencies:** `../astrology/bodies.js`, `../domain/chart-compute.js`.

### `body-id.ts`

**Domain purpose:** Multi-ring body identification (#418).
**Responsibility:** Encodes/decodes a body's wheel identity as `key@ring` so a bi-wheel's
duplicate bodies (e.g. two Suns) are unambiguous to markup consumers and interpretation
lookups alike.
**Key dependencies:** none (pure string codec).

### `chart-sheet.ts`

**Domain purpose:** The whole printable/exportable chart sheet.
**Responsibility:** Composes the header, wheel and the three data panels (aspect matrix,
emphasis grid, degree strip) into one SVG document, laying panels out purely from each
panel's own returned height.
**Key dependencies:** `aspect-matrix.ts`, `degree-strip.ts`, `emphasis-grid.ts`,
`multi-wheel.ts`, `sheet-geometry.ts`, `svg-primitives.ts`.

### `cycle-diagram.ts`

**Domain purpose:** Planetary-cycle visualization (#410).
**Responsibility:** Plots a cycle's successive exact-aspect points around the zodiac and
joins them in sequence, revealing the geometric pattern (star, stepped rotation); supports
click-to-isolate dimming.
**Key dependencies:** `../astrology/signs.js`, `glyphs.ts`, `svg-primitives.ts`, `wheel.ts`.

### `declination-overlay.ts`

**Domain purpose:** Parallel/contraparallel declination overlay on the wheel (#32, #148).
**Responsibility:** Filters and draws declination contacts as chords between bodies'
ecliptic longitudes (declination itself has no wheel position).
**Key dependencies:** `../astrology/declinations.js`, `wheel.ts`.

### `degree-strip.ts`

**Domain purpose:** The 0-30° same-degree distribution strip.
**Responsibility:** Plots every body's position within its own sign on one shared linear
axis (sign dropped on purpose) to reveal same-degree clusters across different signs,
invisible on the wheel or in a table.
**Key dependencies:** `../astrology/signs.js`, `glyphs.ts`, `sheet-geometry.ts`,
`svg-primitives.ts`.

### `dial90.ts`

**Domain purpose:** The traditional cosmobiology 90-degree dial (#30, #148).
**Responsibility:** Renders the dial ring/ticks and plots each body at all four of its
dial arms (reusing the wheel's glyph collision-spreading), plus midpoint-tree hit markers.
**Key dependencies:** `../astrology/midpoints.js`, `glyph-layout.ts`, `wheel.ts`.

### `emphasis-grid.ts`

**Domain purpose:** The element x modality balance table under the wheel.
**Responsibility:** Renders the twelve element/modality cells with the bodies in each and
weighted marginal totals, so "is this chart fixed-water-heavy?" is readable at a glance.
**Key dependencies:** `../astrology/emphasis.js`, `../astrology/signs.js`, `glyphs.ts`,
`sheet-geometry.ts`, `svg-primitives.ts`.

### `extended-settings-presets.ts`

**Domain purpose:** Named tradition starting points for the Extended settings panel (#442).
**Responsibility:** Defines modern/traditional/vedic presets covering only the
profile-affecting half of settings (zodiac, house system, visible points, rulership), and
matches a current settings/rulership combination back to a preset or "Custom".
**Key dependencies:** `../astrology/ayanamsas.js`, `../astrology/rulership.js`,
`extended-settings.ts`.

### `extended-settings.ts`

**Domain purpose:** The Extended settings panel's single settings bag (#52).
**Responsibility:** Defines `ExtendedSettings` and the pure functions splitting it into
the three shapes its consumers need: chart-calculation options, point-visibility options,
and wheel sign-wedge style.
**Key dependencies:** `../astrology/aspects.js`, `../domain/chart-compute.js`,
`../domain/chart-tables.js`, `wheel.ts`.

### `glyph-layout.ts`

**Domain purpose:** Glyph collision avoidance on the wheel (#41).
**Responsibility:** Spreads overlapping body glyphs apart along the circular degree axis
(stelliums are the normal case, not an edge case) and renders the resulting glyph ring
with leader lines back to each body's true degree.
**Key dependencies:** `../astrology/signs.js`, `glyphs.ts`, `svg-primitives.ts`, `wheel.ts`.

### `glyph-variants.ts`

**Domain purpose:** Alternate glyph forms (#419).
**Responsibility:** Holds the device's chosen alternate drawn form for the two bodies with
a documented second historical shape (Uranus, Pluto), in all three symbol classes.
**Key dependencies:** none beyond its own module state (same subscribe/listener pattern as
`symbol-class.ts`/`glyph-weight.ts`).

### `glyph-weight.ts`

**Domain purpose:** Glyph stroke-weight setting (#419).
**Responsibility:** Holds the device-wide fine/regular/bold line-weight choice for drawn
glyphs, read by `renderGlyph` as a stroke-width override.
**Key dependencies:** none beyond its own module state.

### `glyphs.ts`

**Domain purpose:** The vector-path glyph registry (#40).
**Responsibility:** Defines every body/sign/aspect glyph as plain SVG primitives in a fixed
0-100 box (ported from Kerykeion, AGPL-3.0), and `renderGlyph`, which places one into any
SVG, honouring the symbol-class and glyph-weight settings.
**Key dependencies:** `glyph-variants.ts`, `glyph-weight.ts`, `symbol-class.ts`,
`symbol-text.ts`, `svg-primitives.ts`. Depended on by nearly every other renderer in this
directory.

### `jones-shape-diagram.ts`

**Domain purpose:** Jones chart-shape visualization (#401).
**Responsibility:** Draws a small standalone abstract diagram of the chart's Jones shape
(bundle/bowl/locomotive/splash/seesaw/bucket/splay), decoupled from the real wheel's
houses/signs/aspects.
**Key dependencies:** `../astrology/jones-shapes.js`, `svg-primitives.ts`, `wheel.ts`.

### `multi-wheel.ts`

**Domain purpose:** The chart wheel itself — single, bi-, or tri-wheel (#39, #51, #412).
**Responsibility:** The main renderer: draws one to three charts as concentric rings around
a shared anchor (the base ring's Ascendant), with glyphs, cusps, angles, aspect webs
(own-ring and cross-ring) and a corner legend, all through one implementation regardless of
ring count.
**Key dependencies:** `../astrology/aspects.js`, `../astrology/signs.js`, `aspect-web.ts`,
`glyph-layout.ts`, `glyphs.ts`, `sheet-geometry.ts`, `svg-primitives.ts`, `wheel.ts`. The
largest and most central renderer in the directory.

### `overlay-options.ts`

**Domain purpose:** Persisted overlay settings bridge (#148).
**Responsibility:** Resolves a saved chart's generic `settings` bag into typed
antiscia/declination/dial90/midpoint-tree display options, defaulting anything
missing/unrecognised.
**Key dependencies:** `../store/ops.js` (`JsonValue`).

### `sheet-geometry.ts`

**Domain purpose:** The chart sheet's single layout authority (#412).
**Responsibility:** Defines every radius, tick length, glyph size and font size as a
fraction of an 800px reference layout, scaled linearly to any requested sheet size; splits
the shared planet band into per-ring sub-bands for multi-wheels.
**Key dependencies:** none (pure geometry constants/functions). Depended on by
`multi-wheel.ts`, `aspect-matrix.ts`, `degree-strip.ts`, `emphasis-grid.ts`,
`chart-sheet.ts`.

### `standalone-svg.ts`

**Domain purpose:** Standalone SVG export support (#67).
**Responsibility:** Inlines a fixed, literal copy of `app.css`'s light-theme chart palette
into an exported SVG's `<style>` tag, so a downloaded file renders correctly with no
`app.css` present and works identically as a PNG-rasterization source.
**Key dependencies:** none (string manipulation only); implicitly coupled to `app.css`'s
class names, which it must be kept in sync with by hand.

### `svg-primitives.ts`

**Domain purpose:** Shared low-level SVG markup builders.
**Responsibility:** The single implementation of `line`/`circle`/`rect`/`polygon`/
`polyline`/`text`/`escapeXml`/`baselineOffset`/`fmt` that every renderer in this directory
uses, replacing what used to be near-identical per-file copies; never emits colour.
**Key dependencies:** none. Depended on by nearly every other file in this directory.

### `symbol-class.ts`

**Domain purpose:** Device-wide symbol-class setting (#419).
**Responsibility:** Holds whether charts draw hand-drawn glyphs, Unicode characters, or
text codes, as module state with a subscribe/listener pattern so every synchronous
renderer stays in sync without threading a parameter through all of them.
**Key dependencies:** none beyond its own module state.

### `symbol-text.ts`

**Domain purpose:** Non-drawn symbol forms (#419).
**Responsibility:** Provides the Unicode astrological character and three-letter ephemeris
text code for every body/sign/aspect the glyph registry covers.
**Key dependencies:** none (static lookup tables).

### `wheel-options.ts`

**Domain purpose:** Persisted wheel display settings bridge (#43).
**Responsibility:** Resolves a saved chart's generic `settings` bag into typed wheel
orientation/sweep/house-wedge/sign-wedge options, defaulting anything missing or
unrecognised so a cosmetic setting never blocks drawing.
**Key dependencies:** `../store/ops.js` (`JsonValue`), `wheel.ts`.

### `wheel.ts`

**Domain purpose:** The shared wheel coordinate system (#39).
**Responsibility:** Defines `wheelAngle`/`pointOnCircle`, the two functions every chart
layer uses to convert a longitude/radius into a screen point, plus the orientation/sweep/
wedge-style option types; pure geometry, draws nothing itself.
**Key dependencies:** none beyond ephemeris types. Depended on by nearly every other
renderer in this directory.
