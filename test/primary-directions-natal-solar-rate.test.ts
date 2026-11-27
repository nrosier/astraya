/**
 * Solar Fire's Natal Solar Rate time key (#2040; Solar Fire Deluxe guide §30.3.2.3: "the natal Sun's rate of motion
 * in R.A. for each year of life"), on the real Swiss Ephemeris engine. The rate is the Sun's speed in right ascension
 * at birth, constant for the whole life: near a solstice it is above 1° a day, near an equinox below.
 */
import { describe, expect, it } from 'vitest';
import { arcToYears, yearsToArc } from '../src/astrology/primary-directions.js';
import { NAIBOD_DAILY_MOTION } from '../src/astrology/progressions.js';
import {
  DEFAULT_MAX_AGE_YEARS,
  generatePrimaryDirections,
  PrimaryDirectionKey,
} from '../src/domain/primary-directions.js';
import { createNatalSolarRateClock } from '../src/domain/solar-arc-clock.js';
import type { EphemerisProvider, JulianDayUT } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

/** Near the June solstice (21 June 1990, noon UTC), when the Sun moves fastest in right ascension. */
const SOLSTICE: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 21, hour: 12, minute: 0, second: 0 },
  coordinates: { latitude: 51.5, longitude: -0.12 },
  offsetOverrideMinutes: 0,
};

/** Near the March equinox (20 March 1990, noon UTC), when it moves slowest. */
const EQUINOX: BirthMomentInput = { ...SOLSTICE, civil: { ...SOLSTICE.civil, month: 3, day: 20 } };

async function natalJdOf(engine: EphemerisProvider, moment: BirthMomentInput): Promise<JulianDayUT> {
  return julianDayFor(engine, resolveMoment(moment));
}

/** The Sun's right ascension at `jd`, from the ephemeris's equatorial position. */
async function sunRa(engine: EphemerisProvider, jd: JulianDayUT): Promise<number> {
  const [sun] = await engine.positions(jd, [0], { equatorial: true });
  if (sun === undefined) throw new Error('no Sun');
  return sun.longitude;
}

describe('natal solar rate clock (#2040)', () => {
  it('is the Sun’s speed in right ascension at birth: above 1° a day near the June solstice', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(engine, SOLSTICE);
    const clock = await createNatalSolarRateClock(engine, natalJd);
    const rate = clock.arcAfterDays(1);
    expect(rate).toBeGreaterThan(1);
    // The ephemeris speed matches the RA moved over a day centred on birth.
    const centred = (await sunRa(engine, natalJd + 0.5)) - (await sunRa(engine, natalJd - 0.5));
    expect(Math.abs(rate - centred)).toBeLessThan(1e-4);
  });

  it('is below 1° a day near the March equinox', async () => {
    const engine = await getEngine();
    const clock = await createNatalSolarRateClock(engine, await natalJdOf(engine, EQUINOX));
    expect(clock.arcAfterDays(1)).toBeLessThan(1);
  });

  it('is constant: a 30° arc times out at 30 / rate years, under 30 for a solstice birth', async () => {
    const engine = await getEngine();
    const clock = await createNatalSolarRateClock(engine, await natalJdOf(engine, SOLSTICE));
    const rate = clock.arcAfterDays(1);
    const years = arcToYears(30, 'natal-solar-rate', clock);
    expect(years).toBeLessThan(30);
    expect(years).toBeCloseTo(30 / rate, 12);
    expect(arcToYears(60, 'natal-solar-rate', clock)).toBeCloseTo(2 * years, 12);
    expect(yearsToArc(years, 'natal-solar-rate', clock)).toBeCloseTo(30, 12);
  });

  it('times a converse arc by its absolute value, as the other keys do (#1603)', async () => {
    const engine = await getEngine();
    const clock = await createNatalSolarRateClock(engine, await natalJdOf(engine, SOLSTICE));
    expect(arcToYears(-30, 'natal-solar-rate', clock)).toBe(arcToYears(30, 'natal-solar-rate', clock));
  });

  it('needs its clock', () => {
    expect(() => arcToYears(30, 'natal-solar-rate')).toThrow('natal-solar-rate needs a SolarArcClock');
  });
});

describe('primary directions under the natal solar rate key (#2040)', () => {
  it('finds the same arcs as the Naibod key and times each one at arc / natal rate', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(engine, SOLSTICE);
    const rate = (await createNatalSolarRateClock(engine, natalJd)).arcAfterDays(1);
    const naibod = await generatePrimaryDirections(SOLSTICE, engine, PrimaryDirectionKey.NAIBOD);
    const natalRate = await generatePrimaryDirections(SOLSTICE, engine, PrimaryDirectionKey.NATAL_SOLAR_RATE);

    expect(natalRate.key).toBe('natal-solar-rate');
    expect(natalRate.clock).toBeDefined();
    expect(natalRate.hits.length).toBeGreaterThan(0);
    // The arcs do not depend on the key. The lifetime window does: at a solstice birth the natal rate is faster than
    // Naibod, so its 100 years reach a larger arc. Compare the arcs inside Naibod's window.
    const naibodMaxArc = DEFAULT_MAX_AGE_YEARS * NAIBOD_DAILY_MOTION;
    const naibodArcs = new Set(
      naibod.hits.map((hit) => `${hit.significator}|${hit.promissor}|${hit.aspect}|${hit.arcRA.toFixed(9)}`),
    );
    expect(natalRate.hits.length).toBeGreaterThan(naibod.hits.length);
    for (const hit of natalRate.hits) {
      if (hit.arcRA <= naibodMaxArc)
        expect(naibodArcs.has(`${hit.significator}|${hit.promissor}|${hit.aspect}|${hit.arcRA.toFixed(9)}`)).toBe(true);
      expect(hit.ageYears).toBeCloseTo(hit.arcRA / rate, 9);
      // A window edge below arc 0 is timed by its absolute value, for every key (#1603).
      expect(hit.activeFromAge).toBeCloseTo(Math.abs(hit.arcRA - natalRate.orb) / rate, 9);
    }
  });
});
