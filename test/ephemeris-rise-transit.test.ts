/**
 * `riseTransit` (#1407): the first rise, set, culmination or anti-culmination of a body after a moment, against the
 * true or the visual horizon (Solar Fire Deluxe guide §12.9). Visual times and transits come from `swe_rise_trans`;
 * true rises and sets are searched directly on the geocentric centre's altitude. Checked against the
 * engine's own horizon transform: at a true-horizon rise the body's centre is on the astronomical horizon (altitude 0,
 * no refraction, no parallax), and at culmination the body is due south from a northern place.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import type { GeoPosition, JulianDayUT } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

const SUN = 0;
const MOON = 1;
const AMSTERDAM: GeoPosition = { latitude: 52.37, longitude: 4.9, altitude: 0 };
const TROMSO: GeoPosition = { latitude: 69.65, longitude: 18.96, altitude: 0 };
const JAN_2024: JulianDayUT = 2_460_310.5; // 2024-01-01 0h UT
const JUNE_2024: JulianDayUT = 2_460_482.5; // 2024-06-21 0h UT

let engine: SwissEphemerisEngine;

beforeAll(async () => {
  engine = await getEngine();
});

/** The geocentric altitude of the body's centre, without refraction, at `jd`. */
async function centreAltitude(jd: JulianDayUT, body: number, place: GeoPosition): Promise<number> {
  const position = await engine.position(jd, body);
  const horizontal = await engine.azimuthAltitude(
    jd,
    { longitude: position.longitude, latitude: position.latitude },
    place,
  );
  return horizontal.altitude;
}

describe('riseTransit (#1407)', () => {
  it('at a true-horizon rise and set the Sun’s centre is on the astronomical horizon', async () => {
    for (const event of ['rise', 'set'] as const) {
      const jd = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, event, 'true');
      expect(jd, event).toBeDefined();
      if (jd === undefined) return;
      expect(jd - JAN_2024, event).toBeGreaterThan(0);
      expect(jd - JAN_2024, event).toBeLessThan(1);
      expect(Math.abs(await centreAltitude(jd, SUN, AMSTERDAM)), event).toBeLessThan(0.01);
    }
  });

  it('at a true-horizon Moon rise the centre is on the horizon too: no parallax, as Solar Fire’s True Altitude says', async () => {
    const jd = await engine.riseTransit(JAN_2024, MOON, AMSTERDAM, 'rise', 'true');
    expect(jd).toBeDefined();
    if (jd === undefined) return;
    expect(Math.abs(await centreAltitude(jd, MOON, AMSTERDAM))).toBeLessThan(0.02);
  });

  it('the visual rise comes before the true rise, and the visual set after the true set', async () => {
    const trueRise = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, 'rise', 'true');
    const visualRise = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, 'rise', 'visual');
    const trueSet = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, 'set', 'true');
    const visualSet = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, 'set', 'visual');
    expect(visualRise ?? Number.NaN).toBeLessThan(trueRise ?? Number.NaN);
    expect(visualSet ?? Number.NaN).toBeGreaterThan(trueSet ?? Number.NaN);
    // The upper limb plus refraction: a few minutes apart in Amsterdam in January.
    expect(((trueRise ?? 0) - (visualRise ?? 0)) * 1440).toBeGreaterThan(2);
    expect(((trueRise ?? 0) - (visualRise ?? 0)) * 1440).toBeLessThan(15);
  });

  it('at culmination the Sun is due south from a northern place, and due north at anti-culmination', async () => {
    const culminate = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, 'culminate', 'true');
    const anti = await engine.riseTransit(JAN_2024, SUN, AMSTERDAM, 'anticulminate', 'visual');
    expect(culminate).toBeDefined();
    expect(anti).toBeDefined();
    if (culminate === undefined || anti === undefined) return;
    const azimuthAt = async (jd: JulianDayUT): Promise<number> => {
      const sun = await engine.position(jd, SUN);
      return (await engine.azimuthAltitude(jd, { longitude: sun.longitude, latitude: sun.latitude }, AMSTERDAM))
        .azimuth;
    };
    expect(Math.abs((await azimuthAt(culminate)) - 180)).toBeLessThan(0.05);
    const north = await azimuthAt(anti);
    expect(Math.min(north, 360 - north)).toBeLessThan(0.05);
  });

  it('gives undefined, not an error, for the midsummer Sun north of the Arctic circle, which does not set', async () => {
    expect(await engine.riseTransit(JUNE_2024, SUN, TROMSO, 'set', 'true')).toBeUndefined();
    expect(await engine.riseTransit(JUNE_2024, SUN, TROMSO, 'culminate', 'true')).toBeDefined();
  });

  it('at a true-horizon Moon set the centre is on the horizon, and the next set is not skipped from just before it', async () => {
    const set = await engine.riseTransit(JAN_2024, MOON, AMSTERDAM, 'set', 'true');
    expect(set).toBeDefined();
    if (set === undefined) return;
    expect(Math.abs(await centreAltitude(set, MOON, AMSTERDAM))).toBeLessThan(0.02);
    // Two minutes before the geocentric set, the topocentric centre has already set (parallax): the answer must still
    // be this set, not the next day's (astrologer review of PR #1940, finding 1).
    const again = await engine.riseTransit(set - 2 / 1440, MOON, AMSTERDAM, 'set', 'true');
    expect(Math.abs((again ?? Number.NaN) - set) * 86_400).toBeLessThan(2);
  });

  it('the true rise is the first one after the moment, and the altitude rises through it', async () => {
    const rise = await engine.riseTransit(JAN_2024, MOON, AMSTERDAM, 'rise', 'true');
    expect(rise).toBeDefined();
    if (rise === undefined) return;
    expect(rise).toBeGreaterThan(JAN_2024);
    expect(await centreAltitude(rise - 1 / 1440, MOON, AMSTERDAM)).toBeLessThan(0);
    expect(await centreAltitude(rise + 1 / 1440, MOON, AMSTERDAM)).toBeGreaterThan(0);
  });

  it('gives a Visual Moon rise near the true one', async () => {
    const trueRise = await engine.riseTransit(JAN_2024, MOON, AMSTERDAM, 'rise', 'true');
    const visualRise = await engine.riseTransit(JAN_2024, MOON, AMSTERDAM, 'rise', 'visual');
    expect(visualRise).toBeDefined();
    expect(Math.abs((visualRise ?? Number.NaN) - (trueRise ?? Number.NaN)) * 1440).toBeLessThan(30);
  });
});
