# src/ephemeris/ — Map

Swiss Ephemeris boundary (only place `sweph-wasm` imported; lint-enforced). Rest of codebase uses `EphemerisProvider` interface.

- `assets.ts` — Pins exact data files, fixed-star catalog, WASM binary by size/SHA-256 (1800-2399 CE). Deps: none.
- `client.ts` — Web Worker client for `EphemerisProvider` (request/response, timeouts; restarts the worker after an engine abort, #1856, and latches after repeated aborts). Deps: protocol, types.
- `engine.ts` — Only `sweph-wasm` consumer; `SwissEphemerisEngine` implementation (bodies, houses, houses from an ARMC and rise/set/transit times (#1407), ayanamsas including a user-defined one (#1407), fixed stars with a full-size star-name buffer (#803), eclipse search, azimuth/altitude). Deps: assets, generated-constants, types.
- `finite-difference.ts` — Pinned sampling interval and circular-unwrap rate helper for non-body points' own motion (chart angles, Vertex, lots). Deps: types.
- `generated-constants.ts` — Swiss Ephemeris C library constants (body IDs, flags, ayanamsa modes) read from live `sweph-wasm` instance. Deps: none.
- `protocol.ts` — Wire contract between UI thread and ephemeris worker (request/response types, error serialization). Deps: types.
- `star-catalogue.ts` — Fixed-star naming data. Parses and searches the shipped `sefstars.txt`, hashes it for the stored source-file version, holds the user-star orb constant; stars are asked for by `,designation` (#803). Deps: none.
- `types.ts` — Engine-agnostic vocabulary (Degrees, JulianDayUT, BodyPosition, HousePositions, EphemerisProvider interface) and the Sunshine `needsSunDeclination` predicate. Deps: none.
- `worker.ts` — Web Worker host for engine; explicit `dispatch` switch, request queue. Deps: engine, protocol.
