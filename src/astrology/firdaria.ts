/**
 * Firdaria (#554): the medieval Persian/Arabic "fardar" time-lord system, cycling through the
 * seven classical planets plus the lunar nodes in a fixed order and fixed per-planet year
 * lengths, starting from the Sun in a day chart or the Moon in a night chart.
 *
 * The years, the day order and the sub-periods follow Bonatti, *Book of Astronomy*, Tr. 9, ch. 3,
 * printed p. 1387 (`bonatti-liber-astronomiae-tr-9-2010`). Each planet's period splits into seven
 * equal sub-periods, starting with the period's own ruler and running through the order of the
 * circles from the Sun. The nodes get no sub-periods, since Bonatti gives them none.
 *
 * The night order reads Bonatti's "as was said when the disposition begins from the Sun" as the
 * same cycle started at the Moon, the same seven-planet sequence rotated three places later. The
 * translator's footnote gives its provenance as "based on al-Qabisi, IV.20"; that work is not held.
 */
/**
 * @module astrology/firdaria
 * @purpose Computes firdaria periods (ruler, years, date range) and their seven equal sub-periods, cycling through the seven classical planets and the lunar nodes, starting from the Sun (day) or Moon (night).
 * @conventions Fixed period lengths per ruler (Sun 10, Venus 8, Mercury 13, Moon 9, Saturn 11, Jupiter 12, Mars 7, North Node 3, South Node 2 years — a 75-year cycle); the day/night order is the same seven-planet cycle rotated to start at the sect light, not two independently defined sequences. Planet periods split into seven equal sub-periods in the Sun-first order; node periods have none. Boundaries are half-open, so a boundary belongs to the later period or sub-period.
 * @exports FirdariaRulerKey, FirdariaPlanetKey, FIRDARIA_YEARS, FIRDARIA_DAY_ORDER, FIRDARIA_NIGHT_ORDER, FIRDARIA_SUB_ORDER, FIRDARIA_CYCLE_YEARS, FirdariaPeriod, FirdariaSubPeriod, firdariaPeriods, firdariaPeriodAt, firdariaSubPeriods, firdariaSubPeriodAt
 */
import type { Sect } from './sect.js';
import type { JulianDayUT } from '../ephemeris/types.js';

export type FirdariaRulerKey =
  'sun' | 'venus' | 'mercury' | 'moon' | 'saturn' | 'jupiter' | 'mars' | 'northNode' | 'southNode';

/** The seven classical planets, the only rulers that have sub-periods. */
export type FirdariaPlanetKey = Exclude<FirdariaRulerKey, 'northNode' | 'southNode'>;

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

/** The order of the circles from the Sun, used for sub-periods (Bonatti Tr. 9, ch. 3, p. 1387). */
export const FIRDARIA_SUB_ORDER: readonly FirdariaPlanetKey[] = [
  'sun',
  'venus',
  'mercury',
  'moon',
  'saturn',
  'jupiter',
  'mars',
];

const TROPICAL_YEAR_DAYS = 365.2425;
const SUB_PERIODS_PER_PERIOD = 7;

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

export interface FirdariaSubPeriod {
  readonly ruler: FirdariaPlanetKey;
  readonly startJd: JulianDayUT;
  readonly endJd: JulianDayUT;
}

/**
 * The seven equal sub-periods of a planet period, starting with the period's own ruler and running
 * cyclically through `FIRDARIA_SUB_ORDER`. A node period has none, so it returns `[]`.
 */
export function firdariaSubPeriods(period: FirdariaPeriod): readonly FirdariaSubPeriod[] {
  if (period.ruler === 'northNode' || period.ruler === 'southNode') return [];
  const startIndex = FIRDARIA_SUB_ORDER.indexOf(period.ruler);
  if (startIndex < 0) throw new Error('unreachable: planet ruler is in FIRDARIA_SUB_ORDER');
  const length = (period.endJd - period.startJd) / SUB_PERIODS_PER_PERIOD;
  const subs: FirdariaSubPeriod[] = [];
  for (let i = 0; i < SUB_PERIODS_PER_PERIOD; i++) {
    const ruler = FIRDARIA_SUB_ORDER[(startIndex + i) % FIRDARIA_SUB_ORDER.length];
    if (ruler === undefined) throw new Error('unreachable: sub order is non-empty');
    const startJd = period.startJd + i * length;
    // The last part ends exactly at the period end, so no floating-point drift accumulates.
    const endJd = i === SUB_PERIODS_PER_PERIOD - 1 ? period.endJd : period.startJd + (i + 1) * length;
    subs.push({ ruler, startJd, endJd });
  }
  return subs;
}

/**
 * The sub-period containing `targetJd` within the firdaria period active at that time, or `undefined`
 * if `targetJd` falls in a node period, before `fromJd`, or beyond `maxPeriods`.
 */
export function firdariaSubPeriodAt(
  sect: Sect,
  fromJd: JulianDayUT,
  targetJd: JulianDayUT,
  maxPeriods = 18,
): FirdariaSubPeriod | undefined {
  const period = firdariaPeriodAt(sect, fromJd, targetJd, maxPeriods);
  if (period === undefined) return undefined;
  return firdariaSubPeriods(period).find((sub) => targetJd >= sub.startJd && targetJd < sub.endJd);
}
