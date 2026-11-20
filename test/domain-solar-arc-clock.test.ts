/**
 * Tests for the True Solar Arc clock (#1795, task 2): the Sun's right ascension sampled from the
 * real Swiss Ephemeris, checked against Makransky rev. ed. 1992, p. 29 (one day after birth stands
 * for one year of life; Prince Charles's arcs 16.10 and 45.54 give 15.318 and 42.043 days).
 */
import { describe, expect, it } from 'vitest';
import { eclipticToEquatorial } from '../src/astrology/primary-directions.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import { createSolarArcClock, SOLAR_ARC_CLOCK_MAX_DAYS } from '../src/domain/solar-arc-clock.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

describe('createSolarArcClock (#1795, task 2)', () => {
  it('reads right ascension from the longitude field under { equatorial: true } (matches the ecliptic-to-equatorial conversion)', async () => {
    const engine = await getEngine();
    const jd = await engine.julianDayFromUtc(1948, 11, 14, 21, 14, 39);
    const [ecliptic] = await engine.positions(jd, [SE.SE_SUN], {});
    const [equatorial] = await engine.positions(jd, [SE.SE_SUN], { equatorial: true });
    if (ecliptic === undefined || equatorial === undefined) throw new Error('no Sun position');
    const obliquity = await engine.obliquity(jd);
    const expected = eclipticToEquatorial(ecliptic.longitude, ecliptic.latitude, obliquity);
    expect(arcsecondsBetween(equatorial.longitude, expected.rightAscension)).toBeLessThan(1);
  });

  it('round-trips days and arc: daysForArc(arcAfterDays(d)) returns d for several d', async () => {
    const engine = await getEngine();
    const birthJd = await engine.julianDayFromUtc(1948, 11, 14, 21, 14, 39);
    const clock = await createSolarArcClock(engine, birthJd);
    for (const days of [0, 0.5, 1, 7.25, 30, 75.5, 109.9, SOLAR_ARC_CLOCK_MAX_DAYS]) {
      expect(clock.daysForArc(clock.arcAfterDays(days))).toBeCloseTo(days, 6);
    }
  });

  it('throws RangeError outside the sampled span instead of extrapolating', async () => {
    const engine = await getEngine();
    const birthJd = await engine.julianDayFromUtc(1948, 11, 14, 21, 14, 39);
    const clock = await createSolarArcClock(engine, birthJd);
    expect(() => clock.arcAfterDays(-0.5)).toThrow(RangeError);
    expect(() => clock.arcAfterDays(SOLAR_ARC_CLOCK_MAX_DAYS + 0.5)).toThrow(RangeError);
    expect(() => clock.daysForArc(-1)).toThrow(RangeError);
    expect(() => clock.daysForArc(clock.arcAfterDays(SOLAR_ARC_CLOCK_MAX_DAYS) + 1)).toThrow(RangeError);
  });

  it('unwraps the raw RA at 360 degrees, so the arc keeps increasing across 0 Aries', async () => {
    const engine = await getEngine();
    // 10 March: the Sun's RA is near 350 degrees and crosses 0 Aries within the sampled span.
    const birthJd = await engine.julianDayFromUtc(1948, 3, 10, 0, 0, 0);
    const clock = await createSolarArcClock(engine, birthJd);
    let previous = clock.arcAfterDays(0);
    for (let day = 1; day <= SOLAR_ARC_CLOCK_MAX_DAYS; day++) {
      const arc = clock.arcAfterDays(day);
      expect(arc).toBeGreaterThan(previous);
      previous = arc;
    }
    // The Sun's RA rate varies between about 0.92 and 1.08 degrees a day, so 110 days cover roughly 100-120 degrees.
    const total = clock.arcAfterDays(SOLAR_ARC_CLOCK_MAX_DAYS);
    expect(total).toBeGreaterThan(100);
    expect(total).toBeLessThan(120);
  });

  it('gives Makransky p. 29 values: arc 16.10 is 15.318 days and arc 45.54 is 42.043 days (+/- 0.02)', async () => {
    const engine = await getEngine();
    // Prince Charles: 14 November 1948, 21h14m39s GMT (Makransky rev. ed. 1992, p. 29).
    const birthJd = await engine.julianDayFromUtc(1948, 11, 14, 21, 14, 39);
    const clock = await createSolarArcClock(engine, birthJd);
    expect(Math.abs(clock.daysForArc(16.1) - 15.318)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(clock.daysForArc(45.54) - 42.043)).toBeLessThanOrEqual(0.02);
  });
});
