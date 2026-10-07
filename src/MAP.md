# src/ — Root (browsable only)

Index to subdirectories. See each subdirectory's own MAP.md:

- **src/astrology/** — Pure astrological calculation layer (aspects, dignities, sect, Arabic parts, fixed stars, declinations).
- **src/chart/** — Hand-rolled SVG chart rendering (wheels, glyphs, cusps, aspects, legend).
- **src/domain/** — Single source of truth: chart composition, computed properties, entity shapes.
- **src/ephemeris/** — Swiss Ephemeris boundary (only place `sweph-wasm` may be imported); `EphemerisProvider` interface.
- **src/interpretation/** — Prose composition pipeline: corpus lookups, Tier 2 LLM client, custom instructions, result storage.
- **src/pwa/** — Service worker (install/activate/fetch routing, cache strategy, offline-first precaching).
- **src/store/** — IndexedDB op-log: HLC-ordered operations, last-write-wins fold, persistence.
- **src/sync/** — Fetch clients to server routes (auth, admin, ops, corpus overrides/candidates).
- **src/time/** — Birth-moment resolution: timezone, DST, calendar handling, URL encoding.
- **src/types/** — Ambient `.d.ts` for untyped dependencies.
- **src/ui/** — React SPA: root router, 150+ components (screens, panels, forms, glyphs), sticky header.

Root files:
- **demo-mode.ts** — `IS_DEMO_MODE` flag for GitHub Pages deployment (serverless). Checked by sign-in/sync UI.
- **main.tsx** — App entry: theme flash prevention, stale localStorage cleanup, mount under StrictMode.
- **sw.ts** — Service worker entry (thin wrapper, real logic in `pwa/sw-core.ts`).
- **trace.ts** — Optional diagnostic tracing (no-op unless `localStorage['astraya:trace']` set).
- **version.ts** — Build-time version/commit/timestamp constants and AGPL source-disclosure URL.
