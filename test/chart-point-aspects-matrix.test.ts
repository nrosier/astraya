/**
 * The aspect matrix with the Vertex and both parts switched on (#516), on the real engine: each point that aspects
 * a body becomes a labelled row, every drawn aspect refers to a row, and the SVG has no NaN coordinates.
 */
import { describe, expect, it } from 'vitest';
import { renderAspectMatrixSvg } from '../src/chart/aspect-matrix.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { chartSheetInput } from '../src/domain/chart-tables.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('aspect matrix with point aspects (#516)', () => {
  it('has a row for each point that aspects something, and every aspect refers to a row', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      orbConfig: {
        majorOrb: { base: 12, luminaryBonus: 3 },
        sextileOrb: { base: 8, luminaryBonus: 1.5 },
        minorOrb: 2.5,
        scalePercent: 0,
        enabledMinorAspects: [],
      },
      aspectsTo: {
        chiron: true,
        lilith: true,
        lunarNodes: true,
        vertex: true,
        partOfFortune: true,
        partOfSpirit: true,
      },
    });
    const { matrix } = chartSheetInput(data);
    const keys = new Set(matrix.bodies.map((body) => body.key));
    const aspected = new Set((data.angleAspects ?? []).map((aspect) => aspect.angle));
    for (const point of ['vertex', 'partOfFortune', 'partOfSpirit'] as const)
      expect(keys.has(point)).toBe(aspected.has(point));
    expect(aspected.size).toBeGreaterThan(2);
    for (const aspect of matrix.aspects) {
      expect(keys.has(aspect.aKey)).toBe(true);
      expect(keys.has(aspect.bKey)).toBe(true);
    }
    const { markup, height } = renderAspectMatrixSvg(matrix, { x: 0, y: 0, width: 1000 });
    expect(markup).not.toContain('NaN');
    expect(height).toBeGreaterThan(0);
  });
});
