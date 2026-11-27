// #1403: these tests built the target date from a literal 365.2425; the year constant is now 365.2422, so they use TROPICAL_YEAR_DAYS (old 365.2425, new 365.2422) and the expected values are unchanged.
// #2032: the lunar month is the tropical month (TROPICAL_MONTH_DAYS, 27.32158648 days), not the synodic month. Changed: the tertiary and minor expectations (lines 30, 37 before), now TROPICAL_MONTH_DAYS; ageInSynodicMonths is now ageInTropicalMonths. SYNODIC_MONTH_DAYS keeps its own test.
import { describe, expect, it } from 'vitest';
import { TROPICAL_YEAR_DAYS } from '../src/astrology/progressions.js';
import {
  SYNODIC_MONTH_DAYS,
  TROPICAL_MONTH_DAYS,
  ageInTropicalMonths,
  minorProgressedJulianDay,
} from '../src/astrology/minor-progressions.js';

describe('SYNODIC_MONTH_DAYS (#48)', () => {
  it('is the familiar ~29.5-day synodic month, not the ~27.3-day sidereal one', () => {
    expect(SYNODIC_MONTH_DAYS).toBeGreaterThan(29);
    expect(SYNODIC_MONTH_DAYS).toBeLessThan(30);
  });
});

describe('TROPICAL_MONTH_DAYS (#2032)', () => {
  it("is Solar Fire Deluxe's mean tertiary lunar cycle, 27.32158648 days", () => {
    expect(TROPICAL_MONTH_DAYS).toBe(27.32158648);
  });

  it('is shorter than the 27.32166-day sidereal month by about 6.4 seconds', () => {
    const differenceSeconds = (27.32166 - TROPICAL_MONTH_DAYS) * 86400;
    expect(differenceSeconds).toBeGreaterThan(6.2);
    expect(differenceSeconds).toBeLessThan(6.5);
  });
});

describe('ageInTropicalMonths (#2032)', () => {
  it('divides elapsed real days by the tropical month', () => {
    expect(ageInTropicalMonths(0, TROPICAL_MONTH_DAYS * 4)).toBeCloseTo(4, 9);
  });

  it('goes negative before birth, same as ageInYears', () => {
    expect(ageInTropicalMonths(1000, 1000 - TROPICAL_MONTH_DAYS)).toBeCloseTo(-1, 9);
  });

  it('at age 40 years the tertiary offset is 40 x 365.2422 / 27.32158648 days, about 534.7', () => {
    const natalJd = 2440000;
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 40;
    expect(ageInTropicalMonths(natalJd, targetJd)).toBeCloseTo((40 * TROPICAL_YEAR_DAYS) / 27.32158648, 6);
    expect(ageInTropicalMonths(natalJd, targetJd)).toBeCloseTo(534.7, 1);
  });
});

describe('minorProgressedJulianDay (#48)', () => {
  it('tertiary: the day offset equals the age in lunar months', () => {
    const natalJd = 2440000;
    const targetJd = natalJd + TROPICAL_MONTH_DAYS * 10; // 10 lunar months of real time
    expect(minorProgressedJulianDay('tertiary', natalJd, targetJd)).toBeCloseTo(natalJd + 10, 9);
  });

  it('minor: the day offset equals the age in years, converted to lunar months', () => {
    const natalJd = 2440000;
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 3; // 3 years of real time
    expect(minorProgressedJulianDay('minor', natalJd, targetJd)).toBeCloseTo(natalJd + 3 * TROPICAL_MONTH_DAYS, 6);
  });

  it('at age 40 years the minor offset is 40 x 27.32158648 days, about 1092.9', () => {
    const natalJd = 2440000;
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 40;
    expect(minorProgressedJulianDay('minor', natalJd, targetJd) - natalJd).toBeCloseTo(40 * 27.32158648, 6);
  });

  it('gives tertiary and minor different progressed days for the same target, since the substitutions differ', () => {
    const natalJd = 2440000;
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 5;
    const tertiary = minorProgressedJulianDay('tertiary', natalJd, targetJd);
    const minor = minorProgressedJulianDay('minor', natalJd, targetJd);
    expect(Math.abs(tertiary - minor)).toBeGreaterThan(1);
  });

  it('returns the natal day unchanged at the moment of birth, for either method', () => {
    const natalJd = 2440000;
    expect(minorProgressedJulianDay('tertiary', natalJd, natalJd)).toBeCloseTo(natalJd, 9);
    expect(minorProgressedJulianDay('minor', natalJd, natalJd)).toBeCloseTo(natalJd, 9);
  });
});
