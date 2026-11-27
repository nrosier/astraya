/**
 * Zodiacal releasing, Level 1 only (#554): the Hellenistic time-lord technique of walking
 * forward sign by sign from a Lot's own natal sign. Level 1 assigns each sign its traditional
 * fixed period (Vettius Valens, *Anthology* book IV); Level 2 repeats that sign table in months
 * inside each Level-1 period and applies the loosing-of-the-bond jump after a completed cycle.
 *
 * **Scope.** Levels 1 and 2 are computed. Valens' further nested levels are deliberately not
 * implied by this API; the timeline needs the major period plus the first useful sub-period,
 * rather than an unlabelled, exponentially larger event set.
 */
/**
 * @module astrology/zodiacal-releasing
 * @purpose Computes Level-1 and Level-2 zodiacal-releasing periods (sign, ruler, duration, date range) walking forward from a Lot's own natal sign.
 * @conventions Uses Valens' sign-period table, including Capricorn's 27 rather than Saturn's 30 years; L2 durations are the same counts in months and jump to the opposite sign at the first completed cycle (loosing of the bond). Dates use Valens' idealised 360-day year and 30-day months (RELEASING_YEAR_DAYS, RELEASING_MONTH_DAYS; Brennan 2017 p. 558, n. 13), not the tropical year, so each period falls about 5.24 days a year ahead of the calendar. Rulership is always traditional — Hellenistic technique, no modern-ruler variant exists in the sources checked.
 * @exports ZODIACAL_RELEASING_SIGN_YEARS, RELEASING_YEAR_DAYS, RELEASING_MONTH_DAYS, ReleasingPeriod, ReleasingSubperiod, zodiacalReleasingPeriods, zodiacalReleasingSubperiods, zodiacalReleasingPeriodAt
 */
import { rulerOf } from './dignities.js';
import { signIndex } from './signs.js';
import type { BodyId, Degrees, JulianDayUT } from '../ephemeris/types.js';

/**
 * Valens' Level-1 sign periods, Aries through Pisces. Capricorn's 27-year term is sign-specific:
 * it must not be flattened into Saturn's 30-year Aquarius term. The same numbers become months
 * for Level 2. See Valens, *Anthology* 4, 4: 3-4, as tabulated in Brennan, *Hellenistic Astrology*
 * (2017), ch. 18, printed p. 555 (`brennan-hellenistic-astrology-2017`).
 */
export const ZODIACAL_RELEASING_SIGN_YEARS = [15, 8, 20, 25, 19, 20, 8, 15, 12, 27, 30, 12] as const;

/**
 * Valens' idealised year and month: 360 days and 30-day months (*Anthology* 4, 9; Brennan 2017,
 * ch. 18, printed p. 558, n. 13). The releasing dates use these, not the tropical year (#2033).
 * A 360-day year is about 5.24 days shorter than a tropical year, so each period falls that much
 * further ahead of the calendar for every year it spans.
 */
export const RELEASING_YEAR_DAYS = 360;
export const RELEASING_MONTH_DAYS = 30;

export interface ReleasingPeriod {
  readonly sign: number;
  readonly ruler: BodyId;
  readonly years: number;
  readonly startJd: JulianDayUT;
  readonly endJd: JulianDayUT;
}

export interface ReleasingSubperiod {
  readonly level: 2;
  readonly parent: ReleasingPeriod;
  readonly sign: number;
  readonly ruler: BodyId;
  /** Valens' sign-period number, expressed as months at Level 2. */
  readonly months: number;
  readonly startJd: JulianDayUT;
  readonly endJd: JulianDayUT;
  /** True on the subperiod introduced by the first loosing-of-the-bond jump. */
  readonly loosingOfBond: boolean;
}

function rulerForSign(sign: number): BodyId {
  return rulerOf(sign, 'traditional');
}

function yearsForSign(sign: number): number {
  const years = ZODIACAL_RELEASING_SIGN_YEARS[sign];
  if (years === undefined) throw new RangeError(`invalid zodiacal-releasing sign ${String(sign)}`);
  return years;
}

/**
 * The sequence of Level-1 periods starting at `startLongitude`'s own sign (typically the Lot of
 * Fortune or Spirit's natal degree), each lasting its ruler's own years, in order from
 * `fromJd` (typically the natal Julian day). Walks exactly `count` periods forward — there is no
 * natural "end" to the cycle (it loops through the zodiac repeatedly over a lifetime), so the
 * caller decides how far to look.
 */
export function zodiacalReleasingPeriods(
  startLongitude: Degrees,
  fromJd: JulianDayUT,
  count: number,
): readonly ReleasingPeriod[] {
  const startSign = signIndex(startLongitude);
  const periods: ReleasingPeriod[] = [];
  let cursor = fromJd;
  for (let i = 0; i < count; i++) {
    const sign = (startSign + i) % 12;
    const ruler = rulerForSign(sign);
    const years = yearsForSign(sign);
    const endJd = cursor + years * RELEASING_YEAR_DAYS;
    periods.push({ sign, ruler, years, startJd: cursor, endJd });
    cursor = endJd;
  }
  return periods;
}

/**
 * Level-2 periods inside one Level-1 period. The 12-sign cycle totals 211 months; if a parent
 * lasts longer, the next child begins from the opposite sign rather than repeating its start,
 * Valens' loosing of the bond. The final child is shortened only when it reaches the parent's
 * end, so the returned intervals always tile that parent exactly.
 */
export function zodiacalReleasingSubperiods(parent: ReleasingPeriod): readonly ReleasingSubperiod[] {
  const monthDays = RELEASING_MONTH_DAYS;
  const periods: ReleasingSubperiod[] = [];
  let cursor = parent.startJd;
  let sign = parent.sign;
  let completedCycle = false;

  while (cursor < parent.endJd) {
    const naturalEndJd = cursor + yearsForSign(sign) * monthDays;
    const endJd = Math.min(naturalEndJd, parent.endJd);
    periods.push({
      level: 2,
      parent,
      sign,
      ruler: rulerForSign(sign),
      months: yearsForSign(sign),
      startJd: cursor,
      endJd,
      loosingOfBond: completedCycle,
    });
    cursor = endJd;
    if (cursor >= parent.endJd) break;
    if ((sign + 1) % 12 === parent.sign) {
      sign = (parent.sign + 6) % 12;
      completedCycle = true;
    } else {
      sign = (sign + 1) % 12;
      completedCycle = false;
    }
  }
  return periods;
}

/** The single Level-1 period active at `targetJd`, or `undefined` if it falls before `fromJd` or after as many periods as `maxPeriods` covers. */
export function zodiacalReleasingPeriodAt(
  startLongitude: Degrees,
  fromJd: JulianDayUT,
  targetJd: JulianDayUT,
  maxPeriods = 60,
): ReleasingPeriod | undefined {
  if (targetJd < fromJd) return undefined;
  return zodiacalReleasingPeriods(startLongitude, fromJd, maxPeriods).find(
    (period) => targetJd >= period.startJd && targetJd < period.endJd,
  );
}
