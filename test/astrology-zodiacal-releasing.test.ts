/**
 * Unit tests for Level-1 zodiacal releasing (#554) — pure, no engine needed.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import {
  PLANET_RELEASING_YEARS,
  zodiacalReleasingPeriodAt,
  zodiacalReleasingPeriods,
} from '../src/astrology/zodiacal-releasing.js';

const TROPICAL_YEAR_DAYS = 365.2425;
const mars = bodyByKey('mars')?.id;
const venus = bodyByKey('venus')?.id;
if (mars === undefined || venus === undefined) throw new Error('fixture bug');

describe('PLANET_RELEASING_YEARS (#554)', () => {
  it('has exactly the seven classical planets, summing to the oft-cited total', () => {
    expect(PLANET_RELEASING_YEARS.size).toBe(7);
    const total = [...PLANET_RELEASING_YEARS.values()].reduce((sum, years) => sum + years, 0);
    expect(total).toBe(30 + 12 + 15 + 19 + 8 + 20 + 25);
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
