/**
 * @module trutine
 * @purpose The Trutine of Hermes conception chart (#1407, Step 9c): the gestation days from Lilly's table, the conception day and the 13-degree check.
 * @conventions William Lilly, Christian Astrology (1647), "The Correction of an uncertaine Scheame of Heaven by the Trutine of Hermes", pp. 502-504; the table is transcribed in docs/research/trutine-table-lilly-1647.md and encoded below as printed. Julian calendar throughout, Lilly's own dating, so the birth must be a Julian-calendar date. Under the earth when (Moon - Ascendant) mod 360 < 180 (p. 502), and the column then reads from the Ascendant; above it, from the Descendant ("the 7th house", p. 502). The 12-sign wrap adds 360 degrees to the Moon when she is less than the angle (p. 502). Nearest-row lookup (p. 503, "seek out the neerest number unto mine"); a tie goes to the earlier, smaller row, a rule the page does not state. Birth day B is the day of the Julian year (Table of Months, Bissextile column, p. 504). Gestation N = B - G; when N < 1, the conception falls in the year before and N = B + Y - G, with Y = 366 for a bissextile birth year, as Lilly prints (p. 504), and 365 otherwise (the spec gives no common-year rule; the 365 follows from his "full number of 366 dayes ... in a Leap-yeer"). Lilly's 366 correction is kept, so his worked example gives 10 December 1615 (p. 504), one day later than a strict 365-day count (owner decision, 2026-11-23). Lilly gives the day only and rejects an hour method (p. 505); the conception chart is cast at local noon on the conception day, the moment the check reads (p. 503, step 5). The check: the Moon at noon on the conception day within 13 degrees of the birth Ascendant (p. 503), an angular distance of 13 or less passes; Lilly's "benefics advanced" clause is not implemented.
 * @exports TRUTINE_TABLE, TRUTINE_CHECK_DEGREES, TrutineTableRow, TrutineColumn, TrutineDistance, JulianCivilDate, TrutineCheck, TrutineConception, trutineDistance, nearestTrutineRow, julianDayOfYear, julianDateFromDayOfYear, conceptionFromGestation, checkMoonNearAscendant, computeTrutineConception
 */
