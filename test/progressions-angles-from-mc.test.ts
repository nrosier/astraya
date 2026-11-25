/**
 * Progressed angles derived from the progressed MC (#1935), on the real Swiss Ephemeris engine.
 *
 * Under the naibod and solarArc MC methods, the progressed MC is the natal MC advanced by the symbolic arc. The other
 * angles and cusps are then derived from that progressed MC through `housesFromArmc` at the natal latitude, with the
 * obliquity at the progressed date (Solar Fire Deluxe guide §30.3.2.1; owner decision on #1935). A standard sidereal
 * zodiac uses the engine's ayanamsa recipe. A user-defined ayanamsa keeps the rigid shift until the split-out engine
 * interface issue lands.
 */
import { describe, expect, it } from 'vitest';
import { eclipticToEquatorial } from '../src/astrology/primary-directions.js';
import {
  computeProgressedHouses,
  progressedSunDeclination,
  shiftHouses,
  TROPICAL_YEAR_DAYS,
} from '../src/astrology/progressions.js';
import { computeSecondaryProgression } from '../src/domain/secondary-progression.js';
import type {
  Degrees,
  EphemerisProvider,
  GeoPosition,
  HousePositions,
  JulianDayUT,
  Zodiac,
} from '../src/ephemeris/types.js';
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

/** A high-latitude place, for the Ascendant-versus-MC motion test (Stockholm). */
const HIGH_LATITUDE_PLACE: GeoPosition = { latitude: 59.33, longitude: 18.07, altitude: 0 };

/** Standard sidereal: Lahiri (SE_SIDM_LAHIRI = 1), a registered ayanamsa. */
const SIDEREAL: Zodiac = { kind: 'sidereal', ayanamsa: 1 };

/** Tolerance the brief requires for the Ascendant against `provider.houses` at the progressed ARMC. */
const ANGLE_TOLERANCE_DEG = 1e-6;

/** Mean sidereal rate in degrees per day (360.98564736629 per 365.2422 mean days is close enough for a seed). */
const SIDEREAL_RATE_DEG_PER_DAY = 360.98564736629;

/**
 * A real moment whose ARMC, at `place`, equals `targetArmc`. It starts from `startJd` and corrects by the ARMC error
 * (wrapped to (-180, 180]) until the error is below 1e-7 degrees. The floor is the Julian day's double-precision
 * resolution (about 5e-10 day, about 4e-8 degree of ARMC), so a tighter bound cannot be reached. Uses only `provider.houses`, so the moment is a genuine
 * engine sky, not a number built from the formula under test.
 */
async function momentWithArmc(
  provider: EphemerisProvider,
  startJd: JulianDayUT,
  targetArmc: Degrees,
  place: GeoPosition,
): Promise<{ readonly jd: JulianDayUT; readonly armc: Degrees }> {
  let jd = startJd;
  for (let i = 0; i < 20; i += 1) {
    const { armc } = await provider.houses(jd, place, 'P');
    let error = (targetArmc - armc) % 360;
    if (error > 180) error -= 360;
    if (error <= -180) error += 360;
    if (Math.abs(error) < 1e-7) return { jd, armc };
    jd = jd + error / SIDEREAL_RATE_DEG_PER_DAY;
  }
  throw new Error('momentWithArmc did not converge');
}

