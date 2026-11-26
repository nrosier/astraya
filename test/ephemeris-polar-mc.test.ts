/**
 * The polar MC setting (#2012): Solar Fire Deluxe guide section 30.3.1.6 "MC in Polar Regions". Swiss Ephemeris
 * returned the MC 180 degrees from the ARMC-matching point for Regiomontanus and Campanus from about 67 degrees of
 * latitude (north 68, ARMC 277: 96.428 where the ARMC point is 276.427). "Always towards equator" is the default.
 * Real engine, no mocks.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, toChartCalculationOptions, withPolarMc } from '../src/chart/extended-settings.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import { DEFAULT_POLAR_MC, eclipticPointAltitude } from '../src/ephemeris/polar-mc.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  parseCalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { getEngine } from './engine-harness.js';

const OBLIQUITY = 23.4393;
const ARMC = 277;
const ARMC_POINT = 276.427; // the ecliptic longitude whose right ascension is 277

let engine: SwissEphemerisEngine;

beforeAll(async () => {
  engine = await getEngine();
});

describe('polar MC (#2012)', () => {
  it('defaults to always towards equator', () => {
    expect(DEFAULT_POLAR_MC).toBe('towardsEquator');
    expect(toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS).polarMc).toBe('towardsEquator');
  });

  it.each(['R', 'C'])('%s: 60 and 66 degrees are unchanged by either convention', async (system) => {
    for (const latitude of [60, 66, -60, -66]) {
      const raw = await engine.housesFromArmc(ARMC, latitude, OBLIQUITY, system, undefined, 'towardsEquator');
      const above = await engine.housesFromArmc(ARMC, latitude, OBLIQUITY, system, undefined, 'aboveHorizon');
      expect(raw.midheaven, `${system} ${String(latitude)}`).toBeCloseTo(ARMC_POINT, 2);
      expect(above.midheaven, `${system} ${String(latitude)} above`).toBeCloseTo(ARMC_POINT, 2);
    }
    // Pinned cusps from before the change, at 60 and 66 north.
    const r60 = await engine.housesFromArmc(ARMC, 60, OBLIQUITY, system);
    expect(r60.cusps[11]).toBeCloseTo(system === 'R' ? 284.576 : 280.405, 2);
    const r66 = await engine.housesFromArmc(ARMC, 66, OBLIQUITY, system);
    expect(r66.cusps[11]).toBeCloseTo(system === 'R' ? 277.521 : 276.854, 2);
  });

  it.each(['R', 'C'])('%s: towards equator is the same point along a meridian, at 68 and 70 north', async (system) => {
    const at68 = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, system);
    const at70 = await engine.housesFromArmc(ARMC, 70, OBLIQUITY, system);
    const at60 = await engine.housesFromArmc(ARMC, 60, OBLIQUITY, system);
    expect(at68.midheaven).toBeCloseTo(ARMC_POINT, 2);
    expect(at70.midheaven).toBeCloseTo(ARMC_POINT, 2);
    expect(at68.midheaven).toBeCloseTo(at60.midheaven, 6);
    // The IC opposes it, and the MC cusp is cusp 10.
    expect(at68.cusps[10]).toBeCloseTo(ARMC_POINT, 2);
    expect(at68.cusps[4]).toBeCloseTo(ARMC_POINT - 180, 2);
    // The ascendant is untouched.
    const raw = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, system, undefined, 'aboveHorizon');
    expect(at68.ascendant).toBeCloseTo(raw.ascendant, 9);
  });

  it('the Regiomontanus cusps at 68 north follow the MC to the towards-equator side (measured before: 94.288 for cusp 11)', async () => {
    const towards = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, 'R');
    const above = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, 'R', undefined, 'aboveHorizon');
    expect(above.cusps[11]).toBeCloseTo(94.288, 2);
    expect(towards.cusps[11]).toBeCloseTo(274.288, 2);
  });

  it.each(['R', 'C'])('%s: above horizon puts the MC above the horizon at 68 north', async (system) => {
    const above = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, system, undefined, 'aboveHorizon');
    const altitude = eclipticPointAltitude(above.midheaven, ARMC, 68, OBLIQUITY);
    const opposite = eclipticPointAltitude(above.midheaven + 180, ARMC, 68, OBLIQUITY);
    expect(above.midheaven).toBeCloseTo(ARMC_POINT - 180, 2);
    expect(altitude).toBeGreaterThan(opposite);
    // The towards-equator MC is the one below the horizon here, as the guide says (the Sun does not rise).
    const towards = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, system);
    expect(eclipticPointAltitude(towards.midheaven, ARMC, 68, OBLIQUITY)).toBeLessThan(altitude);
  });

  it('other house systems ignore the setting', async () => {
    for (const system of ['O', 'W', 'E', 'P']) {
      const a = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, system, undefined, 'towardsEquator');
      const b = await engine.housesFromArmc(ARMC, 68, OBLIQUITY, system, undefined, 'aboveHorizon');
      expect(b.cusps, system).toEqual(a.cusps);
      expect(b.midheaven, system).toBe(a.midheaven);
    }
  });

  it('houses() at a real moment takes the same setting, at 68 north', async () => {
    const jd = 2_444_000.3;
    const place = { latitude: 68, longitude: 20, altitude: 0 };
    const towards = await engine.houses(jd, place, 'R');
    const above = await engine.houses(jd, place, 'R', undefined, 'aboveHorizon');
    // The towards-equator MC is the point whose right ascension is the ARMC: within 90 degrees of the ARMC.
    const apart = Math.abs(((((towards.midheaven - towards.armc) % 360) + 540) % 360) - 180);
    expect(apart).toBeLessThan(30);
    expect([0, 180]).toContain(Math.round(Math.abs(above.midheaven - towards.midheaven)));
  });

  it('a chart saved with above horizon keeps it after the default changes, and a default chart stores nothing', () => {
    const saved = calculationSnapshotToJson(
      buildCalculationSnapshot(withPolarMc(DEFAULT_EXTENDED_SETTINGS, 'aboveHorizon'), DEFAULT_RULERSHIP_CHOICE),
    );
    // Read back under a different default: the stored value, not the current default, decides.
    const readBack = parseCalculationSnapshot(saved);
    expect(readBack.settings.polarMc).toBe('aboveHorizon');
    expect(toChartCalculationOptions(readBack.settings).polarMc).toBe('aboveHorizon');
    expect(decodeCalculationSnapshot(saved).settings.polarMc).toBe('aboveHorizon');
    // A chart saved with the default, or before the setting existed, has no field and calculates towards equator.
    const plain = calculationSnapshotToJson(
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
    );
    expect(JSON.stringify(plain)).not.toContain('polarMc');
    expect(toChartCalculationOptions(parseCalculationSnapshot(plain).settings).polarMc).toBe('towardsEquator');
    expect(() =>
      decodeCalculationSnapshot({ ...saved, settings: { ...(saved.settings as object), polarMc: 'bogus' } }),
    ).toThrow();
  });
});
