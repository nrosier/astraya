import { describe, expect, it } from 'vitest';
import {
  almutenFigurisOf,
  almutenOf,
  essentialDignityScoreOf,
  pickAlmutens,
  type EssentialDignityScore,
} from '../src/astrology/almuten.js';
import { bodyByKey } from '../src/astrology/bodies.js';

function id(key: string): number {
  const body = bodyByKey(key);
  if (!body) throw new Error(`test fixture bug: unknown body key "${key}"`);
  return body.id;
}

// Aries 3 degrees: first decan (face ruler Mars), Egyptian bound ruler
// Jupiter (0-6), exaltation ruler Sun, domicile ruler Mars, fire triplicity
// day/night/participating = Sun/Jupiter/Saturn.
const ARIES_3 = 3;

describe('essentialDignityScoreOf (#27)', () => {
  it('sums 5/4/3/2/1 for ruler/exaltation/triplicity/bound/face, and flags peregrine at zero', () => {
    const sun = essentialDignityScoreOf(id('sun'), ARIES_3, 'day');
    expect(sun.ruler).toBe(false);
    expect(sun.exalted).toBe(true);
    expect(sun.triplicity).toBe(true); // sect-appropriate (day) ruler of fire
    expect(sun.bound).toBe(false); // Jupiter holds Aries 0-6, not Sun
    expect(sun.face).toBe(false); // Mars holds the first face, not Sun
    expect(sun.points).toBe(4 + 3);
    expect(sun.peregrine).toBe(false);

    const mars = essentialDignityScoreOf(id('mars'), ARIES_3, 'day');
    expect(mars.ruler).toBe(true);
    expect(mars.face).toBe(true);
    expect(mars.points).toBe(5 + 1);

    const moon = essentialDignityScoreOf(id('moon'), ARIES_3, 'day');
    expect(moon.ruler).toBe(false);
    expect(moon.exalted).toBe(false);
    expect(moon.triplicity).toBe(false);
    expect(moon.bound).toBe(false);
    expect(moon.face).toBe(false);
    expect(moon.points).toBe(0);
    expect(moon.peregrine).toBe(true);
  });

  it('only scores the sect-appropriate triplicity ruler, day vs night', () => {
    // Fire triplicity day ruler Sun, night ruler Jupiter.
    expect(essentialDignityScoreOf(id('sun'), ARIES_3, 'day').triplicity).toBe(true);
    expect(essentialDignityScoreOf(id('sun'), ARIES_3, 'night').triplicity).toBe(false);
    expect(essentialDignityScoreOf(id('jupiter'), ARIES_3, 'night').triplicity).toBe(true);
    expect(essentialDignityScoreOf(id('jupiter'), ARIES_3, 'day').triplicity).toBe(false);
  });

  it('never scores the participating triplicity ruler, in either sect', () => {
    // Saturn is fire's participating ruler, neither day nor night.
    expect(essentialDignityScoreOf(id('saturn'), ARIES_3, 'day').triplicity).toBe(false);
    expect(essentialDignityScoreOf(id('saturn'), ARIES_3, 'night').triplicity).toBe(false);
  });

  it('respects the rulershipScheme and boundsScheme options', () => {
    // Aquarius 3: traditional ruler Saturn, modern ruler Uranus.
    const AQUARIUS_3 = 10 * 30 + 3;
    expect(essentialDignityScoreOf(id('saturn'), AQUARIUS_3, 'day', { rulershipScheme: 'traditional' }).ruler).toBe(
      true,
    );
    expect(essentialDignityScoreOf(id('uranus'), AQUARIUS_3, 'day', { rulershipScheme: 'modern' }).ruler).toBe(true);

    // Capricorn 3: Egyptian bound ruler Mercury, Ptolemaic bound ruler Venus.
    const CAPRICORN_3 = 9 * 30 + 3;
    expect(essentialDignityScoreOf(id('mercury'), CAPRICORN_3, 'day', { boundsScheme: 'egyptian' }).bound).toBe(true);
    expect(essentialDignityScoreOf(id('venus'), CAPRICORN_3, 'day', { boundsScheme: 'ptolemaic' }).bound).toBe(true);
  });
});

describe('almutenOf (#27)', () => {
  it('picks the traditional planet with the highest dignity score at a degree', () => {
    // Hand-scored above: Saturn 0, Jupiter 2 (bound), Mars 6 (ruler+face),
    // Sun 7 (exaltation+triplicity), Venus 0, Mercury 0, Moon 0.
    const result = almutenOf(ARIES_3, 'day');
    expect(result.points).toBe(7);
    expect(result.almutens).toEqual([id('sun')]);
    expect(result.scores).toHaveLength(7);
  });

  it('changes the winner when sect flips which triplicity ruler is active', () => {
    // At night, Sun loses its triplicity points (4) and Jupiter gains its
    // triplicity points (2 bound + 3 triplicity = 5) while Mars keeps its
    // ruler+face total of 6, so Mars becomes the sole almuten.
    const result = almutenOf(ARIES_3, 'night');
    expect(result.almutens).toEqual([id('mars')]);
    expect(result.points).toBe(6);
  });
});

