/**
 * @module trutine
 * @purpose The Trutine of Hermes conception chart (#1407, Step 9c): the gestation days from Lilly's table, the conception day and the 13-degree check.
 * @conventions William Lilly, Christian Astrology (1647), "The Correction of an uncertaine Scheame of Heaven by the Trutine of Hermes", pp. 502-504; the table is transcribed in docs/research/trutine-table-lilly-1647.md and encoded below as printed. Julian calendar throughout, Lilly's own dating; a Gregorian birth date is first converted to the Julian date that names the same day by the exact calendar rule (gregorianToJulianCivil, #1407 owner decision 2026-11-25), never by a fixed 10-day shift. The engine ships 1800-2399 only (EPHEMERIS_YEAR_RANGE), so a birth whose birth chart or conception chart would fall outside it returns an outside-range result without calling the engine. Under the earth when (Moon - Ascendant) mod 360 < 180 (p. 502), and the column then reads from the Ascendant; above it, from the Descendant ("the 7th house", p. 502). The 12-sign wrap adds 360 degrees to the Moon when she is less than the angle (p. 502). Nearest-row lookup (p. 503, "seek out the neerest number unto mine"); a tie goes to the earlier, smaller row, a rule the page does not state. Birth day B is the day of the Julian year (Table of Months, Bissextile column, p. 504). Gestation N = B - G; when N < 1, the conception falls in the year before and N = B + Y - G, with Y = 366 for a bissextile birth year, as Lilly prints (p. 504), and 365 otherwise (the spec gives no common-year rule; the 365 follows from his "full number of 366 dayes ... in a Leap-yeer"). Lilly's 366 correction is kept, so his worked example gives 10 December 1615 (p. 504), one day later than a strict 365-day count (owner decision, 2026-11-23). Lilly gives the day only and rejects an hour method (p. 505); the conception chart is cast at local noon on the conception day, the moment the check reads (p. 503, step 5). The check: the Moon at noon on the conception day within 13 degrees of the birth Ascendant (p. 503), an angular distance of 13 or less passes; Lilly's "benefics advanced" clause is not implemented.
 * @exports TRUTINE_TABLE, TRUTINE_CHECK_DEGREES, TrutineTableRow, TrutineColumn, TrutineDistance, JulianCivilDate, GregorianCivilDate, TrutineCheck, TrutineConception, TrutineOutcome, trutineDistance, nearestTrutineRow, julianDayOfYear, julianDateFromDayOfYear, conceptionFromGestation, checkMoonNearAscendant, gregorianToJulianCivil, julianToGregorianCivil, computeTrutine, computeTrutineConception
 */
import { bodyByKey } from '../astrology/bodies.js';
import { EPHEMERIS_YEAR_RANGE } from '../ephemeris/assets.js';
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

/** A calendar date in the Gregorian calendar. */
export interface GregorianCivilDate {
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
  /** The calendar the birth was dated in; the conception is always reckoned, and given, in the Julian calendar. */
  readonly calendar: 'gregorian' | 'julian';
  readonly conception: JulianCivilDate;
  /** The same conception day in the Gregorian calendar, for a Gregorian birth; undefined for a Julian one. */
  readonly conceptionGregorian: GregorianCivilDate | undefined;
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

/**
 * Julian Day Number (the day beginning at the preceding noon UT) of a Gregorian civil date. Meeus, Astronomical
 * Algorithms, 2nd ed., ch. 7, through the integer form of Fliegel and Van Flandern (1968); proleptic Gregorian.
 */
function jdnFromGregorian(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdnFromJulian(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
}

function julianFromJdn(jdn: number): JulianCivilDate {
  const c = jdn + 32082;
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    year: d - 4800 + Math.floor(m / 10),
    month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1,
  };
}

function gregorianFromJdn(jdn: number): GregorianCivilDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    year: 100 * b + d - 4800 + Math.floor(m / 10),
    month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1,
  };
}

/**
 * The Julian-calendar date that names the same day as a Gregorian date, by the exact calendar rule (both calendars
 * counted through the Julian Day Number, Meeus ch. 7), not a fixed shift: the Julian date runs 10 days behind the
 * Gregorian one from the 1582 reform to 28 February 1700 (Gregorian), then 11, 12, 13, 14 and 15 days behind as the
 * Gregorian calendar drops 1700, 1800, 1900, 2100 and 2200 as non-leap years. Proleptic before 15 October 1582.
 */
export function gregorianToJulianCivil(date: GregorianCivilDate): JulianCivilDate {
  return julianFromJdn(jdnFromGregorian(date.year, date.month, date.day));
}

/** The inverse of `gregorianToJulianCivil`: the Gregorian date that names the same day as a Julian date. */
export function julianToGregorianCivil(date: JulianCivilDate): GregorianCivilDate {
  return gregorianFromJdn(jdnFromJulian(date.year, date.month, date.day));
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
  // The page (Lilly 1647, p. 503-504) does not state this edge case; this is the owner's decision recorded on #1407. A
  // zero count falls on 31 December of the year before, the closest date the page's method gives. The length is that of
  // the previous year, which may be common (365) while the birth year is bissextile (366).
  if (direct === 0) return { year: birthYear - 1, dayOfYear: daysInYear(birthYear - 1) };
  return { year: birthYear - 1, dayOfYear: direct + daysInYear(birthYear) };
}

