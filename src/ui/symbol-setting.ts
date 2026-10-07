/**
 * Which class of symbols the charts and tables draw on this device (#419): the hand-drawn glyphs
 * (the default), the Unicode characters, or plain three-letter text. A device preference like the
 * planetary-rulers choice — never synced, never sent anywhere — read by every screen that draws a
 * symbol and changed from the chart's extended settings.
 *
 * The state itself lives in `chart/symbol-class.ts`, where the renderers can reach it; this file
 * keeps it in `localStorage`, loads it at start-up and gives React a hook. A change reaches the other
 * tabs through the browser's `storage` event.
 */
/**
 * @module ui/symbol-setting
 * @purpose Device preference (#419) for which class of symbols charts/tables draw: hand-drawn glyphs (default), Unicode characters, or plain three-letter text.
 * @conventions Device preference stored in localStorage, never synced; applied immediately at module load, before any screen draws a symbol, and propagated cross-tab via the `storage` event; delegates applied state to chart/symbol-class.js.
 * @exports SYMBOL_CLASS_KEY, readSymbolClass, writeSymbolClass, useSymbolClass
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_SYMBOL_CLASS,
  getSymbolClass,
  isSymbolClass,
  setSymbolClass,
  subscribeSymbolClass,
  type SymbolClass,
} from '../chart/symbol-class.js';

export const SYMBOL_CLASS_KEY = 'astraya:symbolClass';

/** The saved class, or the default when none is saved, it is not one of the three, or storage is unavailable. */
export function readSymbolClass(): SymbolClass {
  try {
    const stored = localStorage.getItem(SYMBOL_CLASS_KEY);
    return isSymbolClass(stored) ? stored : DEFAULT_SYMBOL_CLASS;
  } catch {
    return DEFAULT_SYMBOL_CLASS;
  }
}

/** Saves the class (when storage allows) and applies it, redrawing every screen that uses a symbol. */
export function writeSymbolClass(next: SymbolClass): void {
  try {
    localStorage.setItem(SYMBOL_CLASS_KEY, next);
  } catch {
    // Not remembered, but this page uses it until it is reloaded.
  }
  setSymbolClass(next);
}

// Applied the moment this module is first imported, before any screen has drawn a symbol.
if (typeof window !== 'undefined') {
  setSymbolClass(readSymbolClass());
  window.addEventListener('storage', (event) => {
    if (event.key === SYMBOL_CLASS_KEY) setSymbolClass(readSymbolClass());
  });
}

/** The current class, and a setter that saves it and redraws every screen using it. */
export function useSymbolClass(): readonly [SymbolClass, (next: SymbolClass) => void] {
  const current = useSyncExternalStore(subscribeSymbolClass, getSymbolClass, () => DEFAULT_SYMBOL_CLASS);
  const set = useCallback((next: SymbolClass) => {
    writeSymbolClass(next);
  }, []);
  return [current, set] as const;
}
