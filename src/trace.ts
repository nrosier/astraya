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
 * @conventions Enabled per-browser via `localStorage.setItem('astraya:trace', '1')`; every call re-reads the flag so it can be toggled without a reload; logs go to `console.debug` with a `[trace:` prefix.
 * @exports trace
 */
export function trace(scope: string, message: string, data?: Record<string, unknown>): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem('astraya:trace') !== '1') return;
  console.debug(`[trace:${scope}] ${message}`, data ?? {});
}
