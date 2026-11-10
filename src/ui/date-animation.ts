/**
 * Pure arithmetic behind the date and animation bar (#1400): what one step is, how fast playback runs, and the
 * calendar-day maths for the stepper and the slider. No React and no clock, so it is tested directly.
 */
/**
 * @module ui/date-animation
 * @purpose Interval x speed to steps per second, the 60-ticks-per-second throttle, calendar date stepping by day, month or year, and the slider's day numbers.
 * @conventions Dates are `YYYY-MM-DD` strings (the date input's own value), calculated in UTC so a time zone never shifts a civil day. Stepping by month or year clamps to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). Speed multiplies the active interval: at Month, 1x is one month per second. A result outside years 1 to 9999 leaves the date unchanged.
 * @exports StepInterval, STEP_INTERVALS, PlaybackSpeed, PLAYBACK_SPEEDS, DEFAULT_SPEED, DEFAULT_INTERVAL, MAX_TICKS_PER_SECOND, stepsPerSecond, playbackPlan, advanceDate, dayNumber, isoFromDayNumber, sliderSpan
 */

export type StepInterval = 'day' | 'month' | 'year';
export const STEP_INTERVALS: readonly StepInterval[] = ['day', 'month', 'year'];
export const DEFAULT_INTERVAL: StepInterval = 'day';

/** The speed dropdown's options, as multipliers of the active interval (owner spec, #1400). */
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10, 30] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const DEFAULT_SPEED: PlaybackSpeed = 1;

/** The most chart and table recalculations per second, however fast the speed (10x and 30x). */
export const MAX_TICKS_PER_SECOND = 60;

/** How many steps of the active interval playback advances per second: the speed itself (1x = 1 step per second, 0.5x = 0.5). */
export function stepsPerSecond(speed: number): number {
  return speed;
}

/** The timer period and the steps each tick advances, so no more than `MAX_TICKS_PER_SECOND` redraws happen per second. */
export function playbackPlan(speed: number): { readonly tickMs: number; readonly stepsPerTick: number } {
  const rate = stepsPerSecond(speed);
  const ticksPerSecond = Math.min(rate, MAX_TICKS_PER_SECOND);
  return { tickMs: 1000 / ticksPerSecond, stepsPerTick: rate / ticksPerSecond };
}

const DAY_MS = 86_400_000;

function parseIso(value: string): { year: number; month: number; day: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
    ? { year, month, day }
    : undefined;
}

function formatIso(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

/**
 * `value` moved by `steps` of `interval` (negative goes back). An unreadable date, or a result outside years 1 to 9999,
 * comes back unchanged so the caller's playback can stop on it.
 */
export function advanceDate(value: string, interval: StepInterval, steps: number): string {
  const parts = parseIso(value);
  if (parts === undefined) return value;
  let next: Date;
  if (interval === 'day') {
    next = utcDate(parts.year, parts.month - 1, parts.day + steps);
  } else {
    const months = interval === 'month' ? steps : steps * 12;
    const target = utcDate(parts.year, parts.month - 1 + months, 1);
    const lastDay = utcDate(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getUTCDate();
    next = utcDate(target.getUTCFullYear(), target.getUTCMonth(), Math.min(parts.day, lastDay));
  }
  const year = next.getUTCFullYear();
  return year < 1 || year > 9999 ? value : formatIso(next);
}

/** Whole days since 1970-01-01 for a date value, or undefined when it is not a real calendar day. */
export function dayNumber(value: string): number | undefined {
  const parts = parseIso(value);
  return parts === undefined ? undefined : utcDate(parts.year, parts.month - 1, parts.day).getTime() / DAY_MS;
}

/** The date value for a day number from `dayNumber`. */
export function isoFromDayNumber(days: number): string {
  return formatIso(new Date(days * DAY_MS));
}

/** The slider's range: from 1 January five years before `centerYear` to 31 December five years after it, as day numbers. */
export function sliderSpan(centerYear: number): { readonly min: number; readonly max: number } {
  const first = dayNumber(`${String(centerYear - 5).padStart(4, '0')}-01-01`) ?? 0;
  const last = dayNumber(`${String(centerYear + 5).padStart(4, '0')}-12-31`) ?? first;
  return { min: first, max: last };
}
