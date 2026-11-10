import { describe, expect, it } from 'vitest';
import { NAIBOD_DAILY_MOTION, TROPICAL_YEAR_DAYS, ageInYears } from '../src/astrology/progressions.js';

// #1403: the progression year was the Gregorian mean (365.2425) although labelled the mean tropical year.
// Owner decision 2026-11-09: use 365.2422.
const OLD_YEAR_DAYS = 365.2425;
const NEW_YEAR_DAYS = 365.2422;

describe('progression year constant (#1403)', () => {
  it('is the mean tropical year 365.2422, no longer the Gregorian 365.2425', () => {
    expect(TROPICAL_YEAR_DAYS).toBe(NEW_YEAR_DAYS);
    expect(TROPICAL_YEAR_DAYS).not.toBe(OLD_YEAR_DAYS);
  });

  it('shifts the progressed time at age 80 by about 6 seconds', () => {
    // Progressed time = age in years (days of ephemeris time), age = elapsed days / year length.
    const elapsedDays = OLD_YEAR_DAYS * 80;
    const ageOld = elapsedDays / OLD_YEAR_DAYS; // exactly 80
    const ageNew = ageInYears(0, elapsedDays); // old: 80 days; new: 80.0000657 days
    expect(ageOld).toBe(80);
    expect(ageNew).toBeCloseTo((OLD_YEAR_DAYS / NEW_YEAR_DAYS) * 80, 12);
    const differenceSeconds = (ageNew - ageOld) * 86400;
    expect(differenceSeconds).toBeGreaterThan(5.5);
    expect(differenceSeconds).toBeLessThan(6.5);
  });

  it('moves the Naibod key from 0.9856465 to 0.9856473 degrees a day', () => {
    expect(360 / OLD_YEAR_DAYS).toBeCloseTo(0.9856465, 7);
    expect(NAIBOD_DAILY_MOTION).toBeCloseTo(360 / NEW_YEAR_DAYS, 12);
    expect(NAIBOD_DAILY_MOTION).toBeCloseTo(0.9856473, 7);
    // At age 80 the Naibod arc differs by about 0.23 arcseconds.
    const arcDiffArcsec = (NAIBOD_DAILY_MOTION - 360 / OLD_YEAR_DAYS) * 80 * 3600;
    expect(arcDiffArcsec).toBeGreaterThan(0.2);
    expect(arcDiffArcsec).toBeLessThan(0.3);
  });
});
