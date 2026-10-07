# src/pwa/ — Map

Service worker caching: strategy selection, cache naming/eviction, and precaching,
versioned by release so stale caches evict cleanly and an offline-first visit
always has what it needs.

### `cache-names.ts`
Domain Purpose: makes cache eviction trivial across releases. Responsibility: computes version-scoped Cache Storage names for the app shell and the ephemeris assets separately, and lists which existing caches (under this app's own prefix) belong to an older version. Key Dependencies: no imports; used by `sw-core.ts`, `warm.ts`, `warm-status.ts`.

### `routing.ts`
Domain Purpose: decides, per incoming request, which caching behaviour applies — the one piece of actual logic in the service worker, kept pure and unit-testable. Responsibility: classifies a request into `bypass`/`ephemeris`/`shell-asset`/`shell-navigate`, always bypassing cross-origin requests, `/api/`, and the OIDC callback path (never cached, #383). Key Dependencies: no imports (the OIDC callback path is hardcoded rather than imported from `src/ui/oidc-pkce.ts`, since this module is bundled into the service worker, which must never pull in `src/ui/`); used by `sw-core.ts`.

### `strategies.ts`
Domain Purpose: implements the two caching behaviours the service worker needs, as plain functions testable without a browser. Responsibility: `cacheFirst` for immutable per-release assets (ephemeris data, hashed build assets); `staleWhileRevalidate` for navigation, serving a cached shell immediately while refetching in the background. Key Dependencies: no imports; used by `sw-core.ts`, and its `CacheStorageLike` interface is reused by `warm.ts`.

### `sw-core.ts`
Domain Purpose: the service worker's actual install/activate/fetch/message behaviour, expressed over a minimal scope interface so the real logic is testable with a fake scope instead of a real browser. Responsibility: precaches the app shell manifest on install (tolerating partial failure, #336), evicts stale caches on activate, dispatches fetches per `routing.ts`'s classification using `strategies.ts`, and only ever calls `skipWaiting` on an explicit `'skip-waiting'` message. Key Dependencies: `routing.ts`, `strategies.ts`, `cache-names.ts`; driven by `src/sw.ts` with the real worker scope.

### `register.ts`
Domain Purpose: client-side service worker registration and the explicit update-confirmation flow (#99), so a visitor's app is never silently swapped mid-session. Responsibility: registers the service worker, watches for a waiting worker, exposes subscribable `UpdateState`, and only sends `'skip-waiting'` after the UI (`PwaStatus.tsx`) confirms via `applyUpdate()`. Key Dependencies: browser APIs only (`navigator.serviceWorker`); the actual decision logic it wires to lives in `sw-core.ts`.

### `warm.ts`
Domain Purpose: ensures the ephemeris cache is populated before the first offline session, rather than discovering a missing asset mid-chart (#100). Responsibility: fetches and caches every ephemeris asset not already cached, reporting byte progress, and throws immediately (never swallows) on any failed fetch. Key Dependencies: `ALL_ASSETS`/`EPHE_BASE_URL`/`EphemerisAsset` from `src/ephemeris/assets.js`, `ephemerisCacheName` from `cache-names.ts`, `CacheStorageLike` from `strategies.ts`; wrapped by `warm-status.ts`.

### `warm-status.ts`
Domain Purpose: the UI-facing subscribable wrapper around the ephemeris cache warm-up. Responsibility: runs `warmEphemerisCache` at most once per page load, gated on `navigator.onLine`, and exposes a subscribable `WarmState` (idle/warming/done/failed) for display. Key Dependencies: `ALL_ASSETS` from `src/ephemeris/assets.js`, `APP_VERSION` from `src/version.js`, `warmEphemerisCache`/`WarmProgress` from `warm.ts`; consumed by PWA status UI.