/** The Trutine check (p. 503, step 5): is the Moon within 13 degrees of the Ascendant? Angular distance, 0-180. */
export function checkMoonNearAscendant(moon: Degrees, ascendant: Degrees): TrutineCheck {
  const difference = norm360(moon - ascendant);
  const distance = Math.min(difference, FULL_CIRCLE - difference);
  return { passed: distance <= TRUTINE_CHECK_DEGREES, distance };
}

/** The outcome of `computeTrutine`: a conception chart, or the range the engine ships when the birth lies outside it. */
export type TrutineOutcome =
  | { readonly kind: 'ready'; readonly result: TrutineConception }
  | { readonly kind: 'outside-range'; readonly first: number; readonly last: number };

const OUTSIDE_RANGE: TrutineOutcome = {
  kind: 'outside-range',
  first: EPHEMERIS_YEAR_RANGE.first,
  last: EPHEMERIS_YEAR_RANGE.last,
};

/** Julian day (UT) of 0h on 1 January of a Gregorian year; the range bounds of the engine (it compares the same way). */
function rangeBoundJd(year: number): number {
  return jdnFromGregorian(year, 1, 1) - 0.5;
}

function inEngineRange(jd: JulianDayUT): boolean {
  return jd >= rangeBoundJd(EPHEMERIS_YEAR_RANGE.first) && jd < rangeBoundJd(EPHEMERIS_YEAR_RANGE.last + 1);
}

/**
 * The Trutine of Hermes conception chart for a birth (#1407, Step 9c), for a Julian or a Gregorian birth date and a
 * known time, so the Ascendant is defined. A Gregorian date is converted to the exact Julian date before the table runs
 * (owner decision, 2026-11-25). When the birth chart, or the conception chart (local noon on the conception day, up to
 * 288 days earlier), falls outside the engine's 1800-2399 range, no chart is cast beyond the range and the outcome is
 * `outside-range`. `provider` must already be initialized. Throws `RangeError` for a birth without houses; the check
 * failing is a result, not an error.
 */
export async function computeTrutine(
  birth: BirthMomentInput,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<TrutineOutcome> {
  const resolved = resolveMoment(birth);
  const gregorian = resolved.calendar === 'gregorian';
  const place: GeoPosition = { ...birth.coordinates, altitude: 0 };
  const birthJd = await julianDayFor(provider, resolved);
  // The conception is earlier than the birth, so a birth chart before the range ends the matter without an engine call.
  if (!inEngineRange(birthJd)) return OUTSIDE_RANGE;
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

  // Lilly's table counts days of the Julian year, so a Gregorian birth date is first named in the Julian calendar.
  const birthDate: JulianCivilDate = gregorian ? gregorianToJulianCivil(resolved.civil) : resolved.civil;
  const birthDayOfYear = julianDayOfYear(birthDate.year, birthDate.month, birthDate.day);
  const conceptionDay = conceptionFromGestation(birthDate.year, birthDayOfYear, gestationDays);
  const conception = julianDateFromDayOfYear(conceptionDay.year, conceptionDay.dayOfYear);
  const conceptionGregorian = gregorian ? julianToGregorianCivil(conception) : undefined;

  const noonMoment = resolveMoment({
    civil: { ...(conceptionGregorian ?? conception), hour: NOON_HOUR, minute: 0, second: 0 },
    coordinates: birth.coordinates,
    offsetOverrideMinutes: resolved.offsetMinutes,
    calendar: gregorian ? 'gregorian' : 'julian',
  });
  const conceptionJd = await julianDayFor(provider, noonMoment);
  if (!inEngineRange(conceptionJd)) return OUTSIDE_RANGE;
  const chart = await computeChartDataAtJd(conceptionJd, place, provider, options);
  const noonMoon = chart.positions.find((position) => position.body === MOON);
  if (noonMoon === undefined) throw new Error('unreachable: the Moon is always in the chart');
  const check = checkMoonNearAscendant(noonMoon.longitude, ascendant);

  return {
    kind: 'ready',
    result: {
      calendar: resolved.calendar,
      conception,
      conceptionGregorian,
      conceptionJd,
      gestationDays,
      column,
      tableRow,
      moonLongitude: norm360(moonPosition.longitude),
      ascendant: norm360(ascendant),
      check,
      chart,
    },
  };
}

/**
 * `computeTrutine` for a caller that wants the chart or an error: throws `RangeError` when the birth lies outside the
 * engine's range, as the other Julian-path failures do.
 */
export async function computeTrutineConception(
  birth: BirthMomentInput,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<TrutineConception> {
  const outcome = await computeTrutine(birth, provider, options);
  if (outcome.kind === 'outside-range') {
    throw new RangeError(
      `The Trutine of Hermes is outside the ephemeris range ${String(outcome.first)}-${String(outcome.last)}.`,
    );
  }
  return outcome.result;
}
