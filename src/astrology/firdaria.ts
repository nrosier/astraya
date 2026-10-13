/**
 * Firdaria (#554): the medieval Persian/Arabic "fardar" time-lord system, cycling through the
 * seven classical planets plus the lunar nodes in a fixed order and fixed per-planet year
 * lengths, starting from the Sun in a day chart or the Moon in a night chart (attributed to Abu
 * Ma'shar; this project's own table is checked only against the widely-repeated modern
 * secondary-literature summary of it — not independently verified against a primary medieval
 * Arabic or Latin text).
 *
 * The night order is the same seven-planet cycle as the day order, just started three places
 * later (at the Moon instead of the Sun) — not an independently different sequence.
 */
/**
 * @module astrology/firdaria
 * @purpose Computes firdaria periods (ruler, years, date range), cycling through the seven classical planets and the lunar nodes, starting from the Sun (day) or Moon (night).
 * @conventions Fixed period lengths per ruler (Sun 10, Venus 8, Mercury 13, Moon 9, Saturn 11, Jupiter 12, Mars 7, North Node 3, South Node 2 years — a 75-year cycle); the day/night order is the same seven-planet cycle rotated to start at the sect light, not two independently defined sequences.
 * @exports FirdariaRulerKey, FIRDARIA_YEARS, FIRDARIA_DAY_ORDER, FIRDARIA_NIGHT_ORDER, FirdariaPeriod, firdariaPeriods, firdariaPeriodAt
 */
import type { Sect } from './sect.js';
import type { JulianDayUT } from '../ephemeris/types.js';

export type FirdariaRulerKey =
  'sun' | 'venus' | 'mercury' | 'moon' | 'saturn' | 'jupiter' | 'mars' | 'northNode' | 'southNode';

/** Fixed years per ruler — the firdaria-specific table, distinct from zodiacal releasing's own "minor years" (`zodiacal-releasing.ts`). */
export const FIRDARIA_YEARS: Readonly<Record<FirdariaRulerKey, number>> = {
  sun: 10,
  venus: 8,
  mercury: 13,
  moon: 9,
  saturn: 11,
  jupiter: 12,
  mars: 7,
  northNode: 3,
  southNode: 2,
};

/** The day-chart order: Sun first. */
export const FIRDARIA_DAY_ORDER: readonly FirdariaRulerKey[] = [
  'sun',
  'venus',
  'mercury',
  'moon',
  'saturn',
  'jupiter',
  'mars',
  'northNode',
  'southNode',
];

/** The same seven-planet cycle as the day order, rotated to start at the Moon (then the nodes, same as day). */
export const FIRDARIA_NIGHT_ORDER: readonly FirdariaRulerKey[] = [
  'moon',
  'saturn',
  'jupiter',
  'mars',
  'sun',
  'venus',
  'mercury',
  'northNode',
  'southNode',
];

const TROPICAL_YEAR_DAYS = 365.2425;

/** The total length of one full firdaria cycle, in years — the sum of every ruler's own years. */
export const FIRDARIA_CYCLE_YEARS = Object.values(FIRDARIA_YEARS).reduce((sum, years) => sum + years, 0);

export interface FirdariaPeriod {
  readonly ruler: FirdariaRulerKey;
  readonly years: number;
  readonly startJd: JulianDayUT;
  readonly endJd: JulianDayUT;
  /** Which cycle (0-based) this period belongs to — a lifetime can run past one full 75-year cycle and loop. */
  readonly cycle: number;
}

/** `count` consecutive firdaria periods from `fromJd` (typically the natal Julian day), looping the cycle as needed. */
export function firdariaPeriods(sect: Sect, fromJd: JulianDayUT, count: number): readonly FirdariaPeriod[] {
  const order = sect === 'day' ? FIRDARIA_DAY_ORDER : FIRDARIA_NIGHT_ORDER;
  const periods: FirdariaPeriod[] = [];
  let cursor = fromJd;
  for (let i = 0; i < count; i++) {
    const ruler = order[i % order.length];
    if (ruler === undefined) throw new Error('unreachable: order is non-empty');
    const years = FIRDARIA_YEARS[ruler];
    const endJd = cursor + years * TROPICAL_YEAR_DAYS;
    periods.push({ ruler, years, startJd: cursor, endJd, cycle: Math.floor(i / order.length) });
    cursor = endJd;
  }
  return periods;
}

/** The single firdaria period active at `targetJd`, or `undefined` if it falls before `fromJd` or beyond as much as `maxPeriods` covers. */
export function firdariaPeriodAt(
  sect: Sect,
  fromJd: JulianDayUT,
  targetJd: JulianDayUT,
  maxPeriods = 18,
): FirdariaPeriod | undefined {
  if (targetJd < fromJd) return undefined;
  return firdariaPeriods(sect, fromJd, maxPeriods).find(
    (period) => targetJd >= period.startJd && targetJd < period.endJd,
  );
}
