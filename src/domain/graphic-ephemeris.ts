/**
 * Graphic ephemeris (#1404): the ecliptic longitudes of several bodies, one sample a day, over a date range.
 *
 * Solar Fire's Graphic Ephemeris (Deluxe v6 manual, ch. 24) plots planetary positions against time. This module
 * is the data half: it asks the ephemeris provider for the positions and lays them out as rows; the drawing is
 * `chart/cycle-diagram.ts`, and the screen is `ui/GraphicEphemerisView.tsx`. Person-independent, like the
 * planetary-cycles and event-search tools: it needs only a date range.
 */
/**
 * @module domain/graphic-ephemeris
 * @purpose Samples the geocentric ecliptic longitude of the chosen bodies at 00:00 UTC on every day of a date range, through the EphemerisProvider, and formats those samples as CSV.
 * @conventions Numbers and dates go through `ui/format` like every other CSV (#513). The provider is a parameter, so the module imports no engine and tests run against the real Swiss Ephemeris through the harness. Days are whole UTC days counted from the Unix epoch, ISO `YYYY-MM-DD` at the edges. The default range is one year and the default bodies the classical seven (owner decisions on #1404, 2026-11-11); outer bodies are opt-in. A range is limited to the shipped ephemeris years and to `MAX_SPAN_DAYS`, so a request stays affordable. Longitudes are tropical, as the provider returns them by default.
 * @exports GRAPHIC_EPHEMERIS_CLASSICAL_KEYS, GRAPHIC_EPHEMERIS_OUTER_KEYS, GRAPHIC_EPHEMERIS_BODY_KEYS, MAX_SPAN_DAYS, RangeProblem, GraphicEphemerisRow, GraphicEphemeris, parseIsoDay, isoFromDay, defaultRange, validateRange, orderedBodyKeys, computeGraphicEphemeris, dateTicks, graphicEphemerisCsv, graphicEphemerisCsvFilename
 */
import { bodyByKey } from '../astrology/bodies.js';
import type { BodyId, EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';
import { formatFixed, utcDay } from '../ui/format.js';
import { MAX_EPHEMERIS_YEAR, MIN_EPHEMERIS_YEAR } from '../ui/year-range.js';

/** The default bodies: the classical seven (owner decision on #1404). */
export const GRAPHIC_EPHEMERIS_CLASSICAL_KEYS: readonly string[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
];

/** The bodies a reader can add (owner decision on #1404: "the user can add outer bodies"). */
export const GRAPHIC_EPHEMERIS_OUTER_KEYS: readonly string[] = ['uranus', 'neptune', 'pluto'];

/** Every body the plot offers, in the order it draws and lists them. */
export const GRAPHIC_EPHEMERIS_BODY_KEYS: readonly string[] = [
  ...GRAPHIC_EPHEMERIS_CLASSICAL_KEYS,
  ...GRAPHIC_EPHEMERIS_OUTER_KEYS,
];

/** The longest range, in days (five years): one sample a day keeps the Moon's 27-day lap legible, and the cost bounded. */
export const MAX_SPAN_DAYS = 1827;

const MS_PER_DAY = 86_400_000;

export type RangeProblem = 'invalid' | 'reversed' | 'outside-ephemeris' | 'too-long';

/** One day of the plot: the UTC day, its Julian day (UT) and each selected body's longitude, in body order. */
export interface GraphicEphemerisRow {
  /** Whole UTC days since 1970-01-01. */
  readonly day: number;
  readonly jd: JulianDayUT;
  readonly longitudes: readonly number[];
}

export interface GraphicEphemeris {
  readonly startDay: number;
  readonly endDay: number;
  /** The selected bodies, in plot order. */
  readonly bodyKeys: readonly string[];
  readonly rows: readonly GraphicEphemerisRow[];
}

/** The whole UTC days since 1970-01-01 of a real calendar date `YYYY-MM-DD`, or undefined (`2026-02-30` is rejected). */
export function parseIsoDay(iso: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return undefined;
  return ms / MS_PER_DAY;
}

/** The `YYYY-MM-DD` of a whole UTC day count. */
export function isoFromDay(day: number): string {
  return utcDay(new Date(day * MS_PER_DAY));
}

/** One year from `startDay`: the same calendar date a year on (the default range, owner decision on #1404). */
function oneYearAfter(startDay: number): number {
  const start = new Date(startDay * MS_PER_DAY);
  return Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()) / MS_PER_DAY;
}

/** The opening range for a UTC day: that day to the same date a year later, as ISO dates. */
export function defaultRange(todayIso: string): { readonly start: string; readonly end: string } {
  const startDay = parseIsoDay(todayIso) ?? 0;
  return { start: isoFromDay(startDay), end: isoFromDay(oneYearAfter(startDay)) };
}

