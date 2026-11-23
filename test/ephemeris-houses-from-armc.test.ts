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
    for (const system of ['P', 'K', 'O', 'R', 'C', 'E', 'W', 'B'] as const) {
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

  it('moves the MC by exactly the ARMC step at 0° Aries, where right ascension and longitude coincide', async () => {
    const obliquity = await engine.obliquity(JD);
    const result = await engine.housesFromArmc(0, AMSTERDAM.latitude, obliquity, 'P');
    expect(result.midheaven).toBeCloseTo(0, 9);
    expect(result.armc).toBeCloseTo(0, 9);
  });

  it('falls back to Porphyry inside the polar circle with the library message, as houses does', async () => {
    const atMoment = await engine.houses(JD, POLAR, 'P');
    const result = await engine.housesFromArmc(atMoment.armc, POLAR.latitude, await engine.obliquity(JD), 'P');
    expect(result.system).toBe('O');
    expect(result.warning).toContain('switched to Porphyry');
    expect(result.ascendant).toBeCloseTo(atMoment.ascendant, 6);
  });

  it('refuses the Sunshine system, which needs the Sun’s declination', async () => {
    await expect(engine.housesFromArmc(100, AMSTERDAM.latitude, 23.44, 'I')).rejects.toBeInstanceOf(EphemerisError);
  });
});
