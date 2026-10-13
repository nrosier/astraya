/**
 * Reference fixtures for zodiacal releasing (#554). Valens, *Anthology* IV assigns the sign
 * periods used here; the tests verify the Level-1 and Level-2 sequence from Valens' Leo-Lot
 * worked nativity, including the loosing-of-the-bond rule.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import {
  ZODIACAL_RELEASING_SIGN_YEARS,
  zodiacalReleasingPeriodAt,
  zodiacalReleasingPeriods,
  zodiacalReleasingSubperiods,
} from '../src/astrology/zodiacal-releasing.js';

const TROPICAL_YEAR_DAYS = 365.2425;
const mars = bodyByKey('mars')?.id;
const venus = bodyByKey('venus')?.id;
if (mars === undefined || venus === undefined) throw new Error('fixture bug');

describe('ZODIACAL_RELEASING_SIGN_YEARS (#554)', () => {
  it('preserves Valens’ sign table, including Capricorn’s distinct 27 years', () => {
    expect(ZODIACAL_RELEASING_SIGN_YEARS).toEqual([15, 8, 20, 25, 19, 20, 8, 15, 12, 27, 30, 12]);
  });
});

describe('zodiacalReleasingPeriods (#554)', () => {
  it('starts at the given longitude’s own sign, with its ruler’s own years', () => {
    const periods = zodiacalReleasingPeriods(35, 0, 2); // 5° Taurus — ruled by Venus, 8 years
    expect(periods[0]?.sign).toBe(1); // Taurus
    expect(periods[0]?.ruler).toBe(venus);
    expect(periods[0]?.years).toBe(8);
    expect(periods[0]?.startJd).toBe(0);
    expect(periods[0]?.endJd).toBeCloseTo(8 * TROPICAL_YEAR_DAYS, 6);
  });

  it('walks forward sign by sign, each period starting where the last ended', () => {
    const periods = zodiacalReleasingPeriods(35, 0, 3); // Taurus, Gemini, Cancer
    expect(periods.map((p) => p.sign)).toEqual([1, 2, 3]);
    expect(periods[1]?.startJd).toBe(periods[0]?.endJd);
    expect(periods[2]?.startJd).toBe(periods[1]?.endJd);
  });

  it('wraps the sign index past Pisces back to Aries', () => {
    const periods = zodiacalReleasingPeriods(345, 0, 2); // Pisces, then wraps to Aries
    expect(periods.map((p) => p.sign)).toEqual([11, 0]);
    expect(periods[1]?.ruler).toBe(mars);
  });

  it('matches Valens’ worked native: a Lot in Leo releases Leo for 19 years, then Virgo for 20', () => {
    // Valens, *Anthology* IV: the native’s Lot starts in Leo; the source then says it enters
    // Virgo in the nineteenth year. This is a cited source fixture, not a ruler-derived proxy.
    const periods = zodiacalReleasingPeriods(125, 0, 2);
    expect(periods.map((period) => [period.sign, period.years])).toEqual([
      [4, 19],
      [5, 20],
    ]);
  });
});

describe('zodiacalReleasingSubperiods (#554)', () => {
  it('uses the same sign counts as months within Valens’ Level-1 Leo period', () => {
    const parent = zodiacalReleasingPeriods(125, 0, 1)[0];
    if (parent === undefined) throw new Error('fixture bug: missing Level-1 period');
    const periods = zodiacalReleasingSubperiods(parent);
    expect(periods.slice(0, 2).map((period) => [period.sign, period.months])).toEqual([
      [4, 19],
      [5, 20],
    ]);
    expect(periods.every((period) => period.startJd < period.endJd)).toBe(true);
    expect(periods.at(-1)?.endJd).toBe(parent.endJd);
  });

  it('jumps to the opposite sign after a full Level-2 cycle (loosing of the bond)', () => {
    const parent = zodiacalReleasingPeriods(305, 0, 1)[0]; // Aquarius, 30 Level-1 years
    if (parent === undefined) throw new Error('fixture bug: missing Level-1 period');
    const bond = zodiacalReleasingSubperiods(parent).find((period) => period.loosingOfBond);
    expect(bond?.sign).toBe(4); // Leo, opposite Aquarius
    expect(bond?.months).toBe(19);
  });
});

describe('zodiacalReleasingPeriodAt (#554)', () => {
  it('finds the period covering a given moment', () => {
    const found = zodiacalReleasingPeriodAt(35, 0, 10 * TROPICAL_YEAR_DAYS); // 10 years in: past Taurus (8y), into Gemini
    expect(found?.sign).toBe(2); // Gemini
  });

  it('is undefined before the starting Julian day', () => {
    expect(zodiacalReleasingPeriodAt(35, 100, 0)).toBeUndefined();
  });
});