describe('almutenFigurisOf (#27)', () => {
  it('sums each planet across every supplied vital point', () => {
    const single = almutenOf(ARIES_3, 'day');
    const figuris = almutenFigurisOf([ARIES_3], 'day');
    expect(figuris.points).toBe(single.points);
    expect(figuris.almutens).toEqual(single.almutens);
  });

  it('accumulates points across multiple points rather than overwriting them', () => {
    // Reuse the same point twice so the expected total is unambiguous: it
    // must be exactly double the single-point score.
    const marsAlone = essentialDignityScoreOf(id('mars'), ARIES_3, 'day').points;
    const figuris = almutenFigurisOf([ARIES_3, ARIES_3], 'day');
    const marsScore = figuris.scores.find((s) => s.body === id('mars'));
    expect(marsScore?.points).toBe(marsAlone * 2);
  });

  it('rejects an empty vital-point list rather than silently returning a meaningless result', () => {
    expect(() => almutenFigurisOf([], 'day')).toThrow(RangeError);
  });
});

const ARIES_10 = 10;
const VIRGO_10 = 160;

// Lilly, Christian Astrology Book I, p. 115: detriment −5 and fall −4, subtracted in the almuten
// tally only (owner decision, #1609). The plain dignity score keeps them out.
describe('detriment and fall in the almuten tally (#1609)', () => {
  it('subtracts detriment (−5) for Venus at 10 Aries only when includeDebilities is on', () => {
    // Venus holds bound (2) at 10 Aries and is in detriment there (Aries is opposite Libra).
    const plain = essentialDignityScoreOf(id('venus'), ARIES_10, 'day');
    expect(plain.detriment).toBe(true);
    expect(plain.points).toBe(2);
    const net = essentialDignityScoreOf(id('venus'), ARIES_10, 'day', { includeDebilities: true });
    expect(net.points).toBe(2 - 5);
    expect(net.detriment).toBe(true);
  });

  it('subtracts fall (−4) for Saturn at 10 Aries only when includeDebilities is on', () => {
    // Saturn is in fall in Aries, and holds no dignity at 10 Aries, so points are 0 before the debility.
    const plain = essentialDignityScoreOf(id('saturn'), ARIES_10, 'day');
    expect(plain.fall).toBe(true);
    expect(plain.points).toBe(0);
    const net = essentialDignityScoreOf(id('saturn'), ARIES_10, 'day', { includeDebilities: true });
    expect(net.points).toBe(0 - 4);
    expect(net.fall).toBe(true);
  });

  it('nets a dignity against a fall: Venus at 10 Virgo holds 6 and is in fall (−4)', () => {
    const plain = essentialDignityScoreOf(id('venus'), VIRGO_10, 'day');
    expect(plain.fall).toBe(true);
    expect(plain.points).toBe(6);
    const net = essentialDignityScoreOf(id('venus'), VIRGO_10, 'day', { includeDebilities: true });
    expect(net.points).toBe(6 - 4);
    expect(net.peregrine).toBe(false);
  });

  it('keeps peregrine true for a planet with no dignity even when its net points are −5', () => {
    // Venus at 0 Aries: in detriment, no dignity held. Peregrine is about dignity, not the net score.
    const net = essentialDignityScoreOf(id('venus'), 0, 'day', { includeDebilities: true });
    expect(net.points).toBe(-5);
    expect(net.detriment).toBe(true);
    expect(net.peregrine).toBe(true);
  });

  it('almutenOf scores the debilities: Venus at 10 Aries is netted to −3, the Sun still wins', () => {
    const result = almutenOf(ARIES_10, 'day');
    expect(result.scores.find((s) => s.body === id('venus'))?.points).toBe(2 - 5);
    expect(result.almutens).toEqual([id('sun')]);
  });
});

describe('pickAlmutens no-almuten guard (#1609)', () => {
  /** A hand-made score with only the fields the tally reads. */
  function scoreWith(body: number, points: number): EssentialDignityScore {
    return {
      body,
      ruler: false,
      exalted: false,
      triplicity: false,
      bound: false,
      face: false,
      detriment: false,
      fall: false,
      points,
      peregrine: points === 0,
    };
  }

  it('returns no almuten when every planet scores 0 or below', () => {
    const result = pickAlmutens([scoreWith(1, 0), scoreWith(2, -4), scoreWith(3, -5)]);
    expect(result.almutens).toEqual([]);
    expect(result.points).toBe(0);
    expect(result.scores).toHaveLength(3);
  });

  it('returns no almuten when the best score is negative', () => {
    const result = pickAlmutens([scoreWith(1, -1), scoreWith(2, -4)]);
    expect(result.almutens).toEqual([]);
    expect(result.points).toBe(-1);
  });

  it('still returns every tied planet when the tied score is above 0', () => {
    const result = pickAlmutens([scoreWith(1, 3), scoreWith(2, 3), scoreWith(3, 1), scoreWith(4, -5)]);
    expect(result.almutens).toEqual([1, 2]);
    expect(result.points).toBe(3);
  });
});
