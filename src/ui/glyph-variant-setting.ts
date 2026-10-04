/**
 * Which form of Uranus and Pluto the charts draw on this device (#419). A device preference like the symbol class,
 * never synced: the state lives in `chart/glyph-variants.ts` where the renderers can reach it, and this keeps it in
 * `localStorage`, loads it at start-up and gives React a hook.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  getVariantChoice,
  setVariant,
  setVariantChoice,
  subscribeVariantChoice,
  VARIANT_DEFAULTS,
  type VariantBody,
  type VariantChoice,
} from '../chart/glyph-variants.js';

export const GLYPH_VARIANTS_KEY = 'astraya:glyphVariants';

/** The saved choice; anything missing, unknown or unreadable falls back to the default form. */
export function readVariantChoice(): Partial<Record<VariantBody, unknown>> {
  try {
    const stored = localStorage.getItem(GLYPH_VARIANTS_KEY);
    if (stored === null) return {};
    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Saves the form chosen for a body (when storage allows) and applies it, redrawing every screen that uses it. */
export function writeVariant(body: VariantBody, key: string): void {
  setVariant(body, key);
  try {
    localStorage.setItem(GLYPH_VARIANTS_KEY, JSON.stringify(getVariantChoice()));
  } catch {
    // Not remembered, but this page uses it until it is reloaded.
  }
}

// Applied the moment this module is first imported, before any screen has drawn a symbol.
if (typeof window !== 'undefined') {
  setVariantChoice(readVariantChoice());
  window.addEventListener('storage', (event) => {
    if (event.key === GLYPH_VARIANTS_KEY) setVariantChoice(readVariantChoice());
  });
}

const DEFAULTS: VariantChoice = VARIANT_DEFAULTS;

/** The current forms, and a setter that saves one and redraws every screen using it. */
export function useGlyphVariants(): readonly [VariantChoice, (body: VariantBody, key: string) => void] {
  const choice = useSyncExternalStore(subscribeVariantChoice, getVariantChoice, () => DEFAULTS);
  const set = useCallback((body: VariantBody, key: string) => {
    writeVariant(body, key);
  }, []);
  return [choice, set] as const;
}
