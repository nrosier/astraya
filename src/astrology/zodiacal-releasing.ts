/**
 * Zodiacal releasing, Level 1 only (#554): the Hellenistic time-lord technique of walking
 * forward sign by sign from a Lot's own natal sign, each sign's period lasting its ruler's own
 * fixed number of years (Vettius Valens, *Anthology* book IV; this project's own implementation
 * is checked only against the widely-repeated modern secondary-literature summary of Valens'
 * table — chiefly via Robert Schmidt's and James Holden's translations as commonly cited — not
 * independently verified against Valens' own Greek text).
 *
 * **Scope.** Only Level 1 (the major periods) is computed. Valens' full technique nests Level 2
 * (and sometimes 3/4) sub-periods inside each L1 period, and applies a special "loosing of the
 * bond" rule when a period's own ruler repeats — neither is implemented here. A caller gets the
 * L1 sign/ruler/years/date-range sequence only.
 */
/**
 * @module astrology/zodiacal-releasing
 * @purpose Computes Level-1 zodiacal-releasing periods (sign, ruler, years, date range) walking forward from a Lot's own natal sign.
 * @conventions Per-planet year lengths are the ones repeated identically across modern secondary literature on Valens; Level 2+ sub-periods and the "loosing of the bond" rule are explicitly out of scope. Rulership is always traditional — Hellenistic technique, no modern-ruler variant exists in the sources checked.
 * @exports PLANET_RELEASING_YEARS, ReleasingPeriod, zodiacalReleasingPeriods, zodiacalReleasingPeriodAt
 */
import { bodyByKey } from './bodies.js';
import { rulerOf } from './dignities.js';
import { signIndex } from './signs.js';
import type { BodyId, Degrees, JulianDayUT } from '../ephemeris/types.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

/**
 * Years assigned to each planet's own periods — the same "minor years" table firdaria also uses
 * for its own, differently-ordered system (not interchangeable; see `firdaria.ts`'s own table).
 */
export const PLANET_RELEASING_YEARS: ReadonlyMap<BodyId, number> = new Map([
  [idOf('saturn'), 30],
  [idOf('jupiter'), 12],
  [idOf('mars'), 15],
  [idOf('sun'), 19],
  [idOf('venus'), 8],
  [idOf('mercury'), 20],
  [idOf('moon'), 25],
]);

/** Average tropical year length — the same one `progressions.ts`'s `TROPICAL_YEAR_DAYS` uses, duplicated here to avoid a cross-module dependency for one constant. */
const TROPICAL_YEAR_DAYS = 365.2425;

export interface ReleasingPeriod {
  readonly sign: number;
  readonly ruler: BodyId;
  readonly years: number;
  readonly startJd: JulianDayUT;
  readonly endJd: JulianDayUT;
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
    const ruler = rulerOf(sign, 'traditional');
    const years = PLANET_RELEASING_YEARS.get(ruler);
    if (years === undefined)
      throw new Error(`unreachable: every sign's traditional ruler is one of the seven classical planets`);
    const endJd = cursor + years * TROPICAL_YEAR_DAYS;
    periods.push({ sign, ruler, years, startJd: cursor, endJd });
    cursor = endJd;
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
