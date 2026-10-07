# src/ — Map (root files only)

Covers only the files directly in `src/` root. See each subdirectory's own MAP.md
for everything else: `src/astrology/MAP.md` for astrology/, `src/chart/MAP.md` for
chart/, `src/domain/MAP.md` for domain/, `src/ephemeris/MAP.md` for ephemeris/,
`src/interpretation/MAP.md` for interpretation/, `src/pwa/MAP.md` for pwa/,
`src/store/MAP.md` for store/, `src/sync/MAP.md` for sync/, `src/time/MAP.md`
for time/, `src/types/MAP.md` for types/, `src/ui/MAP.md` for ui/.

### `demo-mode.ts`
Domain Purpose: identifies the static, serverless `demo` build (GitHub Pages, no server component) so UI code can behave accordingly. Responsibility: exports `IS_DEMO_MODE`, a boolean derived from Vite's build `MODE`. Key Dependencies: no imports; checked by `AccountPanel.tsx` and `session-context.tsx` to skip sign-in/sync.

### `main.tsx`
Domain Purpose: the application's entry point. Responsibility: applies the stored theme before first render (avoiding a flash of the OS-default theme, #70), clears a stale localStorage key from a removed preference (#429), and mounts `<App />` into `#root` under `StrictMode`. Key Dependencies: `ui/App.js`, `ui/theme-dom.js`, `ui/app.css`.

### `sw.ts`
Domain Purpose: thin service worker entry point. Responsibility: self-starts `installServiceWorker` with the real `ServiceWorkerGlobalScope` and build-time version/base-path constants, guarded so the module stays importable from tests. Key Dependencies: `installServiceWorker`/`ServiceWorkerScope` from `pwa/sw-core.js`; built separately by `vite.sw.config.ts` into `dist/sw.js`.

### `trace.ts`
Domain Purpose: opt-in diagnostic tracing for hard-to-reason-about async handoffs (#372), such as the login → sync → op-log fold → React re-render pipeline. Responsibility: exports `trace()`, a no-op unless `localStorage['astraya:trace']` is set, logging via `console.debug` with a `[trace:` prefix. Key Dependencies: no imports; called ad hoc from across the codebase at points worth tracing.

### `version.ts`
Domain Purpose: exposes build-time version/commit/timestamp info to the running app, satisfying both the in-app changelog and the AGPL source-disclosure obligation. Responsibility: re-exports Vite-`define`-substituted `__APP_VERSION__`/`__APP_COMMIT__`/`__APP_BUILT_AT__` globals as typed constants, and derives `SOURCE_URL_FOR_BUILD`/`sourceFileUrl` pinned to the build's commit. Key Dependencies: no imports; `APP_VERSION` is consumed by `pwa/warm-status.ts` and other version-displaying UI.
