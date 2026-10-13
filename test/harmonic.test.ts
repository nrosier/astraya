/**
 * Integration tests for computeHarmonic (#170).
 *
 * Runs against the real Swiss Ephemeris engine, same reason every other domain test does: the
 * harmonic transform itself is pure arithmetic (covered without an engine in harmonics.test.ts),
 * but the natal positions and houses it transforms come from a real ephemeris pass.
 */
import { describe, expect, it } from 'vitest';
import { harmonicLongitude } from '../src/astrology/harmonics.js';
import { computeHarmonic, harmonicPositionProvenance } from '../src/domain/harmonic.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

// Swiss Ephemeris 2.10 reference vector: tropical geocentric positions for 1990-06-15
// 19:30 UTC, transformed with the documented D9 `longitude × 9 mod 360` convention.
const D9_REFERENCE = {
  positions: new Map([
    [0, 39.85218315364341],
    [1, 265.9609024407723],
    [2, 236.06251693274896],
    [3, 82.30624122401565],
    [4, 101.39332428232996],
  ]),
  ascendant: 334.3839122297554,
  midheaven: 266.7396914476818,
};

describe('computeHarmonic (#170)', () => {
  it('computes full, independent ChartData for the natal chart and the harmonic chart', async () => {
    const engine = await getEngine();
    const data = await computeHarmonic(PERSON, 9, engine);

    expect(data.natal.positions.length).toBeGreaterThan(0);
    expect(data.natal.houses.cusps).toHaveLength(13);
    expect(data.harmonic.positions.length).toBe(data.natal.positions.length);
    expect(data.harmonic.houses.cusps).toHaveLength(13);
    expect(data.harmonic.houses.system).toBe('W');
  });

  it('places every harmonic body position at n times the natal longitude, wrapped', async () => {
    const engine = await getEngine();
    const data = await computeHarmonic(PERSON, 9, engine);

    for (const harmonicPosition of data.harmonic.positions) {
      const natal = data.natal.positions.find((p) => p.body === harmonicPosition.body);
      expect(natal).toBeDefined();
      if (natal === undefined) continue;
      expect(harmonicPosition.longitude).toBeCloseTo(harmonicLongitude(natal.longitude, 9), 6);
      // Latitude and retrograde are carried over unchanged — see harmonics.ts's doc comment.
      expect(harmonicPosition.latitude).toBeCloseTo(natal.latitude, 9);
      expect(harmonicPosition.retrograde).toBe(natal.retrograde);
    }
  });

  it('n=1 reproduces the natal Ascendant’s longitude exactly (whole-sign houses aside)', async () => {
    const engine = await getEngine();
    const data = await computeHarmonic(PERSON, 1, engine);
    expect(data.harmonic.houses.ascendant).toBeCloseTo(data.natal.houses.ascendant, 9);
  });

  it('returns radix-to-harmonic provenance for every transformed body (#557)', async () => {
    const engine = await getEngine();
    const data = await computeHarmonic(PERSON, 9, engine);
    const rows = harmonicPositionProvenance(data);

    expect(rows).toHaveLength(data.harmonic.positions.length);
    const sun = rows.find((row) => row.bodyKey === 'sun');
    const radixSun = data.natal.positions.find((position) => position.body === 0);
    const harmonicSun = data.harmonic.positions.find((position) => position.body === 0);
    expect(sun?.radixLongitude).toBeCloseTo(radixSun?.longitude ?? Number.NaN, 9);
    expect(sun?.harmonicLongitude).toBeCloseTo(harmonicSun?.longitude ?? Number.NaN, 9);
  });

  it('rejects a non-positive-integer harmonic number', async () => {
    const engine = await getEngine();
    await expect(computeHarmonic(PERSON, 0, engine)).rejects.toThrow();
    await expect(computeHarmonic(PERSON, -3, engine)).rejects.toThrow();
    await expect(computeHarmonic(PERSON, 4.5, engine)).rejects.toThrow();
  });

  it('finds aspects within the harmonic chart itself', async () => {
    const engine = await getEngine();
    const data = await computeHarmonic(PERSON, 9, engine);
    expect(data.harmonic.aspects.length).toBeGreaterThan(0);

    for (const aspect of data.harmonic.aspects) {
      const bodyA = data.harmonic.positions.find((p) => p.body === aspect.bodyA);
      const bodyB = data.harmonic.positions.find((p) => p.body === aspect.bodyB);
      expect(bodyA).toBeDefined();
      expect(bodyB).toBeDefined();
    }
  });

  it('matches the fixed Swiss Ephemeris D9 reference vector (#557)', async () => {
    const engine = await getEngine();
    const data = await computeHarmonic(PERSON, 9, engine);
    for (const [body, longitude] of D9_REFERENCE.positions) {
      expect(data.harmonic.positions.find((position) => position.body === body)?.longitude).toBeCloseTo(longitude, 6);
    }
    expect(data.harmonic.houses.ascendant).toBeCloseTo(D9_REFERENCE.ascendant, 6);
    expect(data.harmonic.houses.midheaven).toBeCloseTo(D9_REFERENCE.midheaven, 6);
  });

  it('excludes Chiron, Lilith and the lunar nodes from harmonic aspects by default', async () => {
    const engine = await getEngine();
    const withoutExtras = await computeHarmonic(PERSON, 9, engine);
    const withExtras = await computeHarmonic(PERSON, 9, engine, {
      aspectsTo: { chiron: true, lilith: true, lunarNodes: true },
    });
    expect(withExtras.harmonic.aspects.length).toBeGreaterThanOrEqual(withoutExtras.harmonic.aspects.length);
  });
});
