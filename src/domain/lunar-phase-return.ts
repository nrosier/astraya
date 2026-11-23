/**
 * The lunar phase return (#1407): a chart for the moment the Sun-Moon phase angle comes back to its natal value. Solar
 * Fire Deluxe lists it with its lunar phase charts ("a chart in which the phase angle between the sun and the moon
 * returns to its natal phase angle", guide §12.10, PDF p. 92) and lets the user pick the return before the search date
 * (Current), the nearest one (Nearest) or the one after it (Next) (§12.10, step 7, p. 94).
 *
 * The phase angle is the Moon-minus-Sun ecliptic elongation that `astrology/lunations.ts` and `lunar-phase.ts` use.
 * The crossing is found with the same sample-then-bisect idiom as `lunations.ts`, whose helpers are private to it.
 */
/**
 * @module lunar-phase-return
 * @purpose Finds a lunar phase return (the Sun-Moon elongation back at its natal value) around a search date and casts it as a full chart (#1407).
 * @conventions Solar Fire Deluxe guide §12.10 (PDF pp. 92-94): the phase angle returning to its natal value, with Current/Nearest/Next around the search date. Elongation is Moon minus Sun ecliptic longitude, as in `astrology/lunations.ts`; sampled every half day and bisected to the second. The search reaches `PHASE_RETURN_SEARCH_DAYS` (31) either side of the date, more than the interval between two returns, so a return always lies on each side. Cast with `computeChartDataAtJd` at the birthplace unless a place is given, like `return-chart.ts`.
 * @exports computeLunarPhaseReturnChart, LunarPhaseReturnData, LunarPhaseReturnOptions, LunarPhaseReturnWhich, PHASE_RETURN_SEARCH_DAYS
 */
import { bodyByKey } from '../astrology/bodies.js';
import { DEFAULT_SAMPLE_STEP_DAYS } from '../astrology/lunations.js';
import type {
  BodyId,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  JulianDayUT,
  PositionOptions,
} from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import { computeChartDataAtJd, type ChartCalculationOptions, type ChartData } from './chart-compute.js';
import { ReturnNotFoundError } from './return-chart.js';

/**
 * How far either side of the search date a return is looked for. A phase angle comes back about once a synodic month
 * (29.5 days on average; one interval in the tests is 29.91 days), so 31 days either side always holds a return.
 */
export const PHASE_RETURN_SEARCH_DAYS = 31;

const BISECTION_TOLERANCE_DAYS = 1 / 86400;

/** Solar Fire's "Which One" (§12.10, step 7): the return before the date, the nearest one, or the one after it. */
export type LunarPhaseReturnWhich = 'current' | 'nearest' | 'next';

export interface LunarPhaseReturnOptions extends ChartCalculationOptions {
  /** Where the return is cast; the birthplace when omitted. */
  readonly place?: GeoPosition;
  /** Which return around the search date; `next` when omitted. */
  readonly which?: LunarPhaseReturnWhich;
}

export interface LunarPhaseReturnData {
  readonly returnJd: JulianDayUT;
  readonly place: GeoPosition;
  /** The natal phase angle (Moon minus Sun ecliptic longitude, 0-360). */
  readonly natalPhaseAngle: Degrees;
  readonly chart: ChartData;
}

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

const SUN = idOf('sun');
const MOON = idOf('moon');

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

async function phaseAngle(provider: EphemerisProvider, jd: JulianDayUT, options?: PositionOptions): Promise<Degrees> {
  const sun = await provider.position(jd, SUN, options);
  const moon = await provider.position(jd, MOON, options);
  return norm360(moon.longitude - sun.longitude);
}

/** Signed deviation of the phase angle from `target`, in (-180, 180], so a sign change near zero is a crossing. */
async function phaseDelta(
  provider: EphemerisProvider,
  jd: JulianDayUT,
  target: Degrees,
  options?: PositionOptions,
): Promise<Degrees> {
  const delta = norm360((await phaseAngle(provider, jd, options)) - target);
  return delta <= 180 ? delta : delta - 360;
}

/** Every instant in `[fromJd, toJd]` the phase angle equals `target`, in order. */
async function phaseCrossings(
  provider: EphemerisProvider,
  target: Degrees,
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
  options?: PositionOptions,
): Promise<readonly JulianDayUT[]> {
  const crossings: JulianDayUT[] = [];
  let previousJd = fromJd;
  let previousDelta = await phaseDelta(provider, previousJd, target, options);
  for (let jd = fromJd + DEFAULT_SAMPLE_STEP_DAYS; jd <= toJd; jd += DEFAULT_SAMPLE_STEP_DAYS) {
    const delta = await phaseDelta(provider, jd, target, options);
    // A jump of more than 180 between samples is the wrap at the antipode of `target`, not a crossing (lunations.ts).
    if (Math.sign(delta) !== Math.sign(previousDelta) && delta !== 0 && Math.abs(delta - previousDelta) < 180) {
      let low = previousJd;
      let high = jd;
      let lowValue = previousDelta;
      while (high - low > BISECTION_TOLERANCE_DAYS) {
        const mid = (low + high) / 2;
        const midValue = await phaseDelta(provider, mid, target, options);
        if (Math.sign(midValue) === Math.sign(lowValue) || midValue === 0) {
          low = mid;
          lowValue = midValue;
        } else {
          high = mid;
        }
      }
      crossings.push((low + high) / 2);
    } else if (delta === 0) {
      crossings.push(jd);
    }
    previousJd = jd;
    previousDelta = delta;
  }
  return crossings;
}

function pick(crossings: readonly JulianDayUT[], searchJd: JulianDayUT, which: LunarPhaseReturnWhich): JulianDayUT {
  const before = crossings.filter((jd) => jd < searchJd);
  const after = crossings.filter((jd) => jd >= searchJd);
  const current = before.at(-1);
  const next = after[0];
  const chosen =
    which === 'current'
      ? current
      : which === 'next'
        ? next
        : current === undefined || (next !== undefined && next - searchJd <= searchJd - current)
          ? next
          : current;
  if (chosen === undefined) throw new ReturnNotFoundError('No lunar phase return was found around this date.');
  return chosen;
}

/**
 * The lunar phase return around `searchJd`, as a chart: the instant the Moon-minus-Sun elongation equals its natal
 * value, before the date (`current`), nearest to it, or after it (`next`, the default). `provider` must already be
 * initialized.
 */
export async function computeLunarPhaseReturnChart(
  natalMoment: BirthMomentInput,
  searchJd: JulianDayUT,
  provider: EphemerisProvider,
  options: LunarPhaseReturnOptions = {},
): Promise<LunarPhaseReturnData> {
  const positionOptions: PositionOptions | undefined =
    options.zodiac === undefined ? undefined : { zodiac: options.zodiac };
  const natalJd = await julianDayFor(provider, resolveMoment(natalMoment));
  const natalPhaseAngle = await phaseAngle(provider, natalJd, positionOptions);
  const crossings = await phaseCrossings(
    provider,
    natalPhaseAngle,
    searchJd - PHASE_RETURN_SEARCH_DAYS,
    searchJd + PHASE_RETURN_SEARCH_DAYS,
    positionOptions,
  );
  const returnJd = pick(crossings, searchJd, options.which ?? 'next');
  const place: GeoPosition = options.place ?? { ...natalMoment.coordinates, altitude: 0 };
  const chart = await computeChartDataAtJd(returnJd, place, provider, options);
  return { returnJd, place, natalPhaseAngle, chart };
}
