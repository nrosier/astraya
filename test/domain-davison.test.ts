/**
 * Tests for computeDavison and its place midpoints (#1406).
 *
 * The great-circle checks are made from first principles (haversine distances, a triple-product
 * coplanarity test), so no expected value here is invented. The arithmetic method is checked on
 * the worked example in Davison, Synastry (1983), pp. 245-248. Positions are checked against the
 * committed JPL Horizons fixture with the tolerances `golden-chart.test.ts` uses.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arithmeticMidpoint, computeDavison, greatCircleMidpoint, midheavenTarget } from '../src/domain/davison.js';
import { civilFromJulianDay } from '../src/time/julian.js';
import { localMeanTimeOffsetMinutes } from '../src/time/zones.js';
import type { BirthMomentInput, Coordinates } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = (b.latitude - a.latitude) * RAD;
  const dLon = (b.longitude - a.longitude) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function unit(p: Coordinates): [number, number, number] {
  const lat = p.latitude * RAD;
  const lon = p.longitude * RAD;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** Scalar triple product of three unit vectors: zero when all three lie on one great circle. */
function tripleProduct(a: Coordinates, b: Coordinates, c: Coordinates): number {
  const [ax, ay, az] = unit(a);
  const [bx, by, bz] = unit(b);
  const [cx, cy, cz] = unit(c);
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
}

const PAIRS: readonly (readonly [Coordinates, Coordinates])[] = [
  [
    { latitude: 38.7478, longitude: -85.0672 },
    { latitude: 51.5072, longitude: -0.1276 },
  ],
  [
    { latitude: -33.8688, longitude: 151.2093 },
    { latitude: 40.7128, longitude: -74.006 },
  ],
  [
    { latitude: 35.6762, longitude: 139.6503 },
    { latitude: -22.9068, longitude: -43.1729 },
  ],
];

describe('greatCircleMidpoint', () => {
  it('is equidistant from both places', () => {
    for (const [a, b] of PAIRS) {
      const mid = greatCircleMidpoint(a, b);
      expect(Math.abs(haversineKm(a, mid) - haversineKm(b, mid))).toBeLessThan(1e-6);
      // And it is the halfway point of the whole route, not just any equidistant point.
      expect(Math.abs(haversineKm(a, mid) * 2 - haversineKm(a, b))).toBeLessThan(1e-6);
    }
  });

  it('lies on the great circle through both places', () => {
    for (const [a, b] of PAIRS) {
      expect(Math.abs(tripleProduct(a, b, greatCircleMidpoint(a, b)))).toBeLessThan(1e-12);
    }
  });

  it('equals the arithmetic mean for two places on the same meridian', () => {
    const a = { latitude: 10, longitude: 30 };
    const b = { latitude: 50, longitude: 30 };
    const great = greatCircleMidpoint(a, b);
    const arithmetic = arithmeticMidpoint(a, b);
    expect(great.latitude).toBeCloseTo(arithmetic.latitude, 9);
    expect(great.longitude).toBeCloseTo(arithmetic.longitude, 9);
  });

  it('gives the same result whichever person is first', () => {
    for (const [a, b] of PAIRS) {
      const ab = greatCircleMidpoint(a, b);
      const ba = greatCircleMidpoint(b, a);
      expect(ab.latitude).toBeCloseTo(ba.latitude, 12);
      expect(ab.longitude).toBeCloseTo(ba.longitude, 12);
    }
  });

  it('crosses the 180 degree meridian the short way (170 E and 170 W)', () => {
    const mid = greatCircleMidpoint({ latitude: 0, longitude: 170 }, { latitude: 0, longitude: -170 });
    expect(Math.abs(mid.longitude)).toBeCloseTo(180, 9);
    expect(mid.latitude).toBeCloseTo(0, 9);

    const north = greatCircleMidpoint({ latitude: 20, longitude: 170 }, { latitude: 20, longitude: -170 });
    expect(Math.abs(north.longitude)).toBeCloseTo(180, 9);
  });

  it('refuses antipodal places, which have no unique midpoint', () => {
    expect(() => greatCircleMidpoint({ latitude: 10, longitude: 20 }, { latitude: -10, longitude: -160 })).toThrow(
      /antipodal/,
    );
  });
});

