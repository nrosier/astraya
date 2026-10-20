import { describe, expect, it } from 'vitest';
import {
  arabicPart,
  LOT_FORMULAS,
  lotFormulaByKey,
  lotOfCourage,
  lotOfEros,
  lotOfNecessity,
  lotOfNemesis,
  lotOfVictory,
  partOfFortune,
  partOfSpirit,
  sectReversingPart,
} from '../src/astrology/arabic-parts.js';

describe('arabicPart (#29)', () => {
  it('computes base + a - b, wrapped to a longitude', () => {
    expect(arabicPart(10, 20, 5)).toBe(25);
    expect(arabicPart(10, 5, 20)).toBe(355); // wraps below 0
    expect(arabicPart(350, 20, 5)).toBe(5); // wraps above 360
  });
});

describe('sectReversingPart (#29)', () => {
  it('uses dayA, dayB in day-chart order', () => {
    expect(sectReversingPart('day', 0, 200, 100)).toBe(100);
  });

  it('swaps the operands for a night chart', () => {
    expect(sectReversingPart('night', 0, 200, 100)).toBe(260); // 0 + 100 - 200, wrapped
  });
});

describe('partOfFortune (#29)', () => {
  const ascendant = 0;
  const sun = 100;
  const moon = 200;

  it('is Ascendant + Moon - Sun in a day chart', () => {
    expect(partOfFortune('day', ascendant, sun, moon)).toBe(100);
  });

  it('is Ascendant + Sun - Moon in a night chart', () => {
    expect(partOfFortune('night', ascendant, sun, moon)).toBe(260);
  });

  it('differs between day and night charts for the same positions', () => {
    expect(partOfFortune('day', ascendant, sun, moon)).not.toBe(partOfFortune('night', ascendant, sun, moon));
  });
});

describe('partOfSpirit (#29)', () => {
  const ascendant = 0;
  const sun = 100;
  const moon = 200;

  it('is Ascendant + Sun - Moon in a day chart', () => {
    expect(partOfSpirit('day', ascendant, sun, moon)).toBe(260);
  });

  it('is Ascendant + Moon - Sun in a night chart', () => {
    expect(partOfSpirit('night', ascendant, sun, moon)).toBe(100);
  });

  it('is the mirror of Fortune for the same chart and sect', () => {
    expect(partOfSpirit('day', ascendant, sun, moon)).toBe(partOfFortune('night', ascendant, sun, moon));
    expect(partOfSpirit('night', ascendant, sun, moon)).toBe(partOfFortune('day', ascendant, sun, moon));
  });

  it('differs between day and night charts for the same positions', () => {
    expect(partOfSpirit('day', ascendant, sun, moon)).not.toBe(partOfSpirit('night', ascendant, sun, moon));
  });
});

describe('LOT_FORMULAS / lotFormulaByKey (#550)', () => {
  it('has exactly one entry per lot, each resolving to itself', () => {
    expect(LOT_FORMULAS).toHaveLength(7);
    for (const lot of LOT_FORMULAS) {
      expect(lotFormulaByKey(lot.key)).toBe(lot);
    }
  });

  it("lists exactly Paulus's seven Hermetic lots, each with an authority that names Paulus", () => {
    expect(LOT_FORMULAS.map((lot) => lot.key)).toEqual([
      'part-of-fortune',
      'part-of-spirit',
      'lot-of-eros',
      'lot-of-necessity',
      'lot-of-courage',
      'lot-of-victory',
      'lot-of-nemesis',
    ]);
    for (const lot of LOT_FORMULAS) {
      expect(lot.authority, lot.key).toMatch(/Paulus/);
      expect(lot.source, lot.key).toMatch(/printed p(p)?\. 52[56]/);
    }
  });

  it('is undefined for a key with no lot (e.g. a midpoint)', () => {
    expect(lotFormulaByKey('asc-mc-midpoint')).toBeUndefined();
  });

  it('both lots reverse by sect, and Spirit is the Sun/Moon mirror of Fortune', () => {
    const fortune = lotFormulaByKey('part-of-fortune');
    const spirit = lotFormulaByKey('part-of-spirit');
    expect(fortune?.reversesBySect).toBe(true);
    expect(spirit?.reversesBySect).toBe(true);
    expect(fortune?.dayFormula).toBe(spirit?.nightFormula);
    expect(fortune?.nightFormula).toBe(spirit?.dayFormula);
  });

  it('carries non-empty authority and source provenance for both lots', () => {
    for (const lot of LOT_FORMULAS) {
      expect(lot.authority.length).toBeGreaterThan(0);
      expect(lot.source.length).toBeGreaterThan(0);
    }
  });
});

describe("Paulus's Hermetic lots (#740)", () => {
  // Hand-picked longitudes: ASC 0, Fortune 100, Spirit 200, planet 300 (the wraparound cases).
  // Each lot is `ASC + (to − from)`, so the day and night results are the reverse of each other.
  const asc = 0;
  const planet = 300;
  const fortune = 100;
  const spirit = 200;

  it('Eros: day is Asc + Venus − Spirit, night is Asc + Spirit − Venus, wrapped', () => {
    expect(lotOfEros('day', asc, planet, spirit)).toBe(100); // 0 + 300 − 200
    expect(lotOfEros('night', asc, planet, spirit)).toBe(260); // 0 + 200 − 300, wrapped
  });

  it('Necessity: day is Asc + Fortune − Mercury, night is Asc + Mercury − Fortune, wrapped', () => {
    expect(lotOfNecessity('day', asc, planet, fortune)).toBe(160); // 0 + 100 − 300, wrapped
    expect(lotOfNecessity('night', asc, planet, fortune)).toBe(200); // 0 + 300 − 100
  });

  it('Courage: day is Asc + Fortune − Mars, night is Asc + Mars − Fortune, wrapped', () => {
    expect(lotOfCourage('day', asc, planet, fortune)).toBe(160);
    expect(lotOfCourage('night', asc, planet, fortune)).toBe(200);
  });

  it('Victory: day is Asc + Jupiter − Spirit, night is Asc + Spirit − Jupiter, wrapped', () => {
    expect(lotOfVictory('day', asc, planet, spirit)).toBe(100);
    expect(lotOfVictory('night', asc, planet, spirit)).toBe(260);
  });

  it('Nemesis: day is Asc + Fortune − Saturn, night is Asc + Saturn − Fortune, wrapped', () => {
    expect(lotOfNemesis('day', asc, planet, fortune)).toBe(160);
    expect(lotOfNemesis('night', asc, planet, fortune)).toBe(200);
  });

  it('wraps a non-zero Ascendant past 360 for both sects', () => {
    expect(lotOfEros('day', 350, 20, 10)).toBe(0); // 350 + 20 − 10 = 360 → 0
    expect(lotOfNemesis('night', 350, 5, 20)).toBe(335); // 350 + 5 − 20 = 335
  });
});
