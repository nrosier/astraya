# src/ephemeris/ — Map

Swiss Ephemeris boundary (only place `sweph-wasm` imported; lint-enforced). Rest of codebase uses `EphemerisProvider` interface.

- `assets.ts` — Pins exact data files, fixed-star catalog, WASM binary by size/SHA-256 (1800-2399 CE). Deps: none.
- `client.ts` — Web Worker client for `EphemerisProvider` (request/response, timeouts, fatal-error latching). Deps: protocol, types.
- `engine.ts` — Only `sweph-wasm` consumer; `SwissEphemerisEngine` implementation (bodies, houses, ayanamsas, fixed stars, eclipse search, azimuth/altitude). Deps: assets, generated-constants, types.
- `generated-constants.ts` — Swiss Ephemeris C library constants (body IDs, flags, ayanamsa modes) read from live `sweph-wasm` instance. Deps: none.
- `protocol.ts` — Wire contract between UI thread and ephemeris worker (request/response types, error serialization). Deps: types.
- `types.ts` — Engine-agnostic vocabulary (Degrees, JulianDayUT, BodyPosition, HousePositions, EphemerisProvider interface). Deps: none.
- `worker.ts` — Web Worker host for engine; explicit `dispatch` switch, request queue. Deps: engine, protocol.
