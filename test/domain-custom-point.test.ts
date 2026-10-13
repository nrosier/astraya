/**
 * Integration tests for resolveChartIdentifier/customPointLongitude (#566) against a real
 * computed chart — the formula parser itself is covered without an engine in
 * astrology-formula-parser.test.ts; this is specifically the "which identifier names does a
 * real ChartData actually have" half.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { aspectRows, chartWheelRing, positionRows } from '../src/domain/chart-tables.js';
import { customPointLongitude, FormulaError, resolveChartIdentifier } from '../src/domain/custom-point.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('resolveChartIdentifier (#566)', () => {
  it('resolves a body key to its real longitude', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine);
    const sunId = bodyByKey('sun')?.id;
    const sunLongitude = data.positions.find((p) => p.body === sunId)?.longitude;
    expect(sunLongitude).toBeDefined();
    expect(resolveChartIdentifier(data, 'sun')).toBeCloseTo(sunLongitude ?? NaN, 9);
  });

  it('resolves angle/lot names, case-insensitively', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine);
    expect(resolveChartIdentifier(data, 'Ascendant')).toBeCloseTo(data.houses.ascendant, 9);
    expect(resolveChartIdentifier(data, 'MC')).toBeCloseTo(data.houses.midheaven, 9);
    expect(resolveChartIdentifier(data, 'fortune')).toBeCloseTo(data.partOfFortune, 9);
  });

  it('returns undefined for an unknown name, including prototype-chain-shaped ones', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine);
    expect(resolveChartIdentifier(data, 'not-a-real-point')).toBeUndefined();
    // The real regression this guards: a plain-object-literal lookup table would return
    // Object.prototype (not undefined) for these, since every object has a __proto__.
    expect(resolveChartIdentifier(data, '__proto__')).toBeUndefined();
    expect(resolveChartIdentifier(data, 'constructor')).toBeUndefined();
    expect(resolveChartIdentifier(data, 'toString')).toBeUndefined();
  });
});

describe('customPointLongitude (#566)', () => {
  it('reproduces the Part of Fortune day-formula exactly (ascendant + moon - sun)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine);
    // This chart happens to be a day chart or night chart depending on the Sun's house — try
    // whichever sect-appropriate formula matches, same as arabic-parts.ts's own day/night swap.
    const dayFormula = customPointLongitude(data, 'ascendant + moon - sun');
    const nightFormula = customPointLongitude(data, 'ascendant + sun - moon');
    expect([dayFormula, nightFormula]).toContainEqual(expect.closeTo(data.partOfFortune, 6));
  });

  it('throws FormulaError for a formula referencing a body not in this build’s vocabulary', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine);
    expect(() => customPointLongitude(data, 'sun + nibiru')).toThrow(FormulaError);
  });
});

describe('materialized custom points (#573)', () => {
  it('adds stable named positions and standard-orb aspects to the shared chart data', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine, {
      customPoints: [{ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' }],
    });

    const [point] = data.customPoints ?? [];
    expect(point).toMatchObject({ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' });
    expect(point?.body).toBeLessThan(-1);
    expect(data.positions.find((position) => position.body === point?.body)?.longitude).toBeCloseTo(
      customPointLongitude(data, 'ascendant + moon - sun'),
      9,
    );
    expect(positionRows(data).some((row) => row.bodyName === 'Fortune-like')).toBe(true);
    expect(chartWheelRing(data).bodies.some((body) => body.key === 'Fortune-like')).toBe(true);
    expect(aspectRows(data).some((row) => row.bodyAName === 'Fortune-like' || row.bodyBName === 'Fortune-like')).toBe(
      true,
    );
  });

  it('keeps a disabled definition persisted but omits it from chart positions and aspects', async () => {
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine, {
      customPoints: [{ id: 'disabled-point', name: 'Disabled point', formula: 'sun + moon', enabled: false }],
    });

    expect(data.customPoints).toBeUndefined();
    expect(positionRows(data).some((row) => row.bodyName === 'Disabled point')).toBe(false);
  });
});

describe('redundantBuiltInPoint (#566)', () => {
  it('identifies a formula that duplicates a built-in point, without executing code', async () => {
    const { redundantBuiltInPoint } = await import('../src/domain/custom-point.js');
    const engine = await getEngine();
    const data = await computeChartData(PERSON, engine);
    expect(redundantBuiltInPoint(data, 'Sun')).toBe('sun');
    expect(redundantBuiltInPoint(data, 'Sun + Moon - Ascendant')).toBeUndefined();
  });
});
