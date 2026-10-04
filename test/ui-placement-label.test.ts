/**
 * The meaning of a corpus key in words (#428): `planet-in-house:sun:3` is "Sun in the 3rd house" and
 * `planet-in-sign:sun:2` is "Sun in Gemini". The expectations are written out by hand, in both
 * languages, and then every key of the committed corpus is run through the helper.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORPUS_CATEGORIES, parsePlacementKey, type CorpusEntry } from '../src/interpretation/schema.js';
import {
  categoryLabel,
  compareSortKeys,
  labelForKey,
  ordinal,
  placementSortKey,
  sortKeyForKey,
} from '../src/ui/placement-label.js';

const KEYS = (JSON.parse(readFileSync('src/interpretation/corpus/en.json', 'utf8')) as CorpusEntry[]).map(
  (entry) => entry.key,
);

describe('ordinal (#428)', () => {
  it('writes English ordinals, including the 11th, 12th and 13th that do not follow the last digit', () => {
    const expected: Record<number, string> = {
      1: '1st',
      2: '2nd',
      3: '3rd',
      4: '4th',
      10: '10th',
      11: '11th',
      12: '12th',
      13: '13th',
      21: '21st',
      22: '22nd',
      23: '23rd',
      101: '101st',
      111: '111th',
    };
    for (const [n, text] of Object.entries(expected)) expect(ordinal(Number(n), 'en')).toBe(text);
  });

  it('writes Dutch ordinals with an e', () => {
    for (const n of [1, 2, 3, 8, 11, 12]) expect(ordinal(n, 'nl')).toBe(`${String(n)}e`);
  });
});

describe('labelForKey, English (#428)', () => {
  const en = (key: string): string => labelForKey(key, 'en');

  it('reads the zero-based sign index as the sign, and the house number as the house', () => {
    expect(en('planet-in-sign:sun:0')).toBe('Sun in Aries');
    expect(en('planet-in-sign:sun:2')).toBe('Sun in Gemini');
    expect(en('planet-in-sign:sun:11')).toBe('Sun in Pisces');
    expect(en('planet-in-house:sun:3')).toBe('Sun in the 3rd house');
    expect(en('planet-in-house:sun:2')).toBe('Sun in the 2nd house');
    expect(en('planet-in-house:moon:12')).toBe('Moon in the 12th house');
  });

  it('says two keys of the same shape apart', () => {
    expect(en('planet-in-sign:sun:2')).not.toBe(en('planet-in-house:sun:2'));
  });

  it('words every category', () => {
    expect(en('sign-on-cusp:2:3')).toBe('Gemini on the cusp of the 3rd house');
    expect(en('aspect-pair:square:mars:venus')).toBe('Mars square Venus');
    expect(en('transit-aspect:trine:saturn:sun')).toBe('Transiting Saturn trine natal Sun');
    expect(en('synastry-aspect:opposition:mars:moon')).toBe('Your Mars opposition their Moon');
    expect(en('dignity-state:mars:ruler')).toBe('Mars in its own sign (ruler)');
    expect(en('dignity-state:sun:exalted')).toBe('Sun exalted');
    expect(en('dignity-state:venus:detriment')).toBe('Venus in detriment');
    expect(en('dignity-state:saturn:fall')).toBe('Saturn in fall');
    expect(en('profected-house:7')).toBe('Profected 7th house');
    expect(en('astro-line:sun:AC')).toBe('Sun on the Ascendant line');
    expect(en('astro-line:moon:IC')).toBe('Moon on the Imum Coeli line');
    expect(en('astro-line:venus:MC')).toBe('Venus on the Midheaven line');
    expect(en('astro-line:mars:DC')).toBe('Mars on the Descendant line');
    expect(en('nakshatra:moon:5')).toBe('Moon in nakshatra 5');
    expect(en('pattern:bowl')).toBe('Chart pattern: bowl');
    expect(en('pattern:locomotive-wide')).toBe('Chart pattern: locomotive wide');
  });

  it('shows a key it cannot read as it is, never blank', () => {
    for (const key of [
      '',
      'nonsense',
      'planet-in-sign:sun:99',
      'planet-in-house:sun:0',
      'aspect-pair:square:venus:mars',
    ]) {
      expect(en(key)).toBe(key);
    }
  });
});

describe('labelForKey, Dutch (#428)', () => {
  const nl = (key: string): string => labelForKey(key, 'nl');

  it('words the placements in Dutch, with Dutch ordinals and names', () => {
    expect(nl('planet-in-sign:sun:2')).toBe('Zon in Tweelingen');
    expect(nl('planet-in-sign:sun:11')).toBe('Zon in Vissen');
    expect(nl('planet-in-house:sun:3')).toBe('Zon in het 3e huis');
    expect(nl('sign-on-cusp:2:3')).toBe('Tweelingen op de cusp van het 3e huis');
    expect(nl('aspect-pair:square:mars:venus')).toBe('Mars vierkant Venus');
    expect(nl('transit-aspect:trine:saturn:sun')).toBe('Transiterende Saturnus driehoek radix Zon');
    expect(nl('synastry-aspect:opposition:mars:moon')).toBe('Jouw Mars oppositie hun Maan');
    expect(nl('dignity-state:mars:ruler')).toBe('Mars in eigen teken (heerser)');
    expect(nl('dignity-state:sun:exalted')).toBe('Zon verheven');
    expect(nl('dignity-state:venus:detriment')).toBe('Venus in detriment');
    expect(nl('dignity-state:saturn:fall')).toBe('Saturnus in val');
    expect(nl('profected-house:7')).toBe('Geprofecteerd 7e huis');
    expect(nl('astro-line:moon:MC')).toBe('Maan op de Medium Coeli-lijn');
    expect(nl('pattern:bowl')).toBe('Horoscoopfiguur: bowl');
  });
});

describe('categoryLabel (#428)', () => {
  it('has a readable name in both languages for every category', () => {
    for (const category of CORPUS_CATEGORIES) {
      for (const locale of ['en', 'nl'] as const) {
        const label = categoryLabel(category, locale);
        expect(label.length).toBeGreaterThan(3);
        // A name, not a key: no colon, and not the category's own slug.
        expect(label).not.toContain(':');
        expect(label).not.toBe(category);
      }
    }
    expect(categoryLabel('planet-in-house', 'en')).toBe('Planet in house');
    expect(categoryLabel('planet-in-house', 'nl')).toBe('Planeet in huis');
  });
});

describe('every key in the committed corpus (#428)', () => {
  it('has a readable label in both languages, never the key itself', () => {
    expect(KEYS.length).toBeGreaterThan(4000);
    for (const locale of ['en', 'nl'] as const) {
      for (const key of KEYS) {
        const label = labelForKey(key, locale);
        expect(label, `${key} (${locale})`).not.toBe(key);
        expect(label, `${key} (${locale})`).not.toMatch(/[a-z]+-[a-z]+:|:\d/);
      }
    }
  });

  it('gives different entries different labels, so nothing is ambiguous on screen', () => {
    for (const locale of ['en', 'nl'] as const) {
      const seen = new Map<string, string>();
      for (const key of KEYS) {
        const label = labelForKey(key, locale);
        expect(seen.get(label), `"${label}" is the label of both ${seen.get(label) ?? ''} and ${key}`).toBeUndefined();
        seen.set(label, key);
      }
    }
  });
});

describe('sorting by meaning (#428)', () => {
  const sorted = (keys: string[]): string[] =>
    [...keys].sort((a, b) => compareSortKeys(sortKeyForKey(a), sortKeyForKey(b)));

  it('puts house 2 before house 10 and sign 2 before sign 10, which sorting the key as text does not', () => {
    expect(sorted(['planet-in-house:sun:10', 'planet-in-house:sun:2', 'planet-in-house:sun:1'])).toEqual([
      'planet-in-house:sun:1',
      'planet-in-house:sun:2',
      'planet-in-house:sun:10',
    ]);
    expect(sorted(['planet-in-sign:sun:10', 'planet-in-sign:sun:2'])).toEqual([
      'planet-in-sign:sun:2',
      'planet-in-sign:sun:10',
    ]);
    expect(['planet-in-house:sun:10', 'planet-in-house:sun:2'].sort()[0]).toBe('planet-in-house:sun:10');
  });

  it('groups by category, then planets in the app’s own order (Sun, Moon, Mercury …), then sign or house', () => {
    expect(
      sorted([
        'planet-in-house:sun:1',
        'planet-in-sign:mercury:5',
        'planet-in-sign:moon:9',
        'planet-in-sign:sun:11',
        'planet-in-sign:sun:0',
      ]),
    ).toEqual([
      'planet-in-sign:sun:0',
      'planet-in-sign:sun:11',
      'planet-in-sign:moon:9',
      'planet-in-sign:mercury:5',
      'planet-in-house:sun:1',
    ]);
  });

  it('orders aspects by the first planet, the second, then the aspect', () => {
    expect(
      sorted([
        'aspect-pair:trine:mars:venus',
        'aspect-pair:conjunction:mars:venus',
        'aspect-pair:square:ceres:chiron',
        'aspect-pair:conjunction:moon:sun',
      ]),
    ).toEqual([
      'aspect-pair:conjunction:moon:sun',
      'aspect-pair:conjunction:mars:venus',
      'aspect-pair:trine:mars:venus',
      'aspect-pair:square:ceres:chiron',
    ]);
  });

  it('puts a key it cannot read last', () => {
    expect(sorted(['zzz', 'planet-in-sign:sun:0', 'aaa'])).toEqual(['planet-in-sign:sun:0', 'aaa', 'zzz']);
  });

  it('sorts the whole corpus into one run per category, in the schema’s category order', () => {
    const ordered = sorted(KEYS);
    const categories = ordered.map((key) => key.split(':')[0] ?? '');
    const runs = categories.filter((category, index) => category !== categories[index - 1]);
    expect(runs).toEqual(CORPUS_CATEGORIES.filter((category) => categories.includes(category)));
    // Within planet-in-sign: each planet's twelve signs in order.
    const sunSigns = ordered
      .filter((key) => key.startsWith('planet-in-sign:sun:'))
      .map((key) => Number(key.split(':')[2]));
    expect(sunSigns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('agrees between a parsed placement and its key', () => {
    for (const key of KEYS.slice(0, 200)) {
      const placement = parsePlacementKey(key);
      if (placement === undefined) throw new Error(`fixture bug: ${key}`);
      expect(sortKeyForKey(key)).toEqual(placementSortKey(placement));
    }
  });
});
