/**
 * The two right-ascension progressed-MC methods (#2039; Solar Fire Deluxe guide §30.3.2.1), on the real Swiss
 * Ephemeris engine. Naibod in RA advances the natal ARMC by the mean Sun's rate times age; true solar arc in RA
 * advances it by the right ascension the progressed Sun has moved. The MC and every other angle come from that ARMC.
 */
import { describe, expect, it } from 'vitest';
import { eclipticToEquatorial } from '../src/astrology/primary-directions.js';
import {
  computeProgressedHouses,
  mcRaArc,
  NAIBOD_DAILY_MOTION,
  type ProgressedMcMethod,
  TROPICAL_YEAR_DAYS,
} from '../src/astrology/progressions.js';
import { computeSecondaryProgression } from '../src/domain/secondary-progression.js';
import type { GeoPosition, JulianDayUT, Zodiac } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const NATAL_PLACE: GeoPosition = {
  latitude: NATAL.coordinates.latitude,
  longitude: NATAL.coordinates.longitude,
  altitude: 0,
};

/** Standard sidereal: Lahiri (SE_SIDM_LAHIRI = 1). */
const SIDEREAL: Zodiac = { kind: 'sidereal', ayanamsa: 1 };

const RA_METHODS = ['naibodRa', 'solarArcRa'] as const;

async function natalJdOf(): Promise<JulianDayUT> {
  return julianDayFor(await getEngine(), resolveMoment(NATAL));
}

/** Signed difference a − b, wrapped into (−180, 180]. */
function wrapped(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

describe('mcRaArc (#2039)', () => {
  it('naibodRa is the mean solar rate times age, whatever the Sun did', () => {
    expect(mcRaArc('naibodRa', 30, 10, 999)).toBeCloseTo(30 * NAIBOD_DAILY_MOTION, 12);
  });

  it('solarArcRa is the Sun’s right-ascension arc, taken through 0h', () => {
    expect(mcRaArc('solarArcRa', 2, 359, 1)).toBeCloseTo(2, 12);
  });

  it('solarArcRa keeps accumulating past 180 degrees instead of wrapping (a 250-year arc)', () => {
    // 250 years at about 1 degree a year: the raw difference is -110, the arc is 250.
    expect(mcRaArc('solarArcRa', 250, 300, 190)).toBeCloseTo(250, 12);
  });
});

describe('progressed MC in right ascension (#2039)', () => {
  it.each(RA_METHODS)('%s at age 0 gives the natal angles', async (method) => {
    const engine = await getEngine();
    const natalJd = await natalJdOf();
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P');
    const progressed = await computeSecondaryProgression(NATAL, natalJd, engine, { mcMethod: method });
    expect(arcsecondsBetween(progressed.houses.midheaven, natalHouses.midheaven)).toBeLessThan(0.01);
    expect(arcsecondsBetween(progressed.houses.ascendant, natalHouses.ascendant)).toBeLessThan(0.01);
    expect(arcsecondsBetween(progressed.houses.armc, natalHouses.armc)).toBeLessThan(0.01);
  });

  it('naibodRa moves the ARMC by exactly 30 times the mean solar rate at age 30', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf();
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P');
    const progressed = await computeSecondaryProgression(NATAL, natalJd + TROPICAL_YEAR_DAYS * 30, engine, {
      mcMethod: 'naibodRa',
    });
    expect(Math.abs(wrapped(progressed.houses.armc, natalHouses.armc) - 30 * NAIBOD_DAILY_MOTION)).toBeLessThan(1e-9);
  });

  it('solarArcRa moves the ARMC by the right ascension the progressed Sun has moved at age 30', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf();
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P');
    const progressed = await computeSecondaryProgression(NATAL, natalJd + TROPICAL_YEAR_DAYS * 30, engine, {
      mcMethod: 'solarArcRa',
    });
    const [natalSun] = await engine.positions(natalJd, [0], { equatorial: true });
    const [progressedSun] = await engine.positions(progressed.progressedJd, [0], { equatorial: true });
    if (natalSun === undefined || progressedSun === undefined) throw new Error('no Sun');
    const sunRaArc = wrapped(progressedSun.longitude, natalSun.longitude);
    expect(sunRaArc).toBeGreaterThan(25);
    expect(Math.abs(wrapped(progressed.houses.armc, natalHouses.armc) - sunRaArc)).toBeLessThan(1e-9);
  });

  it.each(RA_METHODS)(
    '%s puts the MC at the ecliptic point whose right ascension is the progressed ARMC',
    async (method) => {
      const engine = await getEngine();
      const natalJd = await natalJdOf();
      const progressed = await computeSecondaryProgression(NATAL, natalJd + TROPICAL_YEAR_DAYS * 30, engine, {
        mcMethod: method,
      });
      const obliquity = await engine.obliquity(progressed.progressedJd);
      const { rightAscension } = eclipticToEquatorial(progressed.houses.midheaven, 0, obliquity);
      expect(arcsecondsBetween(rightAscension, progressed.houses.armc)).toBeLessThan(0.01);
    },
  );

  it.each([
    ['naibodRa', 'naibod'],
    ['solarArcRa', 'solarArc'],
  ] as const)(
    '%s and %s give different MCs at age 30, by less than 5 degrees',
    async (raMethod: ProgressedMcMethod, longitudeMethod: ProgressedMcMethod) => {
      const engine = await getEngine();
      const natalJd = await natalJdOf();
      const targetJd = natalJd + TROPICAL_YEAR_DAYS * 30;
      const ra = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: raMethod });
      const longitude = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: longitudeMethod });
      const gap = Math.abs(wrapped(ra.houses.midheaven, longitude.houses.midheaven));
      expect(gap).toBeGreaterThan(0.01);
      expect(gap).toBeLessThan(5);
    },
  );

  it.each(RA_METHODS)('%s in a standard sidereal zodiac is the tropical result minus the ayanamsa', async (method) => {
    const engine = await getEngine();
    const natalJd = await natalJdOf();
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 30;
    const tropical = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: method });
    const sidereal = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: method, zodiac: SIDEREAL });
    const ayanamsa = await engine.ayanamsa(sidereal.progressedJd, 1);
    expect(arcsecondsBetween(sidereal.houses.armc, tropical.houses.armc)).toBeLessThan(0.01);
    expect(arcsecondsBetween(sidereal.houses.midheaven, tropical.houses.midheaven - ayanamsa)).toBeLessThan(0.01);
    expect(arcsecondsBetween(sidereal.houses.ascendant, tropical.houses.ascendant - ayanamsa)).toBeLessThan(0.01);
  });

  it('keeps a user-defined ayanamsa on the rigid rotation, moving every angle by one longitude arc', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf();
    const userZodiac: Zodiac = { kind: 'sidereal', ayanamsa: 255, user: { referenceDate: '2000-01-01', degrees: 24 } };
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P', userZodiac);
    const sun = await engine.position(natalJd, 0, { zodiac: userZodiac });
    const result = await computeProgressedHouses(
      engine,
      natalJd,
      natalJd + TROPICAL_YEAR_DAYS * 30,
      natalHouses,
      sun.longitude,
      NATAL_PLACE,
      { mcMethod: 'naibodRa', houseSystem: 'P', zodiac: userZodiac },
    );
    const mcArc = wrapped(result.houses.midheaven, natalHouses.midheaven);
    const ascArc = wrapped(result.houses.ascendant, natalHouses.ascendant);
    expect(mcArc).toBeGreaterThan(25);
    expect(Math.abs(ascArc - mcArc)).toBeLessThan(1e-9);
  });
});
