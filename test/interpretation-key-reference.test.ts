/**
 * The key reference at the top of `src/interpretation/schema.ts` (#427): one example key per
 * category, its shape, and the ordering rule for its two bodies. This fails if a category's shape
 * changes, so the table in that header (and `docs/CORPUS_KEYS.md`) cannot drift from `placementKey`.
 */
import { describe, expect, it } from 'vitest';
import {
  ACG_ANGLES,
  ACG_ANGLE_POINT_KEYS,
  CORPUS_CATEGORIES,
  categoryOfKey,
  parsePlacementKey,
  placementKey,
  validateKey,
  type CorpusCategory,
  type CorpusPlacement,
} from '../src/interpretation/schema.js';
import type { FocusAngle } from '../src/interpretation/focus-context-schema.js';

interface Row {
  readonly placement: CorpusPlacement;
  readonly key: string;
  /** The shape, as a regular expression over the whole key. */
  readonly shape: RegExp;
}

const REFERENCE: Readonly<Record<CorpusCategory, Row>> = {
  'planet-in-sign': {
    placement: { category: 'planet-in-sign', body: 'sun', sign: 2 },
    key: 'planet-in-sign:sun:2',
    shape: /^planet-in-sign:[A-Za-z]+:(?:[0-9]|1[01])$/,
  },
  'planet-in-house': {
    placement: { category: 'planet-in-house', body: 'sun', house: 3 },
    key: 'planet-in-house:sun:3',
    shape: /^planet-in-house:[A-Za-z]+:(?:[1-9]|1[0-2])$/,
  },
  'sign-on-cusp': {
    placement: { category: 'sign-on-cusp', sign: 2, house: 3 },
    key: 'sign-on-cusp:2:3',
    shape: /^sign-on-cusp:(?:[0-9]|1[01]):(?:[1-9]|1[0-2])$/,
  },
  'aspect-pair': {
    placement: { category: 'aspect-pair', aspect: 'square', bodyA: 'mars', bodyB: 'saturn' },
    key: 'aspect-pair:square:mars:saturn',
    shape: /^aspect-pair:[a-z]+:[A-Za-z]+:[A-Za-z]+$/,
  },
  'transit-aspect': {
    placement: { category: 'transit-aspect', aspect: 'trine', transiting: 'mars', natal: 'sun' },
    key: 'transit-aspect:trine:mars:sun',
    shape: /^transit-aspect:[a-z]+:[A-Za-z]+:[A-Za-z]+$/,
  },
  'synastry-aspect': {
    placement: { category: 'synastry-aspect', aspect: 'square', bodyA: 'mars', bodyB: 'moon' },
    key: 'synastry-aspect:square:mars:moon',
    shape: /^synastry-aspect:[a-z]+:[A-Za-z]+:[A-Za-z]+$/,
  },
  'dignity-state': {
    placement: { category: 'dignity-state', body: 'sun', state: 'ruler' },
    key: 'dignity-state:sun:ruler',
    shape: /^dignity-state:[A-Za-z]+:(?:ruler|exalted|detriment|fall)$/,
  },
  nakshatra: {
    placement: { category: 'nakshatra', body: 'moon', nakshatra: 3 },
    key: 'nakshatra:moon:3',
    shape: /^nakshatra:[A-Za-z]+:\d+$/,
  },
  pattern: {
    placement: { category: 'pattern', pattern: 'bucket' },
    key: 'pattern:bucket',
    shape: /^pattern:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  },
  'profected-house': {
    placement: { category: 'profected-house', house: 7 },
    key: 'profected-house:7',
    shape: /^profected-house:(?:[1-9]|1[0-2])$/,
  },
  'astro-line': {
    placement: { category: 'astro-line', body: 'venus', angle: 'MC' },
    key: 'astro-line:venus:MC',
    shape: /^astro-line:[A-Za-z]+:(?:AC|DC|MC|IC)$/,
  },
  'composite-planet-in-sign': {
    placement: { category: 'composite-planet-in-sign', body: 'sun', sign: 2 },
    key: 'composite-planet-in-sign:sun:2',
    shape: /^composite-planet-in-sign:[A-Za-z]+:(?:[0-9]|1[01])$/,
  },
  'composite-planet-in-house': {
    placement: { category: 'composite-planet-in-house', body: 'sun', house: 3 },
    key: 'composite-planet-in-house:sun:3',
    shape: /^composite-planet-in-house:[A-Za-z]+:(?:[1-9]|1[0-2])$/,
  },
  'composite-aspect-pair': {
    placement: { category: 'composite-aspect-pair', aspect: 'square', bodyA: 'mars', bodyB: 'saturn' },
    key: 'composite-aspect-pair:square:mars:saturn',
    shape: /^composite-aspect-pair:[a-z]+:[A-Za-z]+:[A-Za-z]+$/,
  },
  'degree-symbol': {
    placement: { category: 'degree-symbol', degree: 1 },
    key: 'degree-symbol:1',
    shape: /^degree-symbol:(?:[1-9]|[1-9][0-9]|[12][0-9]{2}|3[0-5][0-9]|360)$/,
  },
};