describe('arithmeticMidpoint (Davison 1983, pp. 245-248)', () => {
  it('reproduces the worked latitude and longitude arithmetic', () => {
    // Same-hemisphere example: 51 N 32 and 39 N 18 (the book's total 90 N 50 fixes the Duchess at 39 N 18).
    const north = arithmeticMidpoint(
      { latitude: 51 + 32 / 60, longitude: 0 },
      { latitude: 39 + 18 / 60, longitude: 0 },
    );
    expect(north.latitude).toBeCloseTo(45 + 25 / 60, 9); // 45 N 25

    // Opposite hemispheres: 51 S 32 and 39 N 18 -> subtract the half difference 45 25 from 51 32 = 6 S 07.
    const south = arithmeticMidpoint(
      { latitude: -(51 + 32 / 60), longitude: 0 },
      { latitude: 39 + 18 / 60, longitude: 0 },
    );
    expect(south.latitude).toBeCloseTo(-(6 + 7 / 60), 9);

    // Longitude: 0 W 05 and 76 W 38 -> total 76 W 43, halved 38 W 21 1/2.
    const west = arithmeticMidpoint({ latitude: 0, longitude: -5 / 60 }, { latitude: 0, longitude: -(76 + 38 / 60) });
    expect(west.longitude).toBeCloseTo(-(38 + 21.5 / 60), 9);
  });

  it('subtracts the half difference from the larger value when longitudes differ in sign', () => {
    // 20 E and 50 W: half difference 35 taken from 50 W leaves 15 W.
    const mid = arithmeticMidpoint({ latitude: 0, longitude: 20 }, { latitude: 0, longitude: -50 });
    expect(mid.longitude).toBeCloseTo(-15, 12);
  });
});

describe('computeDavison time midpoint', () => {
  // The book's worked example (pp. 246-247): Duke 22:12 LMT, 23 June 1894, London; Duchess 05:15 LMT,
  // 19 June 1896, Baltimore. Each civil time is given as LMT by stating the longitude's own LMT offset.
  const dukeLon = -5 / 60;
  const duchessLon = -(76 + 38 / 60);
  const duke: BirthMomentInput = {
    civil: { year: 1894, month: 6, day: 23, hour: 22, minute: 12, second: 0 },
    coordinates: { latitude: 51 + 32 / 60, longitude: dukeLon },
    offsetOverrideMinutes: localMeanTimeOffsetMinutes(dukeLon),
  };
  const duchess: BirthMomentInput = {
    civil: { year: 1896, month: 6, day: 19, hour: 5, minute: 15, second: 0 },
    coordinates: { latitude: 39 + 18 / 60, longitude: duchessLon },
    offsetOverrideMinutes: localMeanTimeOffsetMinutes(duchessLon),
  };

  it('meets halfway in Local Mean Time (the book gives 1h 43 1/2m a.m. LMT, 22 June 1895)', async () => {
    const engine = await getEngine();
    const data = await computeDavison(duke, duchess, engine, { placeMethod: 'arithmetic' });
    const lmt = civilFromJulianDay(data.castJd + localMeanTimeOffsetMinutes(data.castPlace.longitude) / 1440);
    expect(lmt).toEqual({ year: 1895, month: 6, day: 22, hour: 1, minute: 43, second: 30 });
    expect(data.castPlace.longitude).toBeCloseTo(-(38 + 21.5 / 60), 9);
    expect(data.castPlace.latitude).toBeCloseTo(45 + 25 / 60, 9);
  });

  it('converts both births to LMT before the midpoint, then back to UT at the cast longitude', async () => {
    const engine = await getEngine();
    // Fixed date, deliberately given as civil UTC (offset 0) at far-apart longitudes: a plain UT
    // mean would ignore the longitudes, an LMT mean does not.
    const a: BirthMomentInput = {
      civil: { year: 2000, month: 3, day: 10, hour: 12, minute: 0, second: 0 },
      coordinates: { latitude: 40, longitude: 120 },
      offsetOverrideMinutes: 0,
    };
    const b: BirthMomentInput = {
      civil: { year: 2000, month: 3, day: 20, hour: 12, minute: 0, second: 0 },
      coordinates: { latitude: 40, longitude: -60 },
      offsetOverrideMinutes: 0,
    };
    const data = await computeDavison(a, b, engine);
    const jdA = await engine.julianDayFromUtc(2000, 3, 10, 12, 0, 0);
    const jdB = await engine.julianDayFromUtc(2000, 3, 20, 12, 0, 0);

    const lmtA = jdA + localMeanTimeOffsetMinutes(120) / 1440;
    const lmtB = jdB + localMeanTimeOffsetMinutes(-60) / 1440;
    const expected = (lmtA + lmtB) / 2 - localMeanTimeOffsetMinutes(data.castPlace.longitude) / 1440;
    expect(data.castJd).toBeCloseTo(expected, 9);
    // The cast place sits at longitude 30 E on this route's far side; the LMT route is not the UT mean.
    expect(Math.abs(data.castJd - (jdA + jdB) / 2)).toBeGreaterThan(1e-4);
  });

  it('is unchanged by swapping the two people', async () => {
    const engine = await getEngine();
    const ab = await computeDavison(duke, duchess, engine);
    const ba = await computeDavison(duchess, duke, engine);
    expect(ab.castJd).toBeCloseTo(ba.castJd, 9);
    expect(ab.castPlace.latitude).toBeCloseTo(ba.castPlace.latitude, 9);
    expect(ab.castPlace.longitude).toBeCloseTo(ba.castPlace.longitude, 9);
  });
});

