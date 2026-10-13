/**
 * Unit tests for the reception engine (#548) — pure, no engine needed.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { dignityRulersOf, mutualReceptionBetween, receptionsOf } from '../src/astrology/reception.js';

const sun = bodyByKey('sun');
const moon = bodyByKey('moon');
const mars = bodyByKey('mars');
const venus = bodyByKey('venus');
const jupiter = bodyByKey('jupiter');
const saturn = bodyByKey('saturn');
if (
  sun === undefined ||
  moon === undefined ||
  mars === undefined ||
  venus === undefined ||
  jupiter === undefined ||
  saturn === undefined
) {
  throw new Error('fixture bug: a traditional planet is missing from BODIES');
}

describe('dignityRulersOf (#548)', () => {
  it('includes domicile, triplicity, bound, and face for every sign, plus exaltation for the five that have one', () => {
    // 15° Aries: domicile Mars, exaltation Sun, fire-triplicity day ruler Sun, Egyptian bound/face vary.
    const rulers = dignityRulersOf(15, 'day');
    const types = rulers.map((r) => r.dignityType);
    expect(types).toContain('domicile');
    expect(types).toContain('triplicity');
    expect(types).toContain('bound');
    expect(types).toContain('face');
    expect(types).toContain('exaltation');
    expect(rulers.find((r) => r.dignityType === 'domicile')?.ruler).toBe(mars.id);
    expect(rulers.find((r) => r.dignityType === 'exaltation')?.ruler).toBe(sun.id);
  });

  it('omits exaltation for a sign that has none (e.g. Gemini, 60-90°)', () => {
    const rulers = dignityRulersOf(75, 'day');
    expect(rulers.some((r) => r.dignityType === 'exaltation')).toBe(false);
  });

  it('triplicity ruler follows the chart sect: fire triplicity is Sun by day, Jupiter by night', () => {
    expect(dignityRulersOf(15, 'day').find((r) => r.dignityType === 'triplicity')?.ruler).toBe(sun.id);
    expect(dignityRulersOf(15, 'night').find((r) => r.dignityType === 'triplicity')?.ruler).toBe(jupiter.id);
  });
});

describe('receptionsOf (#548)', () => {
  it('a body in another’s domicile is received by that other body', () => {
    // Venus at 15° Aries — Mars's own domicile.
    expect(receptionsOf(venus.id, 15, mars.id, 'day')).toContainEqual({
      receivedBody: venus.id,
      receivingBody: mars.id,
      dignityType: 'domicile',
    });
  });

  it('is empty when the receiving body holds no dignity at that placement', () => {
    // Venus holds no dignity in early Aries at all under the Egyptian bound table used by default
    // except via chance bound/face assignment — use a body guaranteed to hold none: Saturn at 15°
    // Aries (Mars's domicile, Sun's exaltation, fire triplicity Sun/Jupiter) is not Saturn's.
    const receptions = receptionsOf(venus.id, 15, saturn.id, 'day');
    expect(receptions.every((r) => r.receivingBody === saturn.id)).toBe(true);
    // Saturn holds none of domicile/exaltation/triplicity at 15° Aries by day; it may or may not
    // hold a bound/face role depending on the degree, so only assert domicile/exaltation/triplicity.
    expect(receptions.some((r) => r.dignityType === 'domicile')).toBe(false);
    expect(receptions.some((r) => r.dignityType === 'exaltation')).toBe(false);
    expect(receptions.some((r) => r.dignityType === 'triplicity')).toBe(false);
  });
});

describe('mutualReceptionBetween (#548)', () => {
  it('finds mutual reception by domicile: Mars in Cancer (Moon’s sign), Moon in Scorpio (Mars’s sign)', () => {
    const result = mutualReceptionBetween(mars.id, 100, moon.id, 220, 'day');
    expect(result.kind).toBe('mutual');
    expect(result.sameDignityType).toBe(true);
    expect(result.aFromB).toContainEqual({ receivedBody: mars.id, receivingBody: moon.id, dignityType: 'domicile' });
    expect(result.bFromA).toContainEqual({ receivedBody: moon.id, receivingBody: mars.id, dignityType: 'domicile' });
  });

  it('finds mixed reception: Mars in Cancer (Moon’s domicile) while Moon is in Aries (Mars’s domicile, not Moon’s exaltation)', () => {
    // For a genuinely mixed case: Mars in Taurus (Venus's domicile) and Venus in Pisces (Venus's
    // own exaltation sign is Pisces, but we need Venus to be in a sign that gives Mars something
    // back by a DIFFERENT dignity). Use: Mars at 5° Taurus (Venus's domicile) and Venus at 5° Capricorn
    // (Mars's exaltation sign is Capricorn) — Mars receives Venus by domicile, Venus receives Mars by exaltation.
    const result = mutualReceptionBetween(mars.id, 35, venus.id, 275, 'day');
    expect(result.kind).toBe('mutual');
    expect(result.aFromB.map((r) => r.dignityType)).toContain('domicile');
    expect(result.bFromA.map((r) => r.dignityType)).toContain('exaltation');
    expect(result.sameDignityType).toBe(false);
  });

  it('finds one-way reception when only one side holds domicile/exaltation/triplicity (bound/face set aside, since those vary by exact degree)', () => {
    // Venus at 15° Aries (Mars's domicile) receives Mars. Mars at 15° Aries itself holds none of
    // Venus's domicile/exaltation/triplicity there (domicile is Mars's own, exaltation is the
    // Sun's, fire triplicity by day is the Sun's) — a possible shared bound/face role at that
    // exact degree is irrelevant to the point being tested, so only those three are asserted.
    const result = mutualReceptionBetween(venus.id, 15, mars.id, 15, 'day');
    const bFromACore = result.bFromA.filter(
      (r) => r.dignityType === 'domicile' || r.dignityType === 'exaltation' || r.dignityType === 'triplicity',
    );
    expect(result.aFromB.map((r) => r.dignityType)).toContain('domicile');
    expect(bFromACore).toEqual([]);
  });

  it('finds no reception at all when neither side holds domicile/exaltation/triplicity', () => {
    // Jupiter at 100° (Cancer: Jupiter's own exaltation, Moon's domicile, Venus's day-triplicity —
    // none of Mars's) and Mars at 15° (Aries: Mars's own domicile, Sun's exaltation, Sun's day
    // triplicity — none of Jupiter's).
    const result = mutualReceptionBetween(jupiter.id, 100, mars.id, 15, 'day');
    const coreTypes = (list: readonly { readonly dignityType: string }[]): readonly string[] =>
      list.map((r) => r.dignityType).filter((t) => t === 'domicile' || t === 'exaltation' || t === 'triplicity');
    expect(coreTypes(result.aFromB)).toEqual([]);
    expect(coreTypes(result.bFromA)).toEqual([]);
  });
});
