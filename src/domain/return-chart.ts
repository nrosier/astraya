/**
 * A solar or lunar return as a chart in its own right (the Charts page).
 *
 * A return is a chart cast for the moment a body comes back to its natal longitude, at a place. Cast that
 * way it is a complete chart like any other, so it is built with `computeChartDataAtJd` and every table
 * and the wheel work unchanged. `computeSolarReturn` and `computeLunarReturns` find the return moment and
 * its contacts to the natal chart; this adds the full `ChartData` around them.
 *
 * The place defaults to the birthplace; a relocated return is the same moment cast somewhere else.
 */
import type { Aspect, OrbConfig } from '../astrology/aspects.js';
import type { BirthMomentInput } from '../time/types.js';
import type { EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';
import { computeChartDataAtJd, type ChartCalculationOptions, type ChartData } from './chart-compute.js';
import { computeLunarReturns } from './lunar-returns.js';
import { computeSolarReturn } from './solar-return.js';

/** A lunar return is found within this many days of the chosen date: the Moon returns every ~27.3 days. */
export const LUNAR_RETURN_SEARCH_DAYS = 29;

export interface ReturnChartOptions extends ChartCalculationOptions {
  /** Where the return is cast; the birthplace when omitted. */
  readonly place?: GeoPosition;
}

export interface ReturnChartData {
  readonly returnJd: JulianDayUT;
  readonly place: GeoPosition;
  readonly chart: ChartData;
  /** Aspects between the return's positions and the natal chart. */
  readonly contacts: readonly Aspect[];
}

function orbOf(options: ReturnChartOptions): OrbConfig | undefined {
  return options.orbConfig;
}

/** The solar return of a calendar year, as a chart. */
export async function computeSolarReturnChart(
  natalMoment: BirthMomentInput,
  year: number,
  provider: EphemerisProvider,
  options: ReturnChartOptions = {},
): Promise<ReturnChartData> {
  const found = await computeSolarReturn(
    natalMoment,
    year,
    provider,
    {
      ...(options.place === undefined ? {} : { place: options.place }),
      ...(options.houseSystem === undefined ? {} : { houseSystem: options.houseSystem }),
      ...(options.zodiac === undefined ? {} : { zodiac: options.zodiac }),
    },
    orbOf(options),
  );
  const chart = await computeChartDataAtJd(found.returnJd, found.place, provider, options);
  return { returnJd: found.returnJd, place: found.place, chart, contacts: found.contacts };
}

/** The first lunar return on or after `fromJd`, as a chart. */
export async function computeLunarReturnChart(
  natalMoment: BirthMomentInput,
  fromJd: JulianDayUT,
  provider: EphemerisProvider,
  options: ReturnChartOptions = {},
): Promise<ReturnChartData> {
  const found = await computeLunarReturns(
    natalMoment,
    fromJd,
    fromJd + LUNAR_RETURN_SEARCH_DAYS,
    provider,
    {
      ...(options.place === undefined ? {} : { place: options.place }),
      ...(options.houseSystem === undefined ? {} : { houseSystem: options.houseSystem }),
      ...(options.zodiac === undefined ? {} : { zodiac: options.zodiac }),
    },
    orbOf(options),
  );
  const first = found.returns[0];
  if (first === undefined) throw new RangeError('No lunar return was found in this period.');
  const chart = await computeChartDataAtJd(first.returnJd, first.place, provider, options);
  return { returnJd: first.returnJd, place: first.place, chart, contacts: first.contacts };
}
