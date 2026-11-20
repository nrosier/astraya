/**
 * #1797: the five Hermetic lots on a real Swiss Ephemeris chart (no mocks). Each row is checked against its own
 * `lotOf...` function called by hand with the chart's own values, in Paulus's order, and a missing planet or
 * undefined houses behaves as the domain module promises.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { lotOfCourage, lotOfEros, lotOfNecessity, lotOfNemesis, lotOfVictory } from '../src/astrology/arabic-parts.js';
import { houseOf } from '../src/astrology/emphasis.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { hermeticLots } from '../src/domain/hermetic-lots.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

/** London, 15 June 1990, the same day and night moments as the existing Paulus lot test (#740). */
const DAY_MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 60,
};
const NIGHT_MOMENT: BirthMomentInput = {
  ...DAY_MOMENT,
  civil: { year: 1990, month: 6, day: 15, hour: 2, minute: 30, second: 0 },
};

function longitudeOf(chart: ChartData, key: string): number {
  const id = bodyByKey(key)?.id;
  const position = chart.positions.find((candidate) => candidate.body === id);
  if (position === undefined) throw new Error(`no position for ${key}`);
  return position.longitude;
}

/** The five lots computed by hand, from the chart's own sect, Ascendant, planets and Fortune/Spirit. */
function handComputedLots(chart: ChartData) {
  const asc = chart.houses.ascendant;
  const fortune = chart.partOfFortune;
  const spirit = chart.partOfSpirit;
  const sect = chart.sect;
  return [
    { key: 'lot-of-eros', longitude: lotOfEros(sect, asc, longitudeOf(chart, 'venus'), spirit) },
    { key: 'lot-of-necessity', longitude: lotOfNecessity(sect, asc, longitudeOf(chart, 'mercury'), fortune) },
    { key: 'lot-of-courage', longitude: lotOfCourage(sect, asc, longitudeOf(chart, 'mars'), fortune) },
    { key: 'lot-of-victory', longitude: lotOfVictory(sect, asc, longitudeOf(chart, 'jupiter'), spirit) },
    { key: 'lot-of-nemesis', longitude: lotOfNemesis(sect, asc, longitudeOf(chart, 'saturn'), fortune) },
  ];
}

describe('hermeticLots (#1797)', () => {
  it('each day-chart lot equals its lotOf function called by hand with the chart values', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    expect(day.sect).toBe('day');
    const rows = hermeticLots(day);
    const expected = handComputedLots(day);
    expect(rows.map((row) => row.key)).toEqual(expected.map((lot) => lot.key));
    rows.forEach((row, index) => {
      expect(row.longitude).toBeCloseTo(expected[index]?.longitude ?? Number.NaN, 9);
    });
  });

  it('each night-chart lot equals its lotOf function called by hand with the chart values', async () => {
    const night = await computeChartData(NIGHT_MOMENT, engine);
    expect(night.sect).toBe('night');
    const rows = hermeticLots(night);
    const expected = handComputedLots(night);
    expect(rows.map((row) => row.key)).toEqual(expected.map((lot) => lot.key));
    rows.forEach((row, index) => {
      expect(row.longitude).toBeCloseTo(expected[index]?.longitude ?? Number.NaN, 9);
    });
  });

  it("returns five rows in Paulus's order: Eros, Necessity, Courage, Victory, Nemesis", async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    expect(hermeticLots(day).map((row) => row.key)).toEqual([
      'lot-of-eros',
      'lot-of-necessity',
      'lot-of-courage',
      'lot-of-victory',
      'lot-of-nemesis',
    ]);
  });

  it('a missing planet drops only its own lot and does not throw', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const marsId = bodyByKey('mars')?.id;
    const withoutMars: ChartData = {
      ...day,
      positions: day.positions.filter((position) => position.body !== marsId),
    };
    const keys = hermeticLots(withoutMars).map((row) => row.key);
    expect(keys).toEqual(['lot-of-eros', 'lot-of-necessity', 'lot-of-victory', 'lot-of-nemesis']);
  });

  it('house equals houseOf on the chart cusps', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    for (const row of hermeticLots(day)) {
      expect(row.house).toBe(houseOf(row.longitude, day.houses.cusps));
    }
  });

  it('house is undefined for a chart whose houses are not defined', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const undefinedHouses: ChartData = {
      ...day,
      houses: { ...day.houses, midheaven: Number.NaN },
    };
    const rows = hermeticLots(undefinedHouses);
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.house).toBeUndefined();
    }
  });
});
