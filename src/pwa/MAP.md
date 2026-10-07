# src/pwa/ — Map

Service worker caching: strategy selection, cache naming/eviction, precaching. Versioned by release for clean stale-cache eviction.

- `cache-names.ts` — Version-scoped Cache Storage names (app shell + ephemeris assets separately). Lists old-version caches for eviction. Deps: none.
- `routing.ts` — Request → caching behaviour (`bypass`/`ephemeris`/`shell-asset`/`shell-navigate`). Always bypass cross-origin, `/api/`, OIDC callback. Deps: none.
- `strategies.ts` — Pure caching functions: `cacheFirst` for immutable per-release assets, `staleWhileRevalidate` for navigation. Testable, no browser scope. Deps: none.
- `sw-core.ts` — Service worker install/activate/fetch/message behaviour over minimal scope interface (testable with fake scope). Precaches shell on install, evicts stale caches, dispatches via `routing` + `strategies`, only `skipWaiting` on explicit message. Deps: routing, strategies, cache-names.
- `register.ts` — Client-side registration + explicit update-confirmation (#99). Subscribable `UpdateState`, only `skipWaiting` after UI confirms. Deps: browser APIs.
- `warm.ts` — Ephemeris cache pre-population before first offline session. Fetches/caches all assets, byte progress, throws on failed fetch. Deps: ephemeris/assets, cache-names, strategies.
- `warm-status.ts` — UI-facing subscribable wrapper around cache warm-up. Gated on `navigator.onLine`, exposes `WarmState` (idle/warming/done/failed). Deps: ephemeris/assets, version, warm.
