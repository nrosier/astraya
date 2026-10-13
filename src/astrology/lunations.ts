/**
 * Lunation events (#562): the exact moments the Moon's elongation from the Sun crosses 0°
 * (New Moon, exact conjunction) or 180° (Full Moon, exact opposition) within a search window —
 * structurally the same sample-then-bisect idiom `stations.ts`/`transit-events.ts` already use,
 * applied to `lunar-phase.ts`'s own elongation definition instead of a single body's speed or a
 * natal-aspect delta.
 */
/**
 * @module astrology/lunations
 * @purpose Finds exact New Moon / Full Moon instants (elongation crossing 0°/180°) within a search window via sample-then-bisect.
 * @conventions Same sample-then-bisect idiom as stations.ts/transit-events.ts; elongation is Moon-minus-Sun ecliptic longitude only, matching lunar-phase.ts's own definition (not the true phase angle).
 * @exports DEFAULT_SAMPLE_STEP_DAYS, LunationEvent, findLunations
 */
import { bodyByKey } from './bodies.js';
import type { BodyId, Degrees, EphemerisProvider, JulianDayUT, PositionOptions, Zodiac } from '../ephemeris/types.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

const SUN = idOf('sun');
const MOON = idOf('moon');

/** Same step stations.ts/transit-events.ts use — safe for any body slower than the Moon, and the Moon's own elongation changes slowly enough relative to this step not to skip a crossing. */
export const DEFAULT_SAMPLE_STEP_DAYS = 0.5;

const BISECTION_TOLERANCE_DAYS = 1 / 86400;

export interface LunationEvent {
  readonly jd: JulianDayUT;
  readonly kind: 'new' | 'full';
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Signed elongation deviation from `target` (0 for New, 180 for Full), in (-180, 180], so a sign change means a crossing. */
async function elongationDelta(
  provider: EphemerisProvider,
  jd: JulianDayUT,
  target: Degrees,
  options?: PositionOptions,
): Promise<Degrees> {
  const sun = await provider.position(jd, SUN, options);
  const moon = await provider.position(jd, MOON, options);
  const elongation = norm360(moon.longitude - sun.longitude);
  const delta = norm360(elongation - target);
  return delta <= 180 ? delta : delta - 360;
}

async function bisectCrossing(
  provider: EphemerisProvider,
  target: Degrees,
  lowJd: JulianDayUT,
  highJd: JulianDayUT,
  lowDelta: Degrees,
  options?: PositionOptions,
): Promise<JulianDayUT> {
  let low = lowJd;
  let high = highJd;
  let lowValue = lowDelta;
  while (high - low > BISECTION_TOLERANCE_DAYS) {
    const mid = (low + high) / 2;
    const midValue = await elongationDelta(provider, mid, target, options);
    if (Math.sign(midValue) === Math.sign(lowValue) || midValue === 0) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * Every New Moon and Full Moon instant between `fromJd` and `toJd`, sampled every
 * `stepDays` (default 0.5, same as the other finders) and bisected to the second once a sign
 * change is found between consecutive samples. Results are in chronological order.
 */
export async function findLunations(
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
  provider: EphemerisProvider,
  zodiac?: Zodiac,
  stepDays: number = DEFAULT_SAMPLE_STEP_DAYS,
): Promise<readonly LunationEvent[]> {
  const options: PositionOptions | undefined = zodiac === undefined ? undefined : { zodiac };
  const events: LunationEvent[] = [];
  for (const [kind, target] of [
    ['new', 0],
    ['full', 180],
  ] as const) {
    let previousJd = fromJd;
    let previousDelta = await elongationDelta(provider, previousJd, target, options);
    let jd = fromJd + stepDays;
    while (jd <= toJd) {
      const delta = await elongationDelta(provider, jd, target, options);
      // `delta` wraps at ±180 (the antipode of `target`) — a real crossing happens near 0 and
      // changes by only a few degrees between samples, so a jump bigger than 180 between
      // consecutive samples is the wraparound seam itself, not an actual zero crossing (that
      // seam sits exactly at the *other* lunation's own event, so without this guard every New
      // Moon search would also misfire at each Full Moon, and vice versa).
      if (Math.sign(delta) !== Math.sign(previousDelta) && delta !== 0 && Math.abs(delta - previousDelta) < 180) {
        const crossingJd = await bisectCrossing(provider, target, previousJd, jd, previousDelta, options);
        events.push({ jd: crossingJd, kind });
      }
      previousJd = jd;
      previousDelta = delta;
      jd += stepDays;
    }
  }
  return events.sort((a, b) => a.jd - b.jd);
}
