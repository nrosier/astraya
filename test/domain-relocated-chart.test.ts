/**
 * Integration tests for computeRelocatedChart/relocatedComparisonRows (#559).
 *
 * Runs against the real Swiss Ephemeris engine: a relocation genuinely changes which houses the
 * engine resolves, so this needs a real houses() call, not just arithmetic.
 */
import { describe, expect, it } from 'vitest';
import { computeRelocatedChart, relocatedComparisonRows } from '../src/domain/relocated-chart.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 }, // Louisville, KY
  offsetOverrideMinutes: -240,
};

// Sydney, Australia — far enough from the birthplace that houses/angles are guaranteed to shift.
const SYDNEY = { latitude: -33.8688, longitude: 151.2093, altitude: 0 };

// Swiss Ephemeris 2.10 `swe_houses_ex` reference vector for the fixed UTC moment above,
// using Placidus houses at Sydney. The independently pinned values cover every axis quadrant.
const SYDNEY_REFERENCE = {
  natal: {
    ascendant: 185.02162279590797,
    midheaven: 95.70221351248591,
  },
  relocated: {
    ascendant: 52.0848252660692,
    midheaven: 330.41676079123437,
    cusp4: 150.41676079123437,
    cusp7: 232.0848252660692,
  },
};

describe('computeRelocatedChart (#559)', () => {
  it('computes full, independent ChartData for the natal chart and the relocated chart', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, SYDNEY, engine);

    expect(data.natal.positions.length).toBeGreaterThan(0);
    expect(data.relocated.positions.length).toBe(data.natal.positions.length);
    expect(data.relocationPlace).toEqual(SYDNEY);
  });

  it('keeps every planetary longitude identical between natal and relocated (#559’s own claim)', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, SYDNEY, engine);

    for (const relocatedPos of data.relocated.positions) {
      const natal = data.natal.positions.find((p) => p.body === relocatedPos.body);
      expect(natal).toBeDefined();
      if (natal === undefined) continue;
      expect(relocatedPos.longitude).toBeCloseTo(natal.longitude, 9);
    }
  });

  it('changes the Ascendant/houses for a relocation far from the birthplace', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, SYDNEY, engine);
    expect(data.relocated.houses.ascendant).not.toBeCloseTo(data.natal.houses.ascendant, 2);
  });

  it('relocating back to the birthplace itself reproduces the natal houses', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, { ...PERSON.coordinates, altitude: 0 }, engine);
    expect(data.relocated.houses.ascendant).toBeCloseTo(data.natal.houses.ascendant, 6);
    expect(data.relocated.houses.midheaven).toBeCloseTo(data.natal.houses.midheaven, 6);
  });

  it('matches the fixed Swiss Ephemeris Sydney reference for angles and houses (#559)', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, SYDNEY, engine);
    expect(data.natal.houses.ascendant).toBeCloseTo(SYDNEY_REFERENCE.natal.ascendant, 6);
    expect(data.natal.houses.midheaven).toBeCloseTo(SYDNEY_REFERENCE.natal.midheaven, 6);
    expect(data.relocated.houses.ascendant).toBeCloseTo(SYDNEY_REFERENCE.relocated.ascendant, 6);
    expect(data.relocated.houses.midheaven).toBeCloseTo(SYDNEY_REFERENCE.relocated.midheaven, 6);
    expect(data.relocated.houses.cusps[4]).toBeCloseTo(SYDNEY_REFERENCE.relocated.cusp4, 6);
    expect(data.relocated.houses.cusps[7]).toBeCloseTo(SYDNEY_REFERENCE.relocated.cusp7, 6);
  });

  it('materializes custom points against each chart’s own angles', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, SYDNEY, engine, {
      customPoints: [{ id: 'formula-point', name: 'Formula point', formula: 'ascendant + moon - sun' }],
    });

    const [natalPoint] = data.natal.customPoints ?? [];
    const [relocatedPoint] = data.relocated.customPoints ?? [];
    expect(relocatedPoint?.body).toBe(natalPoint?.body);
    expect(relocatedPoint?.name).toBe('Formula point');
    expect(relocatedPoint?.position.longitude).not.toBeCloseTo(natalPoint?.position.longitude ?? NaN, 6);
  });
});

describe('relocatedComparisonRows (#559)', () => {
  it('pairs every natal house/angle with its relocated counterpart, same count both charts', async () => {
    const engine = await getEngine();
    const data = await computeRelocatedChart(PERSON, SYDNEY, engine);
    const rows = relocatedComparisonRows(data);

    expect(rows).toHaveLength(12 + 2 + 5); // 12 houses + Ascendant/Midheaven + angleRows' own 5 auxiliary angles (vertex excluded by default)
    for (const row of rows) {
      expect(row.natal.sign).toBeDefined();
      expect(row.relocated.sign).toBeDefined();
    }
    // At least one row's natal/relocated longitude genuinely differs — the whole point of relocating.
    expect(rows.some((row) => Math.abs(row.natalLongitude - row.relocatedLongitude) > 1)).toBe(true);
  });
});