import { bodyByKey } from '../astrology/bodies.js';
import type { BodyId, Degrees, EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import {
  type ChartCalculationOptions,
  type ChartData,
  computeChartDataAtJd,
  housesAreDefined,
} from './chart-compute.js';

/**
 * One row of Lilly's "A Table of the mansion of the Child in its Mothers Wombe" (Trutine of Hermes, pp. 502-504), as
 * printed. A row's distance is `signs * 30 + degrees`, on a 12-degree grid from 0 to 180. Values are transcribed from
 * the page image (docs/research/trutine-table-lilly-1647.md) and not corrected: the 206 at Signes 3, Degrees 6 in the
 * above column is kept as printed (owner decision, 2026-11-23).
 */
export interface TrutineTableRow {
  readonly signs: number;
  readonly degrees: number;
  /** "The Moon under the earth from the Ascendant days", p. 502. */
  readonly underDays: number;
  /** "The D above the earth from the 7th house", p. 502. */
  readonly aboveDays: number;
}

export const TRUTINE_TABLE: readonly TrutineTableRow[] = [
  { signs: 0, degrees: 0, underDays: 273, aboveDays: 258 },
  { signs: 0, degrees: 12, underDays: 274, aboveDays: 259 },
  { signs: 0, degrees: 24, underDays: 275, aboveDays: 260 },
  { signs: 1, degrees: 6, underDays: 276, aboveDays: 261 },
  { signs: 1, degrees: 18, underDays: 277, aboveDays: 262 },
  { signs: 2, degrees: 0, underDays: 278, aboveDays: 263 },
  { signs: 2, degrees: 12, underDays: 279, aboveDays: 264 },
  { signs: 2, degrees: 24, underDays: 280, aboveDays: 265 },
  // Printed as 206. The values either side run 265 and 267; 266 is what the sequence suggests. Kept as printed.
  { signs: 3, degrees: 6, underDays: 281, aboveDays: 206 },
  { signs: 3, degrees: 18, underDays: 282, aboveDays: 267 },
  { signs: 4, degrees: 0, underDays: 283, aboveDays: 268 },
  { signs: 4, degrees: 12, underDays: 284, aboveDays: 269 },
  { signs: 4, degrees: 24, underDays: 285, aboveDays: 270 },
  { signs: 5, degrees: 6, underDays: 286, aboveDays: 271 },
  { signs: 5, degrees: 18, underDays: 287, aboveDays: 272 },
  { signs: 6, degrees: 0, underDays: 288, aboveDays: 273 },
];

/** Lilly's check: the Moon at noon within this many degrees of the Ascendant (p. 503, step 5). */
export const TRUTINE_CHECK_DEGREES = 13;

/** Which column of the table the lookup reads. */
export type TrutineColumn = 'under' | 'above';

/** The column and distance the lookup starts from, after the 12-sign wrap (pp. 502-503). */
export interface TrutineDistance {
  readonly column: TrutineColumn;
  readonly distance: Degrees;
}

/** A calendar date in the Julian calendar. */
export interface JulianCivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The Trutine check: the Moon at noon on the conception day against the birth Ascendant (p. 503, step 5). */
export interface TrutineCheck {
  /** True when the Moon is within `TRUTINE_CHECK_DEGREES` of the Ascendant. */
  readonly passed: boolean;
  /** The angular distance from the Moon at noon to the birth Ascendant, 0-180. */
  readonly distance: Degrees;
}

export interface TrutineConception {
  readonly conception: JulianCivilDate;
  /** The conception chart's instant: local noon on the conception day, at the birthplace. */
  readonly conceptionJd: JulianDayUT;
  readonly gestationDays: number;
  readonly column: TrutineColumn;
  readonly tableRow: TrutineTableRow;
  /** The birth Moon longitude used by the lookup, 0-360. */
  readonly moonLongitude: Degrees;
  /** The birth Ascendant used by the lookup and the check, 0-360. */
  readonly ascendant: Degrees;
  readonly check: TrutineCheck;
  readonly chart: ChartData;
}

const MONTH_LENGTHS_COMMON = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const MONTH_LENGTHS_BISSEXTILE = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const SIGN_DEGREES = 30;
const HALF_CIRCLE = 180;
const FULL_CIRCLE = 360;
const NOON_HOUR = 12;

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

const MOON = idOf('moon');

function norm360(degrees: Degrees): Degrees {
  const value = degrees % FULL_CIRCLE;
  return value < 0 ? value + FULL_CIRCLE : value;
}

function rowDistance(row: TrutineTableRow): Degrees {
  return row.signs * SIGN_DEGREES + row.degrees;
}

function monthLengths(year: number): readonly number[] {
  return year % 4 === 0 ? MONTH_LENGTHS_BISSEXTILE : MONTH_LENGTHS_COMMON;
}

function daysInYear(year: number): number {
  return year % 4 === 0 ? 366 : 365;
}

/**
 * The column and distance the lookup uses (pp. 502-503, steps 1-2). Under the earth (houses 1-6) the Moon is measured
 * from the Ascendant; above it, from the Descendant. When the Moon is less than the angle, 360 degrees are added to her
 * before the subtraction ("adding 12 whole Signes to the place of the D", p. 502), so the result is never negative.
 */
export function trutineDistance(moon: Degrees, ascendant: Degrees): TrutineDistance {
  const moonLongitude = norm360(moon);
  const ascendantLongitude = norm360(ascendant);
  const descendant = norm360(ascendantLongitude + HALF_CIRCLE);
  const under = norm360(moonLongitude - ascendantLongitude) < HALF_CIRCLE;
  const angle = under ? ascendantLongitude : descendant;
  const distance = moonLongitude < angle ? moonLongitude + FULL_CIRCLE - angle : moonLongitude - angle;
  return { column: under ? 'under' : 'above', distance };
}

/**
 * The table row whose distance is nearest to `distance` (p. 503, step 3, "seek out the neerest number unto mine"). The
 * page states no tie rule: a distance exactly between two rows takes the earlier, smaller row, because only a strictly
 * smaller gap replaces the row already chosen.
 */
export function nearestTrutineRow(distance: Degrees): TrutineTableRow {
  let best: TrutineTableRow | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of TRUTINE_TABLE) {
    const gap = Math.abs(rowDistance(row) - distance);
    if (gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  if (best === undefined) throw new Error('unreachable: TRUTINE_TABLE is not empty');
  return best;
}

/** The day of the Julian year for a month and day, the Table of Months (p. 504). 1 January is day 1. */
export function julianDayOfYear(year: number, month: number, day: number): number {
  const lengths = monthLengths(year);
  let total = day;
  for (let index = 0; index < month - 1; index += 1) total += lengths[index] ?? 0;
  return total;
}

/** The Julian calendar date for a day of the year (p. 504: "the tenth day of December" from 344 in 1615). */
export function julianDateFromDayOfYear(year: number, dayOfYear: number): JulianCivilDate {
  const lengths = monthLengths(year);
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > daysInYear(year)) {
    throw new RangeError(`day of year ${String(dayOfYear)} is outside ${String(year)}`);
  }
  let remaining = dayOfYear;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] ?? 0;
    if (remaining <= length) return { year, month: index + 1, day: remaining };
    remaining -= length;
  }
  throw new RangeError(`day of year ${String(dayOfYear)} is outside ${String(year)}`);
}

