/**
 * A wheel without houses (#1407, the heliocentric chart; owner decision 2026-11-14, "No houses or angles"): the
 * renderer draws no house groups, house numbers or angle axes, and orients 0° Aries on the left; the chart sheet
 * gives the angles, the Vertex and the lots no row when the houses are undefined. Real engine for the data.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMultiWheelSvg, wheelOrientationLongitude } from '../src/chart/multi-wheel.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { chartSheetInput } from '../src/domain/chart-tables.js';
import { computeHeliocentric } from '../src/domain/heliocentric.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

let engine: SwissEphemerisEngine;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

describe('a wheel without houses (#1407)', () => {
  it('draws no house groups, house numbers or angle axes, which the natal wheel does draw', async () => {
    const natal = await computeChartData(NATAL, engine);
    const ring = chartSheetInput(natal).rings;
    const withHouses = renderMultiWheelSvg(ring);
    const without = renderMultiWheelSvg(ring, [], { housesShown: false });
    expect(withHouses).toContain('data-house="1"');
    expect(withHouses).toContain('chart-multiwheel-axis');
    expect(without).not.toContain('data-house=');
    expect(without).not.toContain('chart-house-number');
    expect(without).not.toContain('chart-multiwheel-axis');
    // The bodies are still drawn.
    expect(without).toContain('data-body="mars"');
  });

  it('is oriented by 0° Aries instead of the Ascendant', async () => {
    const natal = await computeChartData(NATAL, engine);
    const [ring] = chartSheetInput(natal).rings;
    if (ring === undefined) throw new Error('no ring');
    expect(wheelOrientationLongitude(ring)).toBe(natal.houses.ascendant);
    expect(wheelOrientationLongitude(ring, { housesShown: false })).toBe(0);
  });

  it('the heliocentric sheet has no angle, Vertex or lot rows, and renders', async () => {
    const { heliocentric } = await computeHeliocentric(NATAL, engine);
    // The three points visible, so only the missing houses can keep them out.
    const input = chartSheetInput(heliocentric, [], 'Heliocentric', {
      bodyVisibility: { vertex: true, partOfFortune: true, partOfSpirit: true },
    });
    const keys = input.rings[0]?.bodies.map((body) => body.key) ?? [];
    expect(keys).toContain('earth');
    expect(JSON.stringify(input.matrix)).not.toMatch(/"(asc|mc|vertex|partOfFortune|partOfSpirit)"/);
    expect(() => renderMultiWheelSvg(input.rings, [], { housesShown: false })).not.toThrow();
  });
});
