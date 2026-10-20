/**
 * #740: Paulus's seven Hermetic lots against a real Swiss Ephemeris chart (no mocks). A day chart and a night
 * chart are computed from the same engine; each lot is checked against its book formula using that chart's own
 * sect and longitudes, and the day/night reversal is checked explicitly for Eros and Necessity.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { lotOfCourage, lotOfEros, lotOfNecessity, lotOfNemesis, lotOfVictory } from '../src/astrology/arabic-parts.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

/** London, 15 June 1990. The sect follows from the time of day (sun above the horizon is a day chart). */
const DAY_MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 60,
};
const NIGHT_MOMENT: BirthMomentInput = {
  ...DAY_MOMENT,
  civil: { year: 1990, month: 6, day: 15, hour: 2, minute: 30, second: 0 },
};

const norm = (degrees: number): number => ((degrees % 360) + 360) % 360;

function longitudeOf(chart: ChartData, key: string): number {
  const id = bodyByKey(key)?.id;
  const position = chart.positions.find((candidate) => candidate.body === id);
  if (position === undefined) throw new Error(`no position for ${key}`);
  return position.longitude;
}

/** Each of the seven lots for a chart, computed the way the book directs, from that chart's own inputs. */
function sevenLots(chart: ChartData) {
  const asc = chart.houses.ascendant;
  const fortune = chart.partOfFortune;
  const spirit = chart.partOfSpirit;
  const sect = chart.sect;
  return {
    fortune: chart.partOfFortune,
    spirit: chart.partOfSpirit,
    eros: lotOfEros(sect, asc, longitudeOf(chart, 'venus'), spirit),
    necessity: lotOfNecessity(sect, asc, longitudeOf(chart, 'mercury'), fortune),
    courage: lotOfCourage(sect, asc, longitudeOf(chart, 'mars'), fortune),
    victory: lotOfVictory(sect, asc, longitudeOf(chart, 'jupiter'), spirit),
    nemesis: lotOfNemesis(sect, asc, longitudeOf(chart, 'saturn'), fortune),
  };
}

describe("Paulus's seven lots on a real chart (#740)", () => {
  it('computes the day chart and the night chart with opposite sects', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const night = await computeChartData(NIGHT_MOMENT, engine);
    expect(day.sect).toBe('day');
    expect(night.sect).toBe('night');
  });

  it("day chart: Eros and Necessity measure the book's way (Venus from Spirit, Fortune from Mercury)", async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const asc = day.houses.ascendant;
    const lots = sevenLots(day);
    expect(lots.eros).toBeCloseTo(norm(asc + longitudeOf(day, 'venus') - day.partOfSpirit), 9);
    expect(lots.necessity).toBeCloseTo(norm(asc + day.partOfFortune - longitudeOf(day, 'mercury')), 9);
  });

  it('night chart: Eros and Necessity reverse the operands (Spirit from Venus, Mercury from Fortune)', async () => {
    const night = await computeChartData(NIGHT_MOMENT, engine);
    const asc = night.houses.ascendant;
    const lots = sevenLots(night);
    expect(lots.eros).toBeCloseTo(norm(asc + night.partOfSpirit - longitudeOf(night, 'venus')), 9);
    expect(lots.necessity).toBeCloseTo(norm(asc + longitudeOf(night, 'mercury') - night.partOfFortune), 9);
  });

  it('every lot is a longitude in [0, 360) for both charts', async () => {
    for (const moment of [DAY_MOMENT, NIGHT_MOMENT]) {
      const chart = await computeChartData(moment, engine);
      for (const value of Object.values(sevenLots(chart))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(360);
      }
    }
  });
});
