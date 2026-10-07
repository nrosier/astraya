/**
 * True for the `demo` build (`npm run build:demo`) served at
 * https://nrosier.github.io/astraya/ — a fully static GitHub Pages deploy with
 * no server component at all. `AccountPanel.tsx` and `session-context.tsx`
 * check this to skip sign-in/sync entirely rather than calling a `/api/*`
 * endpoint that doesn't exist there.
 */

/**
 * @module demo-mode
 * @purpose Flag identifying the static, serverless `demo` build so UI code can skip sign-in/sync entirely.
 * @conventions Derived from Vite's `MODE` at build time, not a runtime check.
 * @exports IS_DEMO_MODE
 */
export const IS_DEMO_MODE = import.meta.env.MODE === 'demo';
