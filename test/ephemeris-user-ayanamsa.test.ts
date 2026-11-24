/**
 * The user-defined ayanamsa (#1407, Solar Fire Deluxe v6 p. 253; owner decision 2026-11-14, "Date + degrees"): the
 * ayanamsa at a reference date (0h UT), which Swiss Ephemeris precesses from there (`SE_SIDM_USER` with
 * `SE_SIDBIT_USER_UT`). Checked against the engine's own predefined Lahiri mode, through the real engine (no mocks).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { SE } from '../src/ephemeris/generated-constants.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import type { Zodiac } from '../src/ephemeris/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const LAHIRI = SE.SE_SIDM_LAHIRI;
const REFERENCE = '1950-01-01';

let engine: SwissEphemerisEngine;
let t0: number;

beforeAll(async () => {
  engine = await getEngine();
  t0 = await engine.julianDay(1950, 1, 1, 0);
}, 60_000);

async function sunIn(zodiac: Zodiac, jd: number): Promise<number> {
  return (await engine.position(jd, SE.SE_SUN, { zodiac })).longitude;
}

describe('user-defined ayanamsa (#1407)', () => {
  it('is the given degrees at its reference date: Lahiri’s own mean value there gives Lahiri’s positions', async () => {
    const degrees = await engine.ayanamsa(t0, LAHIRI, { mean: true });
    const user: Zodiac = { kind: 'sidereal', ayanamsa: SE.SE_SIDM_USER, user: { referenceDate: REFERENCE, degrees } };
    const lahiri: Zodiac = { kind: 'sidereal', ayanamsa: LAHIRI };
    expect(arcsecondsBetween(await sunIn(user, t0), await sunIn(lahiri, t0))).toBeLessThan(1);
  });

  it('precesses from the reference date as the predefined modes do, so it still matches Lahiri 75 years on', async () => {
    const degrees = await engine.ayanamsa(t0, LAHIRI, { mean: true });
    const user: Zodiac = { kind: 'sidereal', ayanamsa: SE.SE_SIDM_USER, user: { referenceDate: REFERENCE, degrees } };
    const lahiri: Zodiac = { kind: 'sidereal', ayanamsa: LAHIRI };
    const later = t0 + 75 * 365.25;
    expect(arcsecondsBetween(await sunIn(user, later), await sunIn(lahiri, later))).toBeLessThan(1);
    // The precession it applies is real: the user zodiac's offset from tropical grows over the 75 years.
    const tropical: Zodiac = { kind: 'tropical' };
    const offsetAt = async (jd: number): Promise<number> =>
      ((await sunIn(tropical, jd)) - (await sunIn(user, jd)) + 360) % 360;
    expect(await offsetAt(later)).toBeGreaterThan(await offsetAt(t0));
  });

  it('sets the mode again when the definition changes, and a predefined mode after it is unaffected', async () => {
    const base: Zodiac = {
      kind: 'sidereal',
      ayanamsa: SE.SE_SIDM_USER,
      user: { referenceDate: REFERENCE, degrees: 23 },
    };
    const shifted: Zodiac = {
      kind: 'sidereal',
      ayanamsa: SE.SE_SIDM_USER,
      user: { referenceDate: REFERENCE, degrees: 24 },
    };
    const a = await sunIn(base, t0);
    const b = await sunIn(shifted, t0);
    // One more degree of ayanamsa puts every sidereal longitude one degree earlier.
    expect(arcsecondsBetween(a - 1, b)).toBeLessThan(1);
    const lahiri: Zodiac = { kind: 'sidereal', ayanamsa: LAHIRI };
    const before = await sunIn(lahiri, t0);
    await sunIn(base, t0);
    expect(await sunIn(lahiri, t0)).toBe(before);
  });

  it('takes the mean ayanamsa: the true value differs from it by the nutation in longitude, under 20 arcseconds', async () => {
    const mean = await engine.ayanamsa(t0, LAHIRI, { mean: true });
    const trueValue = await engine.ayanamsa(t0, LAHIRI);
    expect(mean).not.toBe(trueValue);
    // The nutation in longitude stays within about 17.2 arcseconds (IAU 1980 amplitude); 20 is a margin, not a model.
    expect(Math.abs(arcsecondsBetween(trueValue, mean))).toBeLessThan(20);
  });

  it('refuses SE_SIDM_USER without its definition', async () => {
    await expect(sunIn({ kind: 'sidereal', ayanamsa: SE.SE_SIDM_USER }, t0)).rejects.toThrow(/user-defined ayanamsa/);
  });

  it('computes the user-defined ayanamsa directly: Lahiri as a user definition gives Lahiri’s value (#1964)', async () => {
    const degrees = await engine.ayanamsa(t0, LAHIRI, { mean: true });
    const user = { referenceDate: REFERENCE, degrees };
    // At the reference date, by construction, and 75 years on, through Swiss Ephemeris's own precession.
    for (const jd of [t0, t0 + 75 * 365.25]) {
      for (const mean of [true, false]) {
        const asUser = await engine.ayanamsa(jd, SE.SE_SIDM_USER, { user, mean });
        const builtIn = await engine.ayanamsa(jd, LAHIRI, { mean });
        expect(Math.abs(asUser - builtIn), `jd ${String(jd)}, mean ${String(mean)}`).toBeLessThan(1e-6);
      }
    }
  });

  it('agrees with the user zodiac the positions use: tropical minus sidereal is the ayanamsa (#1964)', async () => {
    const user = { referenceDate: REFERENCE, degrees: 23.5 };
    const later = t0 + 40 * 365.25;
    const ayanamsa = await engine.ayanamsa(later, SE.SE_SIDM_USER, { user });
    const tropical = await sunIn({ kind: 'tropical' }, later);
    const sidereal = await sunIn({ kind: 'sidereal', ayanamsa: SE.SE_SIDM_USER, user }, later);
    expect(arcsecondsBetween((tropical - sidereal + 360) % 360, ayanamsa)).toBeLessThan(0.01);
  });

  it('refuses the user-defined mode without a definition in ayanamsa() too, with the same message (#1964)', async () => {
    await expect(engine.ayanamsa(t0, SE.SE_SIDM_USER)).rejects.toThrow(
      'A user-defined ayanamsa needs its reference date and degrees.',
    );
  });

  it('ignores a definition passed with a built-in mode (#1964)', async () => {
    const plain = await engine.ayanamsa(t0, LAHIRI);
    const withUser = await engine.ayanamsa(t0, LAHIRI, { user: { referenceDate: REFERENCE, degrees: 10 } });
    expect(withUser).toBe(plain);
  });
});