describe('progressed angles from the progressed MC (#1935)', () => {
  it('keeps the progressed MC unchanged: the naibod MC is the natal MC plus age times the mean solar rate', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 10;
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P');

    const progressed = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: 'naibod' });
    // The MC is shiftHouses' value, as it was before #1935: natal MC plus the Naibod arc.
    const expectedMc = shiftHouses(natalHouses, 10 * (360 / TROPICAL_YEAR_DAYS)).midheaven;
    expect(arcsecondsBetween(progressed.houses.midheaven, expectedMc)).toBeLessThan(1);
  });

  it('gives the naibod progressed Ascendant equal to provider.houses at a moment whose ARMC is the progressed ARMC (1e-6 degrees)', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 30;
    const progressed = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: 'naibod' });

    // Find a real moment (within a day of the progressed one) whose sidereal ARMC, at the natal place, equals the
    // progressed ARMC. `provider.houses` there is the independent reference: it is a full engine cast, not the
    // housesFromArmc call the code makes.
    const moment = await momentWithArmc(engine, progressed.progressedJd, progressed.houses.armc, NATAL_PLACE);
    const reference = await engine.houses(moment.jd, NATAL_PLACE, 'P');
    expect(arcsecondsBetween(reference.armc, progressed.houses.armc) / 3600).toBeLessThan(ANGLE_TOLERANCE_DEG);
    expect(arcsecondsBetween(progressed.houses.ascendant, reference.ascendant) / 3600).toBeLessThan(
      ANGLE_TOLERANCE_DEG,
    );
  });

  it('round-trips the progressed MC: housesFromArmc at the progressed ARMC returns the progressed MC within 1 arcsecond', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 30;
    const progressed = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: 'naibod' });
    const obliquity = await engine.obliquity(progressed.progressedJd);
    const cast = await engine.housesFromArmc(progressed.houses.armc, NATAL_PLACE.latitude, obliquity, 'P');
    expect(arcsecondsBetween(cast.midheaven, progressed.houses.midheaven)).toBeLessThan(1);
  });

  it('gives a high-latitude Ascendant whose motion differs from the MC motion (Stockholm, 59.33 N, 30 years of age)', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const at = async (years: number): Promise<HousePositions> => {
      const result = await computeProgressedHouses(
        engine,
        natalJd,
        natalJd + TROPICAL_YEAR_DAYS * years,
        await engine.houses(natalJd, HIGH_LATITUDE_PLACE, 'P'),
        (await engine.position(natalJd, 0)).longitude,
        HIGH_LATITUDE_PLACE,
        { mcMethod: 'naibod', houseSystem: 'P' },
      );
      return result.houses;
    };
    const a = await at(30);
    const b = await at(31);
    const mcMotion = arcsecondsBetween(b.midheaven, a.midheaven);
    const ascMotion = arcsecondsBetween(b.ascendant, a.ascendant);
    // The Ascendant at 59.33 N does not move at the MC's rate; the gap is far larger than the engine's noise.
    expect(Math.abs(ascMotion - mcMotion)).toBeGreaterThan(60);
  });

  it('standard sidereal: progressed angles equal tropical ones minus the ayanamsa, not from the ARMC (Lahiri)', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 30;
    const tropical = await computeSecondaryProgression(NATAL, targetJd, engine, { mcMethod: 'solarArc' });
    const sidereal = await computeSecondaryProgression(NATAL, targetJd, engine, {
      mcMethod: 'solarArc',
      zodiac: SIDEREAL,
    });
    const ayanamsa = await engine.ayanamsa(sidereal.progressedJd, 1);
    // The ARMC is a right ascension and is not shifted; the sidereal angles are the tropical ones minus the ayanamsa,
    // within the #1489 bound (30") the solar arc test already uses for tropical versus sidereal.
    expect(arcsecondsBetween(sidereal.houses.armc, tropical.houses.armc)).toBeLessThan(30);
    const ascendantDifference = (tropical.houses.ascendant - sidereal.houses.ascendant - ayanamsa + 720) % 360;
    expect(arcsecondsBetween(ascendantDifference, 0)).toBeLessThan(30);
  });

  it("user-defined ayanamsa keeps today's rigid shift: the progressed cusps equal natal cusps plus the arc", async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + TROPICAL_YEAR_DAYS * 30;
    const userZodiac: Zodiac = {
      kind: 'sidereal',
      ayanamsa: 1,
      user: { referenceDate: '2000-01-01', degrees: 24 },
    };
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P', userZodiac);
    const natalSun = await engine.position(natalJd, 0, { zodiac: userZodiac });
    const result = await computeProgressedHouses(
      engine,
      natalJd,
      targetJd,
      natalHouses,
      natalSun.longitude,
      NATAL_PLACE,
      {
        mcMethod: 'naibod',
        houseSystem: 'P',
        zodiac: userZodiac,
      },
    );
    const arc = 30 * (360 / TROPICAL_YEAR_DAYS);
    expect(arcsecondsBetween(result.houses.ascendant, natalHouses.ascendant + arc)).toBeLessThan(1);
    expect(arcsecondsBetween(result.houses.cusps[1] ?? 0, (natalHouses.cusps[1] ?? 0) + arc)).toBeLessThan(1);
  });
  describe('Sunshine (house system I) gets the progressed Sun declination (#1935)', () => {
    const SUNSHINE_PLACES: readonly GeoPosition[] = [NATAL_PLACE, { latitude: 51.5, longitude: -0.12, altitude: 0 }];

    for (const mcMethod of ['naibod', 'solarArc'] as const) {
      for (const place of SUNSHINE_PLACES) {
        it(`${mcMethod} at ${String(place.latitude)} N returns finite cusps and does not throw`, async () => {
          const engine = await getEngine();
          const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
          const result = await computeProgressedHouses(
            engine,
            natalJd,
            natalJd + TROPICAL_YEAR_DAYS * 25,
            await engine.houses(natalJd, place, 'I'),
            (await engine.position(natalJd, 0)).longitude,
            place,
            { mcMethod, houseSystem: 'I' },
          );
          expect(result.houses.system).toBe('I');
          for (let house = 1; house <= 12; house += 1) expect(Number.isFinite(result.houses.cusps[house])).toBe(true);
        });
      }
    }

    it("'i' (Makransky's Sunshine) under naibod at 38.75 N gets the declination: finite cusps, no throw", async () => {
      const engine = await getEngine();
      const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
      const result = await computeProgressedHouses(
        engine,
        natalJd,
        natalJd + TROPICAL_YEAR_DAYS * 25,
        await engine.houses(natalJd, NATAL_PLACE, 'i'),
        (await engine.position(natalJd, 0)).longitude,
        NATAL_PLACE,
        { mcMethod: 'naibod', houseSystem: 'i' },
      );
      expect(result.houses.system).toBe('i');
      for (let house = 1; house <= 12; house += 1) expect(Number.isFinite(result.houses.cusps[house])).toBe(true);
      // It used the progressed Sun's declination, not a leftover value in the reused buffer.
      const declination = await progressedSunDeclination(engine, result.progressedJd);
      const obliquity = await engine.obliquity(result.progressedJd);
      const direct = await engine.housesFromArmc(result.houses.armc, NATAL_PLACE.latitude, obliquity, 'i', declination);
      expect(arcsecondsBetween(result.houses.cusps[2] ?? Number.NaN, direct.cusps[2] ?? Number.NaN)).toBeLessThan(1);
    });

    it('the declination used equals eclipticToEquatorial of the tropical progressed Sun (1e-6 degrees)', async () => {
      // Tolerance: both sides are the same apparent place of date through the same true obliquity; only floating-point
      // rounding separates them, far below 1e-6 degrees.
      const engine = await getEngine();
      const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
      const progressedJd = natalJd + 25;
      const [tropicalSun] = await engine.positions(progressedJd, [0]);
      const obliquity = await engine.obliquity(progressedJd);
      const expected = eclipticToEquatorial(
        tropicalSun?.longitude ?? Number.NaN,
        tropicalSun?.latitude ?? Number.NaN,
        obliquity,
      );
      const used = await progressedSunDeclination(engine, progressedJd);
      expect(Math.abs(used - expected.declination)).toBeLessThan(1e-6);
    });

    it('a sidereal chart uses the TROPICAL declination, not the one from the sidereal longitude', async () => {
      const engine = await getEngine();
      const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
      const targetJd = natalJd + TROPICAL_YEAR_DAYS * 25;
      const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'I', SIDEREAL);
      const natalSun = (await engine.positions(natalJd, [0], { zodiac: SIDEREAL }))[0]?.longitude ?? Number.NaN;
      const result = await computeProgressedHouses(engine, natalJd, targetJd, natalHouses, natalSun, NATAL_PLACE, {
        mcMethod: 'naibod',
        houseSystem: 'I',
        zodiac: SIDEREAL,
      });
      const progressedJd = result.progressedJd;
      const ayanamsa = await engine.ayanamsa(progressedJd, 1);
      const obliquity = await engine.obliquity(progressedJd);
      const [tropicalSun] = await engine.positions(progressedJd, [0]);
      const [siderealSun] = await engine.positions(progressedJd, [0], { zodiac: SIDEREAL });
      const tropicalDec = eclipticToEquatorial(tropicalSun?.longitude ?? Number.NaN, 0, obliquity).declination;
      const siderealDec = eclipticToEquatorial(siderealSun?.longitude ?? Number.NaN, 0, obliquity).declination;
      expect(Math.abs(tropicalDec - siderealDec)).toBeGreaterThan(0.5); // the wrong source would be visibly wrong
      const cast = async (declination: number): Promise<number> =>
        (await engine.housesFromArmc(result.houses.armc, NATAL_PLACE.latitude, obliquity, 'I', declination)).cusps[2] ??
        Number.NaN;
      const expectedCusp2 = ((((await cast(tropicalDec)) - ayanamsa) % 360) + 360) % 360;
      const wrongCusp2 = ((((await cast(siderealDec)) - ayanamsa) % 360) + 360) % 360;
      const actual = result.houses.cusps[2] ?? Number.NaN;
      expect(arcsecondsBetween(actual, expectedCusp2)).toBeLessThan(1);
      expect(arcsecondsBetween(actual, wrongCusp2)).toBeGreaterThan(10);
    });
  });
});
