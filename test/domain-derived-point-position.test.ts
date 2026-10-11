/**
 * Where a derived point falls (#511): the one locator the Derived points table and the selection inspector
 * share, against a real chart (the 1 Jan 1970 reference chart used across the selection tests).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DERIVED_POINTS } from '../src/astrology/derived-points.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { derivedPointRows } from '../src/domain/chart-tables.js';
import { derivedPointLongitude, derivedPointPlacementFacts } from '../src/domain/derived-point-position.js';
import { getEngine } from './engine-harness.js';

let chart: ChartData;

beforeAll(async () => {
  chart = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    await getEngine(),
  );
}, 60_000);

describe('derivedPointLongitude', () => {
  it('locates every point in the closed list', () => {
    expect(DERIVED_POINTS.map((point) => point.key)).toEqual(['part-of-fortune', 'part-of-spirit']);
    for (const point of DERIVED_POINTS) expect(derivedPointLongitude(chart, point.key)).toBeDefined();
  });

  it('agrees with the Derived points table row for row (same longitude, same label, same key)', () => {
    const rows = derivedPointRows(chart, { fortuneVisible: true });
    expect(rows.map((row) => row.pointKey)).toEqual(DERIVED_POINTS.map((point) => point.key));
    for (const row of rows) {
      const point = DERIVED_POINTS.find((candidate) => candidate.key === row.pointKey);
      expect(point).toBeDefined();
      if (point === undefined) continue;
      expect(row.longitude).toBe(derivedPointLongitude(chart, point.key));
      expect(row.label).toBe(point.label);
    }
  });

  it('keeps the midpoints as plain display rows: listed when asked for, with no point key to select or interpret', () => {
    const rows = derivedPointRows(chart, { midpointsVisible: true });
    expect(rows.map((row) => row.label)).toEqual(['Part of Spirit', 'ASC/MC Midpoint', 'Sun/Moon Midpoint']);
    expect(rows.map((row) => row.pointKey)).toEqual(['part-of-spirit', undefined, undefined]);
  });

  it('keeps the table’s visibility rules: Fortune and midpoints only when asked for', () => {
    expect(derivedPointRows(chart, {}).map((row) => row.pointKey)).toEqual(['part-of-spirit']);
    expect(derivedPointRows(chart, { fortuneVisible: true }).map((row) => row.pointKey)).toEqual([
      'part-of-fortune',
      'part-of-spirit',
    ]);
  });
});

describe('derivedPointPlacementFacts', () => {
  it('gives a zero-based sign and a one-based house', () => {
    for (const point of DERIVED_POINTS) {
      const facts = derivedPointPlacementFacts(chart, point.key);
      expect(facts.sign).toBeGreaterThanOrEqual(0);
      expect(facts.sign).toBeLessThanOrEqual(11);
      expect(facts.house).toBeGreaterThanOrEqual(1);
      expect(facts.house).toBeLessThanOrEqual(12);
    }
  });
});
