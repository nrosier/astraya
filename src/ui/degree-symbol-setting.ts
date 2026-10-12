/**
 * Whether degree-symbol (Sabian symbol, #405/#484) paragraphs show in the Report at all (#527):
 * a persisted, per-device preference — not a synced account setting, and not a standing draft
 * that needs an explicit "Apply". Same localStorage + custom-event + `useSyncExternalStore` shape
 * as `workspace-rail-setting.ts`. Defaults to shown (`true`), the behavior before this toggle
 * existed, so leaving it untouched changes nothing for an existing reader.
 */
/**
 * @module ui/degree-symbol-setting
 * @purpose Persisted device preference for showing/hiding degree-symbol (Sabian symbol) paragraphs in ReportView.tsx (#527).
 * @conventions Same localStorage + CHANGED_EVENT + useSyncExternalStore shape as workspace-rail-setting.ts; read/write are try/catch no-ops when storage is unusable, falling back to the shown-by-default value rather than throwing.
 * @exports DEGREE_SYMBOL_KEY, readShowDegreeSymbol, writeShowDegreeSymbol, useShowDegreeSymbol
 */
import { useSyncExternalStore } from 'react';

export const DEGREE_SYMBOL_KEY = 'astraya:showDegreeSymbol';
const CHANGED_EVENT = 'astraya:show-degree-symbol-changed';

export function readShowDegreeSymbol(): boolean {
  try {
    const stored = localStorage.getItem(DEGREE_SYMBOL_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function writeShowDegreeSymbol(show: boolean): void {
  try {
    localStorage.setItem(DEGREE_SYMBOL_KEY, show ? 'true' : 'false');
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useShowDegreeSymbol(): readonly [boolean, (next: boolean) => void] {
  const show = useSyncExternalStore(subscribe, readShowDegreeSymbol, () => true);
  const set = (next: boolean): void => {
    writeShowDegreeSymbol(next);
  };
  return [show, set] as const;
}
