/**
 * How heavy the drawn symbols' lines are (#419): fine, regular (the default) or bold. A line weight is a style of
 * the same artwork, not a different artwork, so it needs no new paths and no new licence: the glyphs' outlines are
 * drawn with a stroke width that `renderGlyph` overrides through a CSS custom property when the weight is not regular.
 *
 * Held as module state like the symbol class (`symbol-class.ts`), for the same reason: a dozen synchronous renderers
 * all end in `renderGlyph`, and one setting every one of them must honour is not something to thread through each.
 */
/**
 * @module chart/glyph-weight
 * @purpose Holds the device-wide line-weight setting (fine/regular/bold) for drawn glyph strokes, read by `renderGlyph`.
 * @conventions Module-level mutable state with a subscribe/listener pattern, the same convention as `symbol-class.ts`/`glyph-variants.ts`; weight is applied as a stroke-width override, not new artwork, since it is a style of the same glyph paths (regular's 6 is the width the artwork was originally drawn for).
 * @exports GLYPH_WEIGHTS, DEFAULT_GLYPH_WEIGHT, GLYPH_STROKE, isGlyphWeight, getGlyphWeight, setGlyphWeight, subscribeGlyphWeight; GlyphWeight type.
 */
export type GlyphWeight = 'fine' | 'regular' | 'bold';

export const GLYPH_WEIGHTS: readonly GlyphWeight[] = ['fine', 'regular', 'bold'];

export const DEFAULT_GLYPH_WEIGHT: GlyphWeight = 'regular';

/** The outline stroke width in the glyphs' 0-100 box; regular is the 6 the artwork was drawn for. */
export const GLYPH_STROKE: Readonly<Record<GlyphWeight, number>> = { fine: 3.5, regular: 6, bold: 9 };

export function isGlyphWeight(value: unknown): value is GlyphWeight {
  return typeof value === 'string' && (GLYPH_WEIGHTS as readonly string[]).includes(value);
}

let current: GlyphWeight = DEFAULT_GLYPH_WEIGHT;
const listeners = new Set<() => void>();

export function getGlyphWeight(): GlyphWeight {
  return current;
}

export function setGlyphWeight(next: GlyphWeight): void {
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeGlyphWeight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
