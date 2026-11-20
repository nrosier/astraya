/**
 * Pure-layer tests for the True Solar Arc time key (#1795, task 1). A fake clock that moves 1° of
 * right ascension a day stands in for the ephemeris clock, which comes in task 2. Makransky (rev.
 * ed. 1992, p. 29): one day after birth stands for one year of life, so 1° a day gives 1 year a degree.
 */
import { describe, expect, it } from 'vitest';
import {
  TIME_KEY_DEGREES_PER_YEAR,
  arcToYears,
  yearsToArc,
  type SolarArcClock,
} from '../src/astrology/primary-directions.js';

/** A clock whose Sun moves exactly 1° of right ascension a day. */
const oneDegreeADay: SolarArcClock = {
  arcAfterDays: (days) => days,
  daysForArc: (arc) => arc,
};

describe('true-solar-arc time key (pure layer)', () => {
  it('converts an arc to years one day per year (1 degree a day)', () => {
    expect(arcToYears(16.1, 'true-solar-arc', oneDegreeADay)).toBe(16.1);
  });

  it('throws RangeError when the clock is missing', () => {
    expect(() => arcToYears(16.1, 'true-solar-arc')).toThrow(RangeError);
    expect(() => arcToYears(16.1, 'true-solar-arc')).toThrow('true-solar-arc needs a SolarArcClock');
    expect(() => yearsToArc(16.1, 'true-solar-arc')).toThrow(RangeError);
  });

  it('round-trips years and arc through the clock', () => {
    const clock: SolarArcClock = {
      arcAfterDays: (days) => days * 0.9,
      daysForArc: (arc) => arc / 0.9,
    };
    for (const years of [0, 1, 15.318, 42.043, 99.5]) {
      const arc = yearsToArc(years, 'true-solar-arc', clock);
      expect(arcToYears(arc, 'true-solar-arc', clock)).toBeCloseTo(years, 9);
    }
  });

  it('times a negative (converse) arc by its absolute value under true-solar-arc', () => {
    expect(arcToYears(-16.1, 'true-solar-arc', oneDegreeADay)).toBe(16.1);
    expect(arcToYears(-45.54, 'true-solar-arc', oneDegreeADay)).toBe(45.54);
  });

  it('times a negative arc by its absolute value under the fixed keys, as under true-solar-arc (#1603)', () => {
    for (const key of ['naibod', 'ptolemy'] as const) {
      expect(arcToYears(-16.1, key)).toBe(arcToYears(16.1, key));
      expect(arcToYears(-0.5, key)).toBeCloseTo(0.5 / TIME_KEY_DEGREES_PER_YEAR[key], 12);
    }
  });

  it('leaves the fixed keys unchanged with and without a clock', () => {
    for (const key of ['naibod', 'ptolemy'] as const) {
      const perYear = TIME_KEY_DEGREES_PER_YEAR[key];
      expect(arcToYears(perYear * 10, key)).toBeCloseTo(10, 12);
      expect(arcToYears(perYear * 10, key, oneDegreeADay)).toBeCloseTo(10, 12);
      expect(yearsToArc(10, key)).toBeCloseTo(perYear * 10, 12);
      expect(yearsToArc(10, key, oneDegreeADay)).toBeCloseTo(perYear * 10, 12);
    }
  });
});
