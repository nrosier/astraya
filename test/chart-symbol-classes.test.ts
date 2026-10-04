/**
 * The three classes of symbols (#419): the drawn glyphs (the default), the Unicode characters and the
 * three-letter text. Every body, sign and aspect the registry draws must have all three, so a symbol added
 * to the registry without a written form fails here instead of drawing nothing in the other classes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASPECTS } from '../src/astrology/aspects.js';
import { BODIES, bodyByKey } from '../src/astrology/bodies.js';
import { SIGNS } from '../src/astrology/signs.js';
import { aspectGlyph, bodyGlyph, renderGlyph, signGlyph } from '../src/chart/glyphs.js';
import { renderAspectMatrixSvg } from '../src/chart/aspect-matrix.js';
import { renderMultiWheelSvg, type WheelRingInput } from '../src/chart/multi-wheel.js';
import type { HousePositions } from '../src/ephemeris/types.js';
import {
  DEFAULT_SYMBOL_CLASS,
  getSymbolClass,
  isSymbolClass,
  setSymbolClass,
  subscribeSymbolClass,
  SYMBOL_CLASSES,
} from '../src/chart/symbol-class.js';
import { standaloneSvg } from '../src/chart/standalone-svg.js';
import { textSymbol, unicodeSymbol } from '../src/chart/symbol-text.js';

afterEach(() => {
  setSymbolClass(DEFAULT_SYMBOL_CLASS);
});

const BODY_KEYS = [...BODIES.map((body) => body.key), 'southNode'];
const SIGN_NAMES = SIGNS.map((sign) => sign.name);
const ASPECT_KEYS = ASPECTS.map((aspect) => aspect.key);

describe('the symbol class', () => {
  it('is drawn by default, knows its three values and notifies a subscriber of a change', () => {
    expect(getSymbolClass()).toBe('drawn');
    expect(SYMBOL_CLASSES).toEqual(['drawn', 'unicode', 'text']);
    expect(isSymbolClass('text')).toBe(true);
    expect(isSymbolClass('bold')).toBe(false);
    const listener = vi.fn();
    const unsubscribe = subscribeSymbolClass(listener);
    setSymbolClass('text');
    setSymbolClass('text'); // no change, no notification
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSymbolClass('unicode');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('every symbol can be written in every class', () => {
  it('has a Unicode character and a three-letter code for every body, sign and aspect the registry draws', () => {
    for (const key of BODY_KEYS) {
      expect(bodyGlyph(key), `drawn body ${key}`).toBeDefined();
      expect(unicodeSymbol('body', key), `unicode body ${key}`).toBeTruthy();
      expect(textSymbol('body', key), `text body ${key}`).toMatch(/^[A-Z]{3}$/);
    }
    for (const name of SIGN_NAMES) {
      expect(signGlyph(name), `drawn sign ${name}`).toBeDefined();
      expect(unicodeSymbol('sign', name), `unicode sign ${name}`).toBeTruthy();
      expect(textSymbol('sign', name), `text sign ${name}`).toMatch(/^[A-Z]{3}$/);
    }
    for (const key of ASPECT_KEYS) {
      expect(aspectGlyph(key), `drawn aspect ${key}`).toBeDefined();
      expect(unicodeSymbol('aspect', key), `unicode aspect ${key}`).toBeTruthy();
      expect(textSymbol('aspect', key), `text aspect ${key}`).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('keeps the three-letter codes distinct within a kind, so a reader can tell two symbols apart', () => {
    for (const [kind, keys] of [
      ['body', BODY_KEYS],
      ['sign', SIGN_NAMES],
      ['aspect', ASPECT_KEYS],
    ] as const) {
      const codes = keys.map((key) => textSymbol(kind, key));
      expect(new Set(codes).size, kind).toBe(codes.length);
    }
  });

  it('asks for the text presentation of a sign, so a system does not draw it as a colour emoji', () => {
    for (const name of SIGN_NAMES) expect(unicodeSymbol('sign', name)?.endsWith('︎')).toBe(true);
  });
});

describe('renderGlyph in each class', () => {
  const sun = bodyGlyph('sun');
  const aries = signGlyph('Aries');
  if (sun === undefined || aries === undefined) throw new Error('fixture bug: no Sun or Aries glyph');

  it('draws paths in the default class and text in the others, in the same box', () => {
    const drawn = renderGlyph(sun, 100, 80, 20, 'chart-glyph', 'data-body="sun"');
    expect(drawn).toContain('<circle');
    expect(drawn).not.toContain('<text');

    setSymbolClass('text');
    const text = renderGlyph(sun, 100, 80, 20, 'chart-glyph', 'data-body="sun"');
    expect(text).toContain('>SUN</text>');
    expect(text).toContain('chart-symbol-text-text');
    expect(text).not.toContain('<circle');

    setSymbolClass('unicode');
    const unicode = renderGlyph(sun, 100, 80, 20, 'chart-glyph', 'data-body="sun"');
    expect(unicode).toContain('>☉</text>');
    expect(unicode).toContain('chart-symbol-text-unicode');

    // The wrapper, its transform, its classes and its isolation attributes are the same in every class.
    const wrapper = (markup: string): string => markup.slice(0, markup.indexOf('>') + 1);
    expect(wrapper(text)).toBe(wrapper(drawn));
    expect(wrapper(unicode)).toBe(wrapper(drawn));
    expect(wrapper(drawn)).toContain('data-body="sun"');
  });

  it('writes a sign in text and in Unicode', () => {
    setSymbolClass('text');
    expect(renderGlyph(aries, 50, 50, 20, 'chart-sign-glyph')).toContain('>ARI</text>');
    setSymbolClass('unicode');
    expect(renderGlyph(aries, 50, 50, 20, 'chart-sign-glyph')).toContain('♈');
  });

  it('leaves a definition with no kind (a glyph not from the registry) drawn', () => {
    setSymbolClass('text');
    const loose = { key: 'x', elements: ['<circle cx="50" cy="50" r="10" />'] };
    expect(renderGlyph(loose, 50, 50, 20, 'c')).toContain('<circle');
  });
});

describe('the renderers follow the class without any change of their own', () => {
  const rows = [
    { key: 'sun', label: 'Sun', name: 'Sun', longitude: 280.37, house: 4 },
    { key: 'moon', label: 'Moon', name: 'Moon', longitude: 193.32, house: 1 },
  ];
  const matrixInput = {
    bodies: rows,
    aspects: [{ aKey: 'sun', bKey: 'moon', aspectKey: 'square', orb: 2.95, signedOrb: -2.95, applying: false }],
  };

  it('the aspect grid draws body, sign and aspect symbols as text', () => {
    const drawn = renderAspectMatrixSvg(matrixInput, { x: 0, y: 0, width: 400 }).markup;
    expect(drawn).not.toContain('chart-symbol-text');
    setSymbolClass('text');
    const text = renderAspectMatrixSvg(matrixInput, { x: 0, y: 0, width: 400 }).markup;
    for (const code of ['SUN', 'MOO', 'SQR', 'CAP']) expect(text).toContain(`>${code}</text>`);
  });

  it('the wheel draws its zodiac and bodies as Unicode', () => {
    const houses: HousePositions = {
      cusps: [0, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
      ascendant: 0,
      midheaven: 270,
      armc: 0,
      vertex: 0,
      equatorialAscendant: 0,
      coAscendantKoch: 0,
      coAscendantMunkasey: 0,
      polarAscendant: 0,
      system: 'A',
    };
    const ring: WheelRingInput = {
      label: 'Natal',
      houses,
      bodies: [
        { body: bodyByKey('sun')?.id ?? 0, key: 'sun', longitude: 100 },
        { body: bodyByKey('moon')?.id ?? 1, key: 'moon', longitude: 200 },
      ],
    };
    setSymbolClass('unicode');
    const wheel = renderMultiWheelSvg([ring], []);
    expect(wheel).toContain('♈');
    expect(wheel).toContain('☉');
  });

  it('an exported file carries the style that makes a text symbol readable on its own', () => {
    setSymbolClass('text');
    const exported = standaloneSvg(
      renderGlyph(bodyGlyph('sun') ?? { key: 'x', elements: [] }, 50, 50, 20, 'chart-glyph'),
    );
    expect(exported).toContain('chart-symbol-text-text');
    expect(exported).toContain('svg text.chart-symbol-text-text { font-size: 44px');
  });
});
