/**
 * Toggleable diagnostic tracing for hard-to-reason-about async handoffs (#372: the
 * login → sync → op-log fold → React re-render pipeline). Off by default, and free
 * when off — every call site pays one `localStorage` read, nothing else.
 *
 * Enable from the browser console: `localStorage.setItem('astraya:trace', '1')`,
 * then reproduce. No reload needed — every call re-reads the flag, so it can be
 * flipped on right before the action you want to trace. Logs land in the normal
 * console as `console.debug`, filterable by the `[trace:` prefix.
 */

/**
 * @module trace
 * @purpose Opt-in diagnostic tracing for hard-to-reason-about async handoffs (#372), off and free by default.
 * @conventions Enabled per-browser via `localStorage.setItem('astraya:trace', '1')`; every call re-reads the flag so it can be toggled without a reload; logs go to `console.debug` with a `[trace:` prefix. Diagnostics must never affect control flow or emit warnings (#492): guarded for a non-browser runtime and for denied storage, both as best-effort no-ops.
 * @exports trace
 */
export function trace(scope: string, message: string, data?: Record<string, unknown>): void {
  // `typeof window === 'undefined'` rather than `typeof localStorage === 'undefined'`: under
  // Node (allowed by `engines.node >=24`), merely referencing the `localStorage` global triggers
  // `ExperimentalWarning: localStorage is not available because --localstorage-file was not
  // provided` — this check must never touch that identifier outside a browser (#492).
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem('astraya:trace') !== '1') return;
  } catch {
    // Denied storage (e.g. a hardened browser throwing SecurityError) must not propagate from a
    // diagnostic helper — callers like store.ts call this between persistence and listener
    // notification, where a thrown error would wrongly abort an already-committed mutation.
    return;
  }
  console.debug(`[trace:${scope}] ${message}`, data ?? {});
}