describe('computeDavison chart', () => {
  it('casts houses at the latitude of the cast place and names the method', async () => {
    const engine = await getEngine();
    const a: BirthMomentInput = {
      civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
      coordinates: { latitude: 38.7478, longitude: -85.0672 },
      offsetOverrideMinutes: -300,
    };
    const b: BirthMomentInput = {
      civil: { year: 1988, month: 11, day: 2, hour: 3, minute: 15, second: 0 },
      coordinates: { latitude: 51.5072, longitude: -0.1276 },
      offsetOverrideMinutes: 0,
    };
    const great = await computeDavison(a, b, engine);
    expect(great.placeMethod).toBe('great-circle');
    expect(great.davison.houses.cusps).toHaveLength(13);
    expect(great.chartA.positions.length).toBe(great.davison.positions.length);

    const direct = await engine.houses(great.castJd, great.castPlace, 'P');
    expect(great.davison.houses.ascendant).toBeCloseTo(direct.ascendant, 9);

    const book = await computeDavison(a, b, engine, { placeMethod: 'arithmetic' });
    expect(book.placeMethod).toBe('arithmetic');
    expect(book.castPlace.latitude).toBeCloseTo((38.7478 + 51.5072) / 2, 12);
    // The two methods differ for distant birthplaces, so the place (and so the houses) differ.
    expect(great.castPlace.latitude).not.toBeCloseTo(book.castPlace.latitude, 3);
  });

  it('matches the JPL Horizons J2000 fixture when the cast moment is J2000', async () => {
    const engine = await getEngine();
    // Two births exactly 24 h either side of J2000 at Greenwich: their midpoint is 2000-01-01 12:00 UT.
    const before: BirthMomentInput = {
      civil: { year: 1999, month: 12, day: 31, hour: 12, minute: 0, second: 0 },
      coordinates: { latitude: 10, longitude: 0 },
      offsetOverrideMinutes: 0,
    };
    const after: BirthMomentInput = {
      civil: { year: 2000, month: 1, day: 2, hour: 12, minute: 0, second: 0 },
      coordinates: { latitude: 30, longitude: 0 },
      offsetOverrideMinutes: 0,
    };
    const data = await computeDavison(before, after, engine);
    const j2000 = await engine.julianDayFromUtc(2000, 1, 1, 12, 0, 0);
    expect(Math.abs(data.castJd - j2000)).toBeLessThan(1e-9);

    const fixture = JSON.parse(
      readFileSync(resolve(import.meta.dirname, 'fixtures/horizons-positions.json'), 'utf8'),
    ) as {
      positions: Record<string, Record<string, { se: number; longitude: number }>>;
    };
    const reference = fixture.positions.j2000;
    if (reference === undefined) throw new Error('fixture has no j2000 positions');

    // Same tolerances as test/golden-chart.test.ts (historical 0.2", main-belt asteroids 2.5").
    const asteroids = new Set(['Ceres', 'Pallas', 'Juno', 'Vesta']);
    let compared = 0;
    for (const [name, ref] of Object.entries(reference)) {
      const position = data.davison.positions.find((p) => p.body === ref.se);
      if (position === undefined) continue;
      compared += 1;
      const tolerance = asteroids.has(name) ? 2.5 : 0.2;
      expect(arcsecondsBetween(position.longitude, ref.longitude), `${name} longitude`).toBeLessThan(tolerance);
    }
    expect(compared).toBeGreaterThanOrEqual(10);
  });
});

