// @vitest-environment jsdom
/** The saved choice of Uranus and Pluto forms (#419): written to the device, read back, and bad data ignored. */
import { afterEach, describe, expect, it } from 'vitest';
import { getVariantChoice, setVariantChoice } from '../src/chart/glyph-variants.js';
import { GLYPH_VARIANTS_KEY, readVariantChoice, writeVariant } from '../src/ui/glyph-variant-setting.js';

afterEach(() => {
  localStorage.clear();
  setVariantChoice({});
});

describe('glyph variant setting', () => {
  it('saves a chosen form and reads it back', () => {
    writeVariant('uranus', 'astronomical');
    expect(getVariantChoice().uranus).toBe('astronomical');
    expect(JSON.parse(localStorage.getItem(GLYPH_VARIANTS_KEY) ?? '{}')).toEqual({
      uranus: 'astronomical',
      pluto: 'orb',
    });
    setVariantChoice({});
    setVariantChoice(readVariantChoice());
    expect(getVariantChoice().uranus).toBe('astronomical');
  });

  it('reads nothing from missing or corrupt storage', () => {
    expect(readVariantChoice()).toEqual({});
    localStorage.setItem(GLYPH_VARIANTS_KEY, '{not json');
    expect(readVariantChoice()).toEqual({});
    localStorage.setItem(GLYPH_VARIANTS_KEY, '"a string"');
    expect(readVariantChoice()).toEqual({});
  });
});
