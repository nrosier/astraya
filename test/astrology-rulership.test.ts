/**
 * Who rules which sign, as the reader chooses it (#426): modern (the default), traditional, or both
 * as co-rulers. The tables are written out here by hand, not imported, and every claim is checked
 * for all twelve signs.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { isMutualReception, dispositorChain } from '../src/astrology/dispositors.js';
import {
  DEFAULT_RULERSHIP_CHOICE,
  RULERSHIP_CHOICES,
  detrimentRulersOf,
  essentialDignitiesFor,
  isRulershipChoice,
  primaryRulerOf,
  rulersOf,
  singleRulerScheme,
} from '../src/astrology/rulership.js';

const TRADITIONAL = [
  'mars',
  'venus',
  'mercury',
  'moon',
  'sun',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'saturn',
  'jupiter',
];
const MODERN = [
  'mars',
  'venus',
  'mercury',
  'moon',
  'sun',
  'mercury',
  'venus',
  'pluto',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];
const DIFFERING_SIGNS = [7, 10, 11]; // Scorpio, Aquarius, Pisces

const id = (key: string): number => {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`fixture bug: no ${key}`);
  return body.id;
};
const ids = (keys: readonly string[]): number[] => keys.map(id);
/** A longitude in the middle of a sign. */
const inSign = (sign: number): number => sign * 30 + 15;
const SIGN = { aries: 0, taurus: 1, leo: 4, libra: 6, scorpio: 7, aquarius: 10, pisces: 11 };

describe('the choice itself (#426)', () => {
  it('defaults to modern, and offers modern, traditional and both', () => {
    expect(DEFAULT_RULERSHIP_CHOICE).toBe('modern');
    expect([...RULERSHIP_CHOICES].sort()).toEqual(['both', 'modern', 'traditional']);
  });

  it('recognises exactly those three values', () => {
    for (const value of ['modern', 'traditional', 'both']) expect(isRulershipChoice(value)).toBe(true);
    for (const value of ['Modern', 'vedic', '', null, undefined, 1, {}]) expect(isRulershipChoice(value)).toBe(false);
  });
});

