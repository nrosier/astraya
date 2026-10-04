/**
 * Which form of Uranus and Pluto the charts draw on this device (#419). A device preference like the symbol class,
 * never synced: the state lives in `chart/glyph-variants.ts` where the renderers can reach it, and this keeps it in
 * `localStorage`, loads it at start-up and gives React a hook.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_GLYPH_WEIGHT,
  getGlyphWeight,
  isGlyphWeight,
  setGlyphWeight,
  subscribeGlyphWeight,
  type GlyphWeight,
} from '../chart/glyph-weight.js';
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
export const GLYPH_WEIGHT_KEY = 'astraya:glyphWeight';

/** The saved line weight, or the default when none is saved, it is unknown or storage is unavailable. */
export function readGlyphWeight(): GlyphWeight {
  try {
    const stored = localStorage.getItem(GLYPH_WEIGHT_KEY);
    return isGlyphWeight(stored) ? stored : DEFAULT_GLYPH_WEIGHT;
  } catch {
    return DEFAULT_GLYPH_WEIGHT;
  }
}

/** Saves the line weight (when storage allows) and applies it, redrawing every screen that uses a symbol. */
export function writeGlyphWeight(next: GlyphWeight): void {
  try {
    localStorage.setItem(GLYPH_WEIGHT_KEY, next);
  } catch {
    // Not remembered, but this page uses it until it is reloaded.
  }
  setGlyphWeight(next);
}

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
  setGlyphWeight(readGlyphWeight());
  window.addEventListener('storage', (event) => {
    if (event.key === GLYPH_VARIANTS_KEY) setVariantChoice(readVariantChoice());
    if (event.key === GLYPH_WEIGHT_KEY) setGlyphWeight(readGlyphWeight());
  });
}

/** The forms and the line weight of the drawn symbols: one object, so a change to either redraws what depends on it. */
export type GlyphLook = VariantChoice & { readonly weight: GlyphWeight };

/** The current forms and line weight, and setters that save one and redraw every screen using it. */
export function useGlyphVariants(): readonly [
  GlyphLook,
  (body: VariantBody, key: string) => void,
  (weight: GlyphWeight) => void,
] {
  const choice = useSyncExternalStore(subscribeVariantChoice, getVariantChoice, () => VARIANT_DEFAULTS);
  const weight = useSyncExternalStore(subscribeGlyphWeight, getGlyphWeight, () => DEFAULT_GLYPH_WEIGHT);
  const look = useMemo<GlyphLook>(() => ({ ...choice, weight }), [choice, weight]);
  const set = useCallback((body: VariantBody, key: string) => {
    writeVariant(body, key);
  }, []);
  const setWeight = useCallback((next: GlyphWeight) => {
    writeGlyphWeight(next);
  }, []);
  return [look, set, setWeight] as const;
}