describe('the corpus key reference (#427)', () => {
  it('has a row for every category', () => {
    expect(Object.keys(REFERENCE).sort()).toEqual([...CORPUS_CATEGORIES].sort());
  });

  for (const category of CORPUS_CATEGORIES) {
    const row = REFERENCE[category];
    it(`${category}: the example key has the documented shape and round-trips`, () => {
      expect(placementKey(row.placement)).toBe(row.key);
      expect(row.key).toMatch(row.shape);
      expect(categoryOfKey(row.key)).toBe(category);
      expect(parsePlacementKey(row.key)).toEqual(row.placement);
      expect(validateKey(row.key)).toEqual([]);
    });
  }

  it('reads sign:2 as Gemini (zero-based) and house:2 as the 2nd house (one-based)', () => {
    expect(parsePlacementKey('planet-in-sign:sun:2')).toMatchObject({ sign: 2 });
    expect(parsePlacementKey('planet-in-house:sun:2')).toMatchObject({ house: 2 });
    expect(validateKey('planet-in-sign:sun:0')).toEqual([]);
    expect(validateKey('planet-in-sign:sun:12')).not.toEqual([]);
    expect(validateKey('planet-in-house:sun:0')).not.toEqual([]);
    expect(validateKey('planet-in-house:sun:12')).toEqual([]);
  });

  describe('the ordering of the two bodies', () => {
    it('aspect-pair, synastry-aspect and composite-aspect-pair are stored once per pair, alphabetically', () => {
      for (const category of ['aspect-pair', 'synastry-aspect', 'composite-aspect-pair'] as const) {
        const swapped = placementKey({ category, aspect: 'square', bodyA: 'moon', bodyB: 'mars' });
        expect(swapped).toBe(`${category}:square:mars:moon`);
        // A hand-typed key in the other order is refused, not silently a second entry.
        expect(validateKey(`${category}:square:moon:mars`)).not.toEqual([]);
        expect(validateKey(`${category}:square:mars:moon`), `${category} in alphabetical order`).toEqual([]);
      }
    });

    it('transit-aspect is ordered by role, not alphabetically', () => {
      expect(placementKey({ category: 'transit-aspect', aspect: 'trine', transiting: 'sun', natal: 'mars' })).toBe(
        'transit-aspect:trine:sun:mars',
      );
      expect(validateKey('transit-aspect:trine:sun:mars')).toEqual([]);
      expect(validateKey('transit-aspect:trine:mars:sun')).toEqual([]);
    });
  });

  it('maps every corpus angle to the lowercase point key the rest of the app uses', () => {
    expect(Object.keys(ACG_ANGLE_POINT_KEYS).sort()).toEqual([...ACG_ANGLES].sort());
    const points: FocusAngle[] = ACG_ANGLES.map((angle) => ACG_ANGLE_POINT_KEYS[angle]);
    expect([...points].sort()).toEqual(['asc', 'dsc', 'ic', 'mc']);
  });
});
