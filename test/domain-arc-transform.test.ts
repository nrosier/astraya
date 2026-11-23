/**
 * The arc-transform chart (#1407), Solar Fire Deluxe guide §12.6 (PDF p. 85): every longitude multiplied by a harmonic
 * "calculated from the longitudinal separation between a pair of points ... bringing that planetary pair into exact
 * conjunction". The formula, 360 divided by the raw difference of the two longitudes (both in 0-360), is Astraya's
 * reading (owner decisions on #1407, 2026-11-21 and 2026-11-23).
 */
import { describe, expect, it } from 'vitest';
import { harmonicLongitude } from '../src/astrology/harmonics.js';
import { arcTransformHarmonic, computeArcTransform } from '../src/domain/harmonic.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const SUN = 0;
const MOON = 1;

describe('arcTransformHarmonic (#1407)', () => {
  it.each([
    [10, 40, 12],
    [100, 235, 360 / 135],
    [350, 20, 360 / 330],
    [347.3, 21.9, 360 / 325.4],
  ])('%s° and %s° give %s, and the pair lands in exact conjunction', (a, b, expected) => {
    const n = arcTransformHarmonic(a, b);
    expect(n).toBeCloseTo(expected, 12);
    expect(harmonicLongitude(a, n)).toBeCloseTo(harmonicLongitude(b, n), 9);
  });

  it('uses the raw difference of the longitudes, past 180° too, in either order', () => {
    expect(arcTransformHarmonic(0, 200)).toBeCloseTo(360 / 200, 12);
    expect(arcTransformHarmonic(200, 0)).toBeCloseTo(360 / 200, 12);
  });

  it('would miss the conjunction with the shorter arc across 0° Aries: why the raw difference is used', () => {
    const shorter = 360 / 34.6; // 347.3° and 21.9° are 34.6° apart the short way, across 0° Aries
    const gap = Math.abs(harmonicLongitude(347.3, shorter) - harmonicLongitude(21.9, shorter));
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(1);
  });

  it('refuses a pair that already conjoins', () => {
    expect(() => arcTransformHarmonic(123.4, 123.4)).toThrow(/already conjoin/);
  });
});

describe('computeArcTransform (#1407)', () => {
  it('puts the Sun and Moon in exact conjunction and says the formula is Astraya’s reading', async () => {
    const engine = await getEngine();
    const data = await computeArcTransform(PERSON, SUN, MOON, engine);
    const sun = data.harmonic.positions.find((position) => position.body === SUN)?.longitude ?? Number.NaN;
    const moon = data.harmonic.positions.find((position) => position.body === MOON)?.longitude ?? Number.NaN;
    const gap = Math.abs(sun - moon);
    expect(Math.min(gap, 360 - gap)).toBeLessThan(1e-6);
    expect(data.harmonicNumber).toBeCloseTo(360 / data.separation, 12);
    expect(data.separation).toBeGreaterThan(0);
    expect(data.separation).toBeLessThan(360);
    expect(data.basis).toBe('astraya-reading-sf-p85');
    expect(data.harmonic.houses.system).toBe('W');
  });

  it('refuses a body that is not in the chart', async () => {
    const engine = await getEngine();
    await expect(computeArcTransform(PERSON, SUN, 99_999, engine)).rejects.toThrow(/not in this chart/);
  });

  it('multiplies every body and the Ascendant by the same harmonic', async () => {
    const engine = await getEngine();
    const data = await computeArcTransform(PERSON, SUN, MOON, engine);
    for (const [index, position] of data.harmonic.positions.entries()) {
      const natal = data.natal.positions[index]?.longitude ?? Number.NaN;
      expect(position.longitude).toBeCloseTo(harmonicLongitude(natal, data.harmonicNumber), 9);
    }
    expect(data.harmonic.houses.ascendant).toBeCloseTo(
      harmonicLongitude(data.natal.houses.ascendant, data.harmonicNumber),
      9,
    );
  });

  it('conjoins a real pair that straddles 0° Aries', async () => {
    const engine = await getEngine();
    const natal = (await computeArcTransform(PERSON, SUN, MOON, engine)).natal;
    // Find two bodies on either side of 0° Aries in this chart (one in Pisces-Aquarius, one in Aries-Taurus).
    const late = natal.positions.find((position) => position.longitude > 300);
    const early = natal.positions.find((position) => position.longitude < 60);
    expect(late).toBeDefined();
    expect(early).toBeDefined();
    if (late === undefined || early === undefined) return;
    const data = await computeArcTransform(PERSON, late.body, early.body, engine);
    const a = data.harmonic.positions.find((position) => position.body === late.body)?.longitude ?? Number.NaN;
    const b = data.harmonic.positions.find((position) => position.body === early.body)?.longitude ?? Number.NaN;
    const gap = Math.abs(a - b);
    expect(Math.min(gap, 360 - gap)).toBeLessThan(1e-6);
    expect(data.separation).toBeGreaterThan(180);
  });
});
