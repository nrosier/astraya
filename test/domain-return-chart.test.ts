/** Return charts (the Charts page), against the real Swiss Ephemeris. */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { computeLunarReturnChart, computeSolarReturnChart } from '../src/domain/return-chart.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

const BIRTH: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const SUN = bodyByKey('sun')?.id ?? -1;
const MOON = bodyByKey('moon')?.id ?? -1;

function separation(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

describe('computeSolarReturnChart', () => {
  it('is a complete chart cast for the moment the Sun is back at its natal longitude', async () => {
    const natalJd = await julianDayFor(engine, resolveMoment(BIRTH));
    const natalSun = (await engine.positions(natalJd, [SUN]))[0];
    const result = await computeSolarReturnChart(BIRTH, 2025, engine);
    const returnSun = result.chart.positions.find((p) => p.body === SUN);
    expect(separation(returnSun?.longitude ?? 0, natalSun?.longitude ?? 999)).toBeLessThan(0.05);
    expect(result.chart.houses.ascendant).toBeGreaterThanOrEqual(0);
    expect(result.chart.dignities.size).toBeGreaterThan(0);
    expect(result.contacts.length).toBeGreaterThan(0);
    expect(result.place.latitude).toBeCloseTo(38.7478, 4);
  }, 60_000);

  it('casts the same moment at another place when relocated', async () => {
    const home = await computeSolarReturnChart(BIRTH, 2025, engine);
    const away = await computeSolarReturnChart(BIRTH, 2025, engine, {
      place: { latitude: -33.87, longitude: 151.21, altitude: 0 },
    });
    expect(away.returnJd).toBe(home.returnJd);
    expect(away.chart.houses.ascendant).not.toBeCloseTo(home.chart.houses.ascendant, 0);
    expect(away.place.latitude).toBeCloseTo(-33.87, 5);
  }, 60_000);
});

describe('computeLunarReturnChart', () => {
  it('finds the first Moon return on or after the date, with the Moon at its natal longitude', async () => {
    const from = await engine.julianDayFromUtc(2025, 3, 1, 0, 0, 0);
    const natalJd = await julianDayFor(engine, resolveMoment(BIRTH));
    const natalMoon = (await engine.positions(natalJd, [MOON]))[0];
    const result = await computeLunarReturnChart(BIRTH, from, engine);
    expect(result.returnJd).toBeGreaterThanOrEqual(from);
    expect(result.returnJd - from).toBeLessThan(28);
    const returnMoon = result.chart.positions.find((p) => p.body === MOON);
    expect(separation(returnMoon?.longitude ?? 0, natalMoon?.longitude ?? 999)).toBeLessThan(0.05);
  }, 60_000);
});
