/**
 * The two-form symbols (#419): Uranus and Pluto are drawn in either of two recognised ways, the choice reaches every
 * renderer through `bodyGlyph`, and an alternate form cannot exist without all three symbol classes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALTERNATE_FORMS,
  chosenAlternate,
  getVariantChoice,
  isVariantKey,
  setVariant,
  setVariantChoice,
  subscribeVariantChoice,
  VARIANT_BODIES,
  VARIANT_DEFAULTS,
  VARIANT_KEYS,
} from '../src/chart/glyph-variants.js';
import { bodyGlyph, renderGlyph } from '../src/chart/glyphs.js';
import { DEFAULT_SYMBOL_CLASS, setSymbolClass } from '../src/chart/symbol-class.js';

afterEach(() => {
  setVariantChoice({});
  setSymbolClass(DEFAULT_SYMBOL_CLASS);
});

describe('the variant registry', () => {
  it('has, for every non-default form of every body, drawn elements, a Unicode character and a three-letter code', () => {
    for (const body of VARIANT_BODIES) {
      const alternates = VARIANT_KEYS[body].filter((key) => key !== VARIANT_DEFAULTS[body]);
      expect(alternates.length, `${body} has an alternate form`).toBeGreaterThan(0);
      for (const key of alternates) {
        const form = ALTERNATE_FORMS[body][key];
        expect(form, `${body} ${key}`).toBeDefined();
        expect(form?.elements.length).toBeGreaterThan(0);
        expect(form?.unicode).toBeTruthy();
        expect(form?.text).toMatch(/^[A-Z]{3}$/);
      }
    }
  });

  it('keeps the form drawn today as every body’s default', () => {
    expect(VARIANT_DEFAULTS).toEqual({ uranus: 'h', pluto: 'orb' });
    expect(getVariantChoice()).toEqual(VARIANT_DEFAULTS);
    for (const body of VARIANT_BODIES) expect(chosenAlternate(body)).toBeUndefined();
  });
});

describe('choosing a form', () => {
  it('changes what bodyGlyph draws for that body only, and back again', () => {
    const uranusH = bodyGlyph('uranus');
    const pluto = bodyGlyph('pluto');
    setVariant('uranus', 'astronomical');
    expect(bodyGlyph('uranus')?.elements).not.toEqual(uranusH?.elements);
    expect(bodyGlyph('uranus')?.elements.join('')).toContain('<circle');
    expect(bodyGlyph('pluto')).toBe(pluto);
    setVariant('uranus', 'h');
    expect(bodyGlyph('uranus')).toBe(uranusH);
  });

  it('is written in the other symbol classes too: the Unicode form follows, the text code is unchanged', () => {
    setVariant('uranus', 'astronomical');
    setSymbolClass('unicode');
    const definition = bodyGlyph('uranus');
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    expect(renderGlyph(definition, 50, 50, 20, 'chart-glyph')).toContain('⛢');
    setSymbolClass('text');
    expect(renderGlyph(definition, 50, 50, 20, 'chart-glyph')).toContain('URA');
    setSymbolClass('unicode');
    setVariant('uranus', 'h');
    const plain = bodyGlyph('uranus');
    if (plain === undefined) return;
    expect(renderGlyph(plain, 50, 50, 20, 'chart-glyph')).toContain('♅');
  });

  it('draws the PL monogram for Pluto, and still ♇ in Unicode for either Pluto form', () => {
    setVariant('pluto', 'monogram');
    expect(bodyGlyph('pluto')?.elements.join('')).not.toBe(bodyGlyph('sun')?.elements.join(''));
    setSymbolClass('unicode');
    const monogram = bodyGlyph('pluto');
    if (monogram === undefined) return;
    expect(renderGlyph(monogram, 50, 50, 20, 'chart-glyph')).toContain('♇');
    setVariant('pluto', 'orb');
    const orb = bodyGlyph('pluto');
    if (orb === undefined) return;
    expect(renderGlyph(orb, 50, 50, 20, 'chart-glyph')).toContain('♇');
  });

  it('ignores a form that does not exist, and tells a subscriber only about real changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeVariantChoice(listener);
    setVariant('uranus', 'nonsense');
    setVariant('uranus', 'h');
    expect(listener).not.toHaveBeenCalled();
    setVariant('uranus', 'astronomical');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isVariantKey('pluto', 'monogram')).toBe(true);
    expect(isVariantKey('pluto', 'astronomical')).toBe(false);
    unsubscribe();
  });

  it('loads a saved choice, falling back to the default for anything unknown', () => {
    setVariantChoice({ uranus: 'astronomical', pluto: 'banana' });
    expect(getVariantChoice()).toEqual({ uranus: 'astronomical', pluto: 'orb' });
  });
});
