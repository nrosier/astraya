/** The drawn symbols' line weight (#419): a style of the same artwork, carried to every renderer and the export. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GLYPH_WEIGHT,
  getGlyphWeight,
  GLYPH_STROKE,
  GLYPH_WEIGHTS,
  isGlyphWeight,
  setGlyphWeight,
  subscribeGlyphWeight,
} from '../src/chart/glyph-weight.js';
import { bodyGlyph, renderGlyph } from '../src/chart/glyphs.js';
import { standaloneSvg } from '../src/chart/standalone-svg.js';
import { setSymbolClass } from '../src/chart/symbol-class.js';

afterEach(() => {
  setGlyphWeight(DEFAULT_GLYPH_WEIGHT);
  setSymbolClass('drawn');
});

function draw(): string {
  const definition = bodyGlyph('mars');
  if (definition === undefined) throw new Error('fixture bug: no Mars glyph');
  return renderGlyph(definition, 50, 50, 20, 'chart-glyph');
}

describe('glyph weight', () => {
  it('is regular by default, which draws exactly what it always did', () => {
    expect(getGlyphWeight()).toBe('regular');
    expect(GLYPH_WEIGHTS).toEqual(['fine', 'regular', 'bold']);
    expect(draw()).not.toContain('--glyph-stroke');
  });

  it('is fine below regular and bold above it, and a heavier weight is a wider stroke', () => {
    expect(GLYPH_STROKE.fine).toBeLessThan(GLYPH_STROKE.regular);
    expect(GLYPH_STROKE.bold).toBeGreaterThan(GLYPH_STROKE.regular);
    expect(isGlyphWeight('bold')).toBe(true);
    expect(isGlyphWeight('heavy')).toBe(false);
  });

  it('reaches the drawn symbols as a custom property, and back to nothing when regular again', () => {
    setGlyphWeight('bold');
    expect(draw()).toContain(`style="--glyph-stroke:${String(GLYPH_STROKE.bold)}"`);
    setGlyphWeight('fine');
    expect(draw()).toContain(`style="--glyph-stroke:${String(GLYPH_STROKE.fine)}"`);
    setGlyphWeight('regular');
    expect(draw()).not.toContain('--glyph-stroke');
  });

  it('does not touch the text and Unicode classes, which have no strokes', () => {
    setGlyphWeight('bold');
    setSymbolClass('text');
    expect(draw()).not.toContain('--glyph-stroke');
  });

  it('is read by the exported stylesheet, so the weight travels with an SVG', () => {
    const svg = standaloneSvg('<svg></svg>');
    expect(svg).toContain('stroke-width: var(--glyph-stroke, 6)');
  });

  it('tells a subscriber only about real changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGlyphWeight(listener);
    setGlyphWeight('regular');
    expect(listener).not.toHaveBeenCalled();
    setGlyphWeight('bold');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
