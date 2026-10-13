/**
 * The aspect matrix with the Vertex and both parts switched on (#516), on the real engine: a
 * point gets a matrix row exactly when the user has made it visible (#542) — not merely because
 * it happens to aspect something — every drawn aspect refers to a row, and the SVG has no NaN
 * coordinates.
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

const WIDE_ORB_CONFIG = {
  majorOrb: { base: 12, luminaryBonus: 3 },
  sextileOrb: { base: 8, luminaryBonus: 1.5 },
  minorOrb: 2.5,
  scalePercent: 0,
  enabledMinorAspects: [],
};

describe('aspect matrix with point aspects (#516, #542)', () => {
  it('aspectsTo alone is not enough — Vertex/Fortune/Spirit stay off the matrix until also made visible', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      orbConfig: WIDE_ORB_CONFIG,
      aspectsTo: { vertex: true, partOfFortune: true, partOfSpirit: true },
    });
    expect(data.angleAspects?.some((aspect) => aspect.angle === 'vertex')).toBe(true);

    // No visibility options at all: aspectsTo made them real candidates at compute time, but
    // nothing has asked to see any of them, so none gets a matrix row — the exact #542 fix.
    const hidden = chartSheetInput(data);
    const hiddenKeys = new Set(hidden.matrix.bodies.map((body) => body.key));
    for (const point of ['vertex', 'partOfFortune', 'partOfSpirit']) expect(hiddenKeys.has(point)).toBe(false);
    for (const aspect of hidden.matrix.aspects) {
      expect(['vertex', 'partOfFortune', 'partOfSpirit']).not.toContain(aspect.aKey);
    }

    // All three made visible: each gets exactly one row, used by every aspect that refers to it.
    const shown = chartSheetInput(data, [], 'Natal', {
      vertexVisible: true,
      fortuneVisible: true,
      spiritVisible: true,
    });
    const shownKeys = new Set(shown.matrix.bodies.map((body) => body.key));
    for (const point of ['vertex', 'partOfFortune', 'partOfSpirit']) expect(shownKeys.has(point)).toBe(true);
    expect(shown.matrix.bodies.filter((body) => body.key === 'vertex')).toHaveLength(1);
    for (const aspect of shown.matrix.aspects) {
      expect(shownKeys.has(aspect.aKey)).toBe(true);
      expect(shownKeys.has(aspect.bKey)).toBe(true);
    }
  });

  it('a visible point gets a row even with zero aspects, same as an ordinary body', async () => {
    const engine = await getEngine();
    // Narrow orbs, no aspectsTo at all: Vertex/Fortune/Spirit are visible but (very likely)
    // aspectless under these settings — the point of this test, not a fixture to avoid.
    const data = await computeChartData(MOMENT, engine, {
      orbConfig: {
        ...WIDE_ORB_CONFIG,
        majorOrb: { base: 0.01, luminaryBonus: 0 },
        sextileOrb: { base: 0, luminaryBonus: 0 },
      },
    });
    const { matrix } = chartSheetInput(data, [], 'Natal', { vertexVisible: true, fortuneVisible: true });
    const keys = new Set(matrix.bodies.map((body) => body.key));
    expect(keys.has('vertex')).toBe(true);
    expect(keys.has('partOfFortune')).toBe(true);
    expect(matrix.aspects.some((aspect) => aspect.aKey === 'vertex' || aspect.aKey === 'partOfFortune')).toBe(false);
  });

  it('renders a clean SVG with every point visible', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      orbConfig: WIDE_ORB_CONFIG,
      aspectsTo: {
        chiron: true,
        lilith: true,
        lunarNodes: true,
        vertex: true,
        partOfFortune: true,
        partOfSpirit: true,
      },
    });
    const { matrix } = chartSheetInput(data, [], 'Natal', {
      chironVisible: true,
      vertexVisible: true,
      fortuneVisible: true,
      spiritVisible: true,
    });
    const { markup, height } = renderAspectMatrixSvg(matrix, { x: 0, y: 0, width: 1000 });
    expect(markup).not.toContain('NaN');
    expect(height).toBeGreaterThan(0);
  });
});