/**
 * The conception year and day of year from the birth day and the gestation days (p. 503, step 3; p. 504). The birth
 * day minus the gestation stays in the birth year when it is at least 1. Otherwise the subtraction "cannot be made", and
 * Lilly adds the full year of the birth ("366 dayes ... when it happened in a Leap-yeer") and moves to the year before.
 */
export function conceptionFromGestation(
  birthYear: number,
  birthDayOfYear: number,
  gestationDays: number,
): { readonly year: number; readonly dayOfYear: number } {
  const direct = birthDayOfYear - gestationDays;
  if (direct >= 1) return { year: birthYear, dayOfYear: direct };
  return { year: birthYear - 1, dayOfYear: direct + daysInYear(birthYear) };
}

/** The Trutine check (p. 503, step 5): is the Moon within 13 degrees of the Ascendant? Angular distance, 0-180. */
export function checkMoonNearAscendant(moon: Degrees, ascendant: Degrees): TrutineCheck {
  const difference = norm360(moon - ascendant);
  const distance = Math.min(difference, FULL_CIRCLE - difference);
  return { passed: distance <= TRUTINE_CHECK_DEGREES, distance };
}

/**
 * The Trutine of Hermes conception chart for a birth (#1407, Step 9c). The birth must be a Julian-calendar date with a
 * known time, so the Ascendant is defined. `provider` must already be initialized. Throws `RangeError` for a Gregorian
 * birth or one without houses; the check failing is a result, not an error.
 */
export async function computeTrutineConception(
  birth: BirthMomentInput,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<TrutineConception> {
  const resolved = resolveMoment(birth);
  if (resolved.calendar !== 'julian') {
    throw new RangeError("The Trutine of Hermes table is Lilly's Julian-calendar reckoning; the birth must be Julian.");
  }
  const place: GeoPosition = { ...birth.coordinates, altitude: 0 };
  const birthJd = await julianDayFor(provider, resolved);
  const birthChart = await computeChartDataAtJd(birthJd, place, provider, options);
  if (!housesAreDefined(birthChart.houses)) {
    throw new RangeError('The Trutine of Hermes needs a birth time: the Ascendant is not defined.');
  }
  const moonPosition = birthChart.positions.find((position) => position.body === MOON);
  if (moonPosition === undefined) throw new Error('unreachable: the Moon is always in the chart');
  const ascendant = birthChart.houses.ascendant;

  const { column, distance } = trutineDistance(moonPosition.longitude, ascendant);
  const tableRow = nearestTrutineRow(distance);
  const gestationDays = column === 'under' ? tableRow.underDays : tableRow.aboveDays;

  const birthDayOfYear = julianDayOfYear(resolved.civil.year, resolved.civil.month, resolved.civil.day);
  const conceptionDay = conceptionFromGestation(resolved.civil.year, birthDayOfYear, gestationDays);
  const conception = julianDateFromDayOfYear(conceptionDay.year, conceptionDay.dayOfYear);

  const noonMoment = resolveMoment({
    civil: { ...conception, hour: NOON_HOUR, minute: 0, second: 0 },
    coordinates: birth.coordinates,
    offsetOverrideMinutes: resolved.offsetMinutes,
    calendar: 'julian',
  });
  const conceptionJd = await julianDayFor(provider, noonMoment);
  const chart = await computeChartDataAtJd(conceptionJd, place, provider, options);
  const noonMoon = chart.positions.find((position) => position.body === MOON);
  if (noonMoon === undefined) throw new Error('unreachable: the Moon is always in the chart');
  const check = checkMoonNearAscendant(noonMoon.longitude, ascendant);

  return {
    conception,
    conceptionJd,
    gestationDays,
    column,
    tableRow,
    moonLongitude: norm360(moonPosition.longitude),
    ascendant: norm360(ascendant),
    check,
    chart,
  };
}