/** What is wrong with a typed range, or undefined when it can be plotted. */
export function validateRange(start: string, end: string): RangeProblem | undefined {
  const startDay = parseIsoDay(start);
  const endDay = parseIsoDay(end);
  if (startDay === undefined || endDay === undefined) return 'invalid';
  if (endDay < startDay) return 'reversed';
  const first = Date.UTC(MIN_EPHEMERIS_YEAR, 0, 1) / MS_PER_DAY;
  const last = Date.UTC(MAX_EPHEMERIS_YEAR, 11, 31) / MS_PER_DAY;
  if (startDay < first || endDay > last) return 'outside-ephemeris';
  if (endDay - startDay > MAX_SPAN_DAYS) return 'too-long';
  return undefined;
}

/** The offered keys that were asked for, in plot order and without repeats or unknown keys. */
export function orderedBodyKeys(keys: Iterable<string>): readonly string[] {
  const wanted = new Set(keys);
  return GRAPHIC_EPHEMERIS_BODY_KEYS.filter((key) => wanted.has(key));
}

/** Positions of the chosen bodies at 00:00 UTC on each day from `startDay` to `endDay` inclusive. */
export async function computeGraphicEphemeris(
  provider: EphemerisProvider,
  bodyKeys: readonly string[],
  startDay: number,
  endDay: number,
): Promise<GraphicEphemeris> {
  const keys = orderedBodyKeys(bodyKeys);
  const ids: BodyId[] = keys.map((key) => {
    const body = bodyByKey(key);
    if (body === undefined) throw new Error(`Unknown body "${key}"`);
    return body.id;
  });
  const first = new Date(startDay * MS_PER_DAY);
  const startJd = await provider.julianDayFromUtc(
    first.getUTCFullYear(),
    first.getUTCMonth() + 1,
    first.getUTCDate(),
    0,
    0,
    0,
  );
  const count = endDay - startDay + 1;
  const rows: GraphicEphemerisRow[] = [];
  // Batches keep the worker busy without queueing thousands of requests at once.
  const BATCH = 30;
  for (let from = 0; from < count; from += BATCH) {
    const offsets = Array.from({ length: Math.min(BATCH, count - from) }, (_, i) => from + i);
    const batch = await Promise.all(
      offsets.map(async (offset): Promise<GraphicEphemerisRow> => {
        const jd = startJd + offset;
        const positions = await provider.positions(jd, ids);
        return { day: startDay + offset, jd, longitudes: positions.map((position) => position.longitude) };
      }),
    );
    rows.push(...batch);
  }
  return { startDay, endDay, bodyKeys: keys, rows };
}

/**
 * Month-start marks for a date axis: every month, or every 2, 3, 6 or 12 months once the range is long enough that
 * monthly marks would crowd (at most about 12 marks). `at` runs 0 to 1 along the range; `day` is the UTC day.
 */
export function dateTicks(startDay: number, endDay: number): readonly { readonly day: number; readonly at: number }[] {
  const span = Math.max(1, endDay - startDay);
  const months = span / 30.44;
  const step = [1, 2, 3, 6, 12].find((candidate) => months / candidate <= 12) ?? 12;
  const first = new Date(startDay * MS_PER_DAY);
  const ticks: { day: number; at: number }[] = [];
  // Months are counted from year 0 so a step of 3 or 6 lands on January, April, ... rather than on the start month.
  let monthIndex = first.getUTCFullYear() * 12 + first.getUTCMonth();
  monthIndex += (step - (monthIndex % step)) % step;
  for (; ; monthIndex += step) {
    const day = Date.UTC(Math.floor(monthIndex / 12), monthIndex % 12, 1) / MS_PER_DAY;
    if (day > endDay) break;
    if (day >= startDay) ticks.push({ day, at: (day - startDay) / span });
  }
  return ticks;
}

/** The samples as CSV: `date` (UTC, 00:00), `jd`, then one longitude column per body in decimal degrees. */
export function graphicEphemerisCsv(result: GraphicEphemeris): string {
  const lines = [['date_utc', 'jd_ut', ...result.bodyKeys.map((key) => `${key}_longitude`)].join(',')];
  for (const row of result.rows) {
    lines.push(
      [isoFromDay(row.day), formatFixed(row.jd, 1), ...row.longitudes.map((value) => formatFixed(value, 6))].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function graphicEphemerisCsvFilename(result: GraphicEphemeris): string {
  return `graphic-ephemeris-${isoFromDay(result.startDay)}-${isoFromDay(result.endDay)}.csv`;
}
