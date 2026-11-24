/**
 * `housesFromArmc` (#1407): houses cast from an ARMC, a latitude and an obliquity, with no moment, through
 * `swe_houses_armc_ex2`. It is the engine call a progressed or directed MC needs: Solar Fire derives the progressed
 * Ascendant, Vertex and Equatorial Ascendant from the progressed MC (Solar Fire Deluxe guide §30.3.2.1). Checked
 * against the ordinary `houses` call at a real moment, whose own ARMC and obliquity must give back the same chart.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import { EphemerisError, type JulianDayUT } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

const JD: JulianDayUT = 2_444_000.3; // 1979-01-11, an ordinary moment inside the shipped data files
const AMSTERDAM = { latitude: 52.37, longitude: 4.9, altitude: 0 };
const POLAR = { latitude: 70, longitude: 20, altitude: 0 };

let engine: SwissEphemerisEngine;

beforeAll(async () => {
  engine = await getEngine();
});

describe('housesFromArmc (#1407)', () => {
  it('gives back the chart of a real moment from that moment’s ARMC, latitude and true obliquity', async () => {
    const obliquity = await engine.obliquity(JD);
    for (const system of ['P', 'K', 'O', 'R', 'C', 'A', 'W', 'B'] as const) {
      const atMoment = await engine.houses(JD, AMSTERDAM, system);
      const fromArmc = await engine.housesFromArmc(atMoment.armc, AMSTERDAM.latitude, obliquity, system);
      expect(fromArmc.system, system).toBe(atMoment.system);
      expect(fromArmc.ascendant, system).toBeCloseTo(atMoment.ascendant, 6);
      expect(fromArmc.midheaven, system).toBeCloseTo(atMoment.midheaven, 6);
      expect(fromArmc.vertex, system).toBeCloseTo(atMoment.vertex, 6);
      expect(fromArmc.equatorialAscendant, system).toBeCloseTo(atMoment.equatorialAscendant, 6);
      expect(fromArmc.armc, system).toBeCloseTo(atMoment.armc, 6);
      for (let house = 1; house <= 12; house += 1) {
        expect(fromArmc.cusps[house], `${system} cusp ${String(house)}`).toBeCloseTo(
          atMoment.cusps[house] ?? Number.NaN,
          6,
        );
      }
    }
  });

  it('puts the MC at the ARMC at each equinox and solstice, where right ascension and longitude coincide', async () => {
    const obliquity = await engine.obliquity(JD);
    for (const armc of [0, 90, 180, 270]) {
      const result = await engine.housesFromArmc(armc, AMSTERDAM.latitude, obliquity, 'P');
      expect(result.midheaven, String(armc)).toBeCloseTo(armc, 9);
      expect(result.armc, String(armc)).toBeCloseTo(armc, 9);
    }
  });

  it('returns all 36 Gauquelin sectors through the shared reader, as houses does', async () => {
    const obliquity = await engine.obliquity(JD);
    const atMoment = await engine.houses(JD, AMSTERDAM, 'G');
    const fromArmc = await engine.housesFromArmc(atMoment.armc, AMSTERDAM.latitude, obliquity, 'G');
    expect(fromArmc.cusps).toHaveLength(atMoment.cusps.length);
    expect(fromArmc.cusps).toHaveLength(37);
    for (let sector = 1; sector <= 36; sector += 1) {
      expect(fromArmc.cusps[sector], `sector ${String(sector)}`).toBeCloseTo(atMoment.cusps[sector] ?? Number.NaN, 6);
    }
  });

  it('falls back to Porphyry inside the polar circle with the library message, as houses does', async () => {
    const atMoment = await engine.houses(JD, POLAR, 'P');
    const result = await engine.housesFromArmc(atMoment.armc, POLAR.latitude, await engine.obliquity(JD), 'P');
    expect(result.system).toBe('O');
    expect(result.warning).toContain('switched to Porphyry');
    expect(result.ascendant).toBeCloseTo(atMoment.ascendant, 6);
  });

  it('still refuses the Sunshine system when no Sun declination is given (#1935 regression guard)', async () => {
    const call = engine.housesFromArmc(100, AMSTERDAM.latitude, 23.44, 'I');
    await expect(call).rejects.toBeInstanceOf(EphemerisError);
    await expect(call).rejects.toThrow(/^House system 'I' \(Sunshine\) needs the Sun's declination\.$/);
  });

  it('casts Sunshine from an explicit Sun declination, and the cusps move when it changes (#1935)', async () => {
    const obliquity = await engine.obliquity(JD);
    const low = await engine.housesFromArmc(100, AMSTERDAM.latitude, obliquity, 'I', 5);
    const high = await engine.housesFromArmc(100, AMSTERDAM.latitude, obliquity, 'I', 20);
    for (const result of [low, high]) {
      expect(result.system).toBe('I');
      for (let house = 1; house <= 12; house += 1) expect(Number.isFinite(result.cusps[house])).toBe(true);
    }
    expect(Math.abs((low.cusps[2] ?? 0) - (high.cusps[2] ?? 0))).toBeGreaterThan(0.01);
  });

  it('reads the declination from ascmc[9]: matches the engine own Sunshine cast at a real moment (#1935)', async () => {
    // Reference: swe_houses_ex2 for 'I' at a real moment, which finds the Sun's declination itself. Feeding
    // housesFromArmc that moment's ARMC, true obliquity and tropical Sun declination must give the same cusps.
    const obliquity = await engine.obliquity(JD);
    const [sun] = await engine.positions(JD, [0], { equatorial: true });
    const atMoment = await engine.houses(JD, AMSTERDAM, 'I');
    const fromArmc = await engine.housesFromArmc(
      atMoment.armc,
      AMSTERDAM.latitude,
      obliquity,
      'I',
      sun?.latitude ?? Number.NaN,
    );
    expect(fromArmc.system).toBe('I');
    for (let house = 1; house <= 12; house += 1) {
      expect(fromArmc.cusps[house], `cusp ${String(house)}`).toBeCloseTo(atMoment.cusps[house] ?? Number.NaN, 4);
    }
    expect(fromArmc.ascendant).toBeCloseTo(atMoment.ascendant, 4);
  });
});
