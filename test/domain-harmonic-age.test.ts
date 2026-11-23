/**
 * Harmonic Age and Harmonic Age+1 (#1407), Solar Fire Deluxe guide §12.6 (PDF p. 85): every longitude multiplied by
 * the exact age in decimal years at the target date (zero at birth), or by that age plus one (one at birth). Real
 * engine, like the other harmonic tests: the transform is arithmetic, the natal chart it transforms is not.
 */
import { describe, expect, it } from 'vitest';
import { harmonicLongitude } from '../src/astrology/harmonics.js';
import { TROPICAL_YEAR_DAYS } from '../src/astrology/progressions.js';
import { computeHarmonic, computeHarmonicAge } from '../src/domain/harmonic.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

async function natalJd(): Promise<number> {
  return julianDayFor(await getEngine(), resolveMoment(PERSON));
}

describe('computeHarmonicAge (#1407)', () => {
  it('Age+1 at birth is the natal chart: every longitude unchanged', async () => {
    const engine = await getEngine();
    const data = await computeHarmonicAge(PERSON, await natalJd(), engine, { plusOne: true });
    expect(data.ageInYears).toBe(0);
    expect(data.harmonicNumber).toBe(1);
    for (const [index, position] of data.harmonic.positions.entries()) {
      expect(position.longitude).toBeCloseTo(data.natal.positions[index]?.longitude ?? Number.NaN, 9);
    }
    expect(data.harmonic.houses.ascendant).toBeCloseTo(data.natal.houses.ascendant, 9);
  });

  it('Age at birth puts every point at 0° Aries (harmonic zero)', async () => {
    const engine = await getEngine();
    const data = await computeHarmonicAge(PERSON, await natalJd(), engine);
    expect(data.harmonicNumber).toBe(0);
    for (const position of data.harmonic.positions) expect(position.longitude).toBe(0);
    expect(data.harmonic.houses.ascendant).toBe(0);
  });

  it('at age 10.5 multiplies the Sun’s longitude by 10.5 (Age) and by 11.5 (Age+1)', async () => {
    const engine = await getEngine();
    const target = (await natalJd()) + 10.5 * TROPICAL_YEAR_DAYS;
    const age = await computeHarmonicAge(PERSON, target, engine);
    const agePlusOne = await computeHarmonicAge(PERSON, target, engine, { plusOne: true });
    expect(age.ageInYears).toBeCloseTo(10.5, 12);
    const natalSun = age.natal.positions.find((position) => position.body === 0)?.longitude ?? Number.NaN;
    const sunAt = (data: typeof age): number =>
      data.harmonic.positions.find((position) => position.body === 0)?.longitude ?? Number.NaN;
    expect(sunAt(age)).toBeCloseTo(harmonicLongitude(natalSun, 10.5), 9);
    expect(sunAt(agePlusOne)).toBeCloseTo(harmonicLongitude(natalSun, 11.5), 9);
    expect(age.harmonic.houses.system).toBe('W');
    // The Ascendant is transformed like any point, and house 1 starts at the beginning of its sign (whole-sign).
    expect(age.harmonic.houses.ascendant).toBeCloseTo(harmonicLongitude(age.natal.houses.ascendant, 10.5), 9);
    expect(age.harmonic.houses.cusps[1]).toBe(Math.floor(age.harmonic.houses.ascendant / 30) * 30);
  });

  it('measures age in tropical years of 365.2422 days (Astraya’s convention; the guide gives no year length)', () => {
    expect(TROPICAL_YEAR_DAYS).toBe(365.2422);
  });

  it('refuses a target date before birth', async () => {
    const engine = await getEngine();
    await expect(computeHarmonicAge(PERSON, (await natalJd()) - 1, engine)).rejects.toThrow(/on or after birth/);
  });

  it('leaves computeHarmonic’s integer check as it was', async () => {
    const engine = await getEngine();
    await expect(computeHarmonic(PERSON, 10.5, engine)).rejects.toThrow(/positive integer/);
  });
});