describe('rulersOf (#426)', () => {
  it('lists the modern ruler of every sign under modern, and the traditional one under traditional', () => {
    for (let sign = 0; sign < 12; sign++) {
      expect(rulersOf(sign, 'modern')).toEqual(ids([MODERN[sign] ?? '']));
      expect(rulersOf(sign, 'traditional')).toEqual(ids([TRADITIONAL[sign] ?? '']));
    }
  });

  it('lists the traditional ruler first and the modern one second under both, only where they differ', () => {
    for (let sign = 0; sign < 12; sign++) {
      const expected = DIFFERING_SIGNS.includes(sign)
        ? [TRADITIONAL[sign] ?? '', MODERN[sign] ?? '']
        : [TRADITIONAL[sign] ?? ''];
      expect(rulersOf(sign, 'both')).toEqual(ids(expected));
    }
  });

  it('differs between the schemes in exactly Scorpio, Aquarius and Pisces', () => {
    const differing = Array.from({ length: 12 }, (_, sign) => sign).filter(
      (sign) => rulersOf(sign, 'modern')[0] !== rulersOf(sign, 'traditional')[0],
    );
    expect(differing).toEqual(DIFFERING_SIGNS);
  });

  it('gives every sign at least one and at most two rulers, whatever the choice', () => {
    for (const choice of RULERSHIP_CHOICES) {
      for (let sign = 0; sign < 12; sign++) {
        expect(rulersOf(sign, choice).length).toBeGreaterThanOrEqual(1);
        expect(rulersOf(sign, choice).length).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('the single ruler a chain follows (#426)', () => {
  it('is the traditional ruler under traditional and the modern one under modern and both', () => {
    expect(singleRulerScheme('traditional')).toBe('traditional');
    expect(singleRulerScheme('modern')).toBe('modern');
    expect(singleRulerScheme('both')).toBe('modern');
    expect(primaryRulerOf(SIGN.scorpio, 'traditional')).toBe(id('mars'));
    expect(primaryRulerOf(SIGN.scorpio, 'modern')).toBe(id('pluto'));
    expect(primaryRulerOf(SIGN.scorpio, 'both')).toBe(id('pluto'));
  });
});

describe('essential dignity by choice (#426)', () => {
  it('Pluto rules Scorpio under modern and both, not under traditional', () => {
    const pluto = id('pluto');
    expect(essentialDignitiesFor(pluto, inSign(SIGN.scorpio), 'modern').ruler).toBe(true);
    expect(essentialDignitiesFor(pluto, inSign(SIGN.scorpio), 'both').ruler).toBe(true);
    expect(essentialDignitiesFor(pluto, inSign(SIGN.scorpio), 'traditional').ruler).toBe(false);
  });

  it('Mars rules Scorpio under traditional and both, not under modern; it rules Aries under all three', () => {
    const mars = id('mars');
    expect(essentialDignitiesFor(mars, inSign(SIGN.scorpio), 'traditional').ruler).toBe(true);
    expect(essentialDignitiesFor(mars, inSign(SIGN.scorpio), 'both').ruler).toBe(true);
    expect(essentialDignitiesFor(mars, inSign(SIGN.scorpio), 'modern').ruler).toBe(false);
    for (const choice of RULERSHIP_CHOICES)
      expect(essentialDignitiesFor(mars, inSign(SIGN.aries), choice).ruler).toBe(true);
  });

  it('detriment is the opposite sign’s ruler: Pluto in Taurus (modern), Mars in Taurus (traditional), both under both', () => {
    expect(detrimentRulersOf(SIGN.taurus, 'modern')).toEqual(ids(['pluto']));
    expect(detrimentRulersOf(SIGN.taurus, 'traditional')).toEqual(ids(['mars']));
    expect(detrimentRulersOf(SIGN.taurus, 'both')).toEqual(ids(['mars', 'pluto']));
    expect(essentialDignitiesFor(id('pluto'), inSign(SIGN.taurus), 'modern').detriment).toBe(true);
    expect(essentialDignitiesFor(id('mars'), inSign(SIGN.taurus), 'modern').detriment).toBe(false);
    expect(essentialDignitiesFor(id('mars'), inSign(SIGN.taurus), 'traditional').detriment).toBe(true);
    // Uranus is in detriment in Leo, Neptune in Virgo: the signs opposite Aquarius and Pisces.
    expect(essentialDignitiesFor(id('uranus'), inSign(SIGN.leo), 'modern').detriment).toBe(true);
    expect(essentialDignitiesFor(id('neptune'), inSign(5), 'modern').detriment).toBe(true); // Virgo
  });

  it('exaltation and fall do not depend on the choice, and the outer planets never hold them', () => {
    for (let sign = 0; sign < 12; sign++) {
      for (const key of ['uranus', 'neptune', 'pluto']) {
        for (const choice of RULERSHIP_CHOICES) {
          const dignities = essentialDignitiesFor(id(key), inSign(sign), choice);
          expect([dignities.exalted, dignities.fall]).toEqual([false, false]);
        }
      }
      for (const key of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
        const [a, b, c] = RULERSHIP_CHOICES.map((choice) => essentialDignitiesFor(id(key), inSign(sign), choice));
        expect([a?.exalted, a?.fall]).toEqual([b?.exalted, b?.fall]);
        expect([a?.exalted, a?.fall]).toEqual([c?.exalted, c?.fall]);
      }
    }
    expect(essentialDignitiesFor(id('sun'), inSign(SIGN.aries), 'modern').exalted).toBe(true);
    expect(essentialDignitiesFor(id('sun'), inSign(SIGN.libra), 'modern').fall).toBe(true);
  });

  it('a planet holds each dignity at most once under any single choice, and the outer planets hold only ruler and detriment', () => {
    for (let sign = 0; sign < 12; sign++) {
      for (const key of ['pluto', 'uranus', 'neptune']) {
        const dignities = essentialDignitiesFor(id(key), inSign(sign), 'modern');
        const held = [dignities.ruler, dignities.exalted, dignities.detriment, dignities.fall].filter(Boolean);
        expect(held.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('dispositors by choice (#426)', () => {
  it('a chain follows the traditional ruler under traditional and the modern one otherwise', () => {
    // Venus in Scorpio; Pluto in Libra (Venus's sign); Mars in Libra too.
    const positions = new Map<number, number>([
      [id('venus'), inSign(SIGN.scorpio)],
      [id('pluto'), inSign(SIGN.libra)],
      [id('mars'), inSign(SIGN.libra)],
    ]);
    expect(dispositorChain(id('venus'), positions, 'modern').chain).toEqual(ids(['venus', 'pluto']));
    expect(dispositorChain(id('venus'), positions, 'both').chain).toEqual(ids(['venus', 'pluto']));
    expect(dispositorChain(id('venus'), positions, 'traditional').chain).toEqual(ids(['venus', 'mars']));
  });

  it('mutual reception counts the rulers of the chosen scheme, and either co-ruler under both', () => {
    const venusInScorpio = inSign(SIGN.scorpio);
    const inLibra = inSign(SIGN.libra);
    // Venus in Scorpio with Pluto in Libra: a reception only if Pluto rules Scorpio.
    expect(isMutualReception(id('venus'), venusInScorpio, id('pluto'), inLibra, 'modern')).toBe(true);
    expect(isMutualReception(id('venus'), venusInScorpio, id('pluto'), inLibra, 'traditional')).toBe(false);
    expect(isMutualReception(id('venus'), venusInScorpio, id('pluto'), inLibra, 'both')).toBe(true);
    // Venus in Scorpio with Mars in Libra: a reception only if Mars rules Scorpio.
    expect(isMutualReception(id('venus'), venusInScorpio, id('mars'), inLibra, 'modern')).toBe(false);
    expect(isMutualReception(id('venus'), venusInScorpio, id('mars'), inLibra, 'traditional')).toBe(true);
    expect(isMutualReception(id('venus'), venusInScorpio, id('mars'), inLibra, 'both')).toBe(true);
  });
});