describe('Midheaven adjustment (Davison 1983, p. 247)', () => {
  const dukeLon = -5 / 60;
  const duchessLon = -(76 + 38 / 60);
  const duke: BirthMomentInput = {
    civil: { year: 1894, month: 6, day: 23, hour: 22, minute: 12, second: 0 },
    coordinates: { latitude: 51 + 32 / 60, longitude: dukeLon },
    offsetOverrideMinutes: localMeanTimeOffsetMinutes(dukeLon),
  };
  const duchess: BirthMomentInput = {
    civil: { year: 1896, month: 6, day: 19, hour: 5, minute: 15, second: 0 },
    coordinates: { latitude: 39 + 18 / 60, longitude: duchessLon },
    offsetOverrideMinutes: localMeanTimeOffsetMinutes(duchessLon),
  };

  it('picks the mid-point of the natal Midheavens the time midpoint is nearer to', () => {
    // 350 and 10 degrees: the near mid-point is 0, its opposite 180.
    expect(midheavenTarget(350, 10, 5)).toBeCloseTo(0, 9);
    expect(midheavenTarget(350, 10, 170)).toBeCloseTo(180, 9);
    expect(midheavenTarget(10, 350, 355)).toBeCloseTo(0, 9);
  });

  it('is off by default', async () => {
    const engine = await getEngine();
    const data = await computeDavison(duke, duchess, engine, { placeMethod: 'arithmetic' });
    expect(data.midheavenShiftMinutes).toBe(0);
  });

  it('gives the worked-example Midheaven, 26 Capricorn 27 (p. 247), and keeps the shift small', async () => {
    const engine = await getEngine();
    const plain = await computeDavison(duke, duchess, engine, { placeMethod: 'arithmetic' });
    const data = await computeDavison(duke, duchess, engine, { placeMethod: 'arithmetic', adjustMidheaven: true });

    const mcA = data.chartA.houses.midheaven;
    const mcB = data.chartB.houses.midheaven;
    const expected = midheavenTarget(mcA, mcB, plain.davison.houses.midheaven);
    // The adjusted chart's Midheaven is exactly the chosen mid-point of the natal Midheavens.
    expect(arcsecondsBetween(data.davison.houses.midheaven, expected)).toBeLessThan(0.01);

    // Book value: 26 Capricorn 27 = 270 + 26 + 27/60 degrees. The book read its Midheavens from
    // printed tables, so allow 0.15 degree (9 arcminutes) for table rounding.
    const book = 270 + 26 + 27 / 60;
    expect(Math.abs(data.davison.houses.midheaven - book)).toBeLessThan(0.15);

    // "The small amount necessary": a few minutes of time, not hours.
    expect(Math.abs(data.midheavenShiftMinutes)).toBeLessThan(30);
    expect(Math.abs(data.midheavenShiftMinutes)).toBeGreaterThan(0);
  });
});
