/**
 * Sign-ingress events (#562): the exact moments a body's ecliptic longitude crosses a sign
 * boundary (a multiple of 30°) within a search window — the same sample-then-bisect idiom
 * `stations.ts`/`transit-events.ts`/`lunations.ts` already use, applied to `signs.ts`'s own
 * 30°-wide partition instead of a speed-zero or elongation-target crossing.
 */
/**
 * @module astrology/sign-ingress
 * @purpose Finds exact sign-ingress instants (longitude crossing a 30° boundary) for a given body within a search window, via sample-then-bisect.
 * @conventions Same sample-then-bisect idiom as stations.ts/transit-events.ts/lunations.ts; a retrograde body crossing back over a boundary it already crossed produces its own (correctly dated) ingress event the other direction, not a deduplicated "undo".
 * @exports DEFAULT_SAMPLE_STEP_DAYS, SignIngressEvent, findSignIngresses
 */
import { signIndex } from './signs.js';
import type { BodyId, EphemerisProvider, JulianDayUT, PositionOptions, Zodiac } from '../ephemeris/types.js';

/** Mercury through Pluto change sign slowly enough that a half-day step never skips a boundary; the Moon (the fastest body this module is ever asked about) still crosses at most one boundary roughly every 2.5 days at a worst case ~13°/day, well inside this step's safety margin — same reasoning as the other finders' own default. */
export const DEFAULT_SAMPLE_STEP_DAYS = 0.5;

const BISECTION_TOLERANCE_DAYS = 1 / 86400;

export interface SignIngressEvent {
  readonly jd: JulianDayUT;
  /** The sign index (0 = Aries) the body entered. */
  readonly sign: number;
  /** True if the body entered this sign while retrograde (moving backward into it). */
  readonly retrograde: boolean;
}

async function bisectBoundary(
  provider: EphemerisProvider,
  body: BodyId,
  lowJd: JulianDayUT,
  highJd: JulianDayUT,
  boundarySign: number,
  options?: PositionOptions,
): Promise<JulianDayUT> {
  let low = lowJd;
  let high = highJd;
  while (high - low > BISECTION_TOLERANCE_DAYS) {
    const mid = (low + high) / 2;
    const sample = await provider.position(mid, body, options);
    if (signIndex(sample.longitude) === boundarySign) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * Every sign-ingress instant for `body` between `fromJd` and `toJd`, sampled every `stepDays`
 * (default 0.5) and bisected to the second once consecutive samples land in different signs —
 * including a retrograde body re-entering a sign it had already left forward, which gets its
 * own event (`retrograde: true`) at its own real timestamp, not silently dropped as a duplicate.
 */
export async function findSignIngresses(
  body: BodyId,
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
  provider: EphemerisProvider,
  zodiac?: Zodiac,
  stepDays: number = DEFAULT_SAMPLE_STEP_DAYS,
): Promise<readonly SignIngressEvent[]> {
  const options: PositionOptions | undefined = zodiac === undefined ? undefined : { zodiac };
  const events: SignIngressEvent[] = [];
  let previousJd = fromJd;
  const firstSample = await provider.position(previousJd, body, options);
  let previousSign = signIndex(firstSample.longitude);
  let jd = fromJd + stepDays;
  while (jd <= toJd) {
    const sample = await provider.position(jd, body, options);
    const sign = signIndex(sample.longitude);
    if (sign !== previousSign) {
      const boundaryJd = await bisectBoundary(provider, body, previousJd, jd, sign, options);
      events.push({ jd: boundaryJd, sign, retrograde: sample.retrograde });
    }
    previousJd = jd;
    previousSign = sign;
    jd += stepDays;
  }
  return events;
}
