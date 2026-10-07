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
/**
 * @module return-chart
 * @purpose Presents a solar or lunar return as a complete chart in its own right for the Charts page, built from `computeSolarReturn`/`computeLunarReturns` plus `computeChartDataAtJd`.
 * @conventions The place defaults to the birthplace; `chartContacts` filters the return's natal contacts down to exactly the bodies the chart itself displays (one Lilith/Node model, Chiron/Lilith/Nodes only when `aspectsTo` allows), so the contacts table never disagrees with the rendered chart.
 * @exports computeSolarReturnChart, computeLunarReturnChart, ReturnChartData, ReturnChartOptions, LUNAR_RETURN_SEARCH_DAYS
 */
import type { Aspect, OrbConfig } from '../astrology/aspects.js';
import { bodyById } from '../astrology/bodies.js';
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

/**
 * The contacts the chart itself would show: `computeSolarReturn` and `computeLunarReturns` look at every body
 * (all three Lilith models and both Nodes), where the chart keeps one of each and aspects Chiron, Lilith and
 * the Nodes only when asked (`aspectsTo`). Without this the contacts table would disagree with the chart's.
 */
function chartContacts(
  contacts: readonly Aspect[],
  chart: ChartData,
  aspectsTo: ChartCalculationOptions['aspectsTo'],
): readonly Aspect[] {
  const shown = new Set(chart.positions.map((position) => position.body));
  const eligible = (body: Aspect['bodyA']): boolean => {
    if (!shown.has(body)) return false;
    const category = bodyById(body)?.category;
    if (category === 'centaur') return aspectsTo?.chiron === true;
    if (category === 'lilith') return aspectsTo?.lilith === true;
    if (category === 'node') return aspectsTo?.lunarNodes === true;
    return true;
  };
  return contacts.filter((contact) => eligible(contact.bodyA) && eligible(contact.bodyB));
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
  return {
    returnJd: found.returnJd,
    place: found.place,
    chart,
    contacts: chartContacts(found.contacts, chart, options.aspectsTo),
  };
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
  return {
    returnJd: first.returnJd,
    place: first.place,
    chart,
    contacts: chartContacts(first.contacts, chart, options.aspectsTo),
  };
}
