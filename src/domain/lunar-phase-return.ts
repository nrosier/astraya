/**
 * The lunar phase return (#1407): a chart for the moment the Sun-Moon phase angle comes back to its natal value. Solar
 * Fire Deluxe lists phase returns with its lunar phase charts: "a chart in which the phase angle between the sun and
 * the moon returns to its natal phase angle), starting one lunar month prior to the search date" (guide §12.10, PDF
 * p. 92). Read with its sibling list types ("starting 2 phases prior", "Phases to Find"), that is a list of returns, so
 * `findLunarPhaseReturns` lists them from the most recent return before the date, which always falls within one lunar
 * month before it. `computeLunarPhaseReturnChart`'s Current/Nearest/Next choice is Astraya's own convenience (owner
 * decision, 2026-11-23), borrowed from the guide's single-chart "Which One" (§12.10, step 7, p. 94).
 *
 * The phase angle is the Moon-minus-Sun ecliptic elongation that `astrology/lunations.ts` and `lunar-phase.ts` use. No
 * held source defines Solar Fire's "phase angle" more precisely. The crossing is found with the same sample-then-bisect
 * idiom as `lunations.ts`, whose helpers are private to it.
 */
/**
 * @module lunar-phase-return
 * @purpose Finds lunar phase returns (the Sun-Moon elongation back at its natal value) around a search date, as a list or as one chart (#1407).
 * @conventions Solar Fire Deluxe guide §12.10 (PDF pp. 92-94): the list starts at the most recent return before the search date (Solar Fire's "starting one lunar month prior"); Current/Nearest/Next is Astraya's own convenience (owner, 2026-11-23). Elongation is Moon minus Sun ecliptic longitude, as in `astrology/lunations.ts` (not defined further by a held source); sampled every half day and bisected to the second. The birth instant itself is never a return. The search reaches `PHASE_RETURN_SEARCH_DAYS` (31) before the date, more than the interval between two returns. Cast with `computeChartDataAtJd` at the birthplace unless a place is given, like `return-chart.ts`.
 * @exports computeLunarPhaseReturnChart, findLunarPhaseReturns, LunarPhaseReturnData, LunarPhaseReturnList, LunarPhaseReturnOptions, LunarPhaseReturnWhich, PHASE_RETURN_SEARCH_DAYS
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

/**
 * A crossing this close to the birth is the birth itself, not a return. It is wider than the bisection tolerance, so
 * floating-point error on either side of the natal instant cannot turn the birth into a "return".
 */
const NATAL_EXCLUSION_DAYS = 60 / 86400;

/**
 * Around the search date: the return before it, the nearest one, or the one after it. Astraya's own convenience, after
 * Solar Fire's single-chart "Which One" (§12.10, step 7); Solar Fire itself lists phase returns (`findLunarPhaseReturns`).
 */
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
    // A sample exactly on `target` was recorded on its own step, so its neighbour must not bisect to it again.
    if (
      previousDelta !== 0 &&
      Math.sign(delta) !== Math.sign(previousDelta) &&
      delta !== 0 &&
      Math.abs(delta - previousDelta) < 180
    ) {
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

export interface LunarPhaseReturnList {
  /** The natal phase angle (Moon minus Sun ecliptic longitude, 0-360). */
  readonly natalPhaseAngle: Degrees;
  /** In order, starting at the most recent return before the search date. */
  readonly returns: readonly JulianDayUT[];
}

/** The natal Julian day and phase angle a search needs. */
async function natalPhase(
  natalMoment: BirthMomentInput,
  provider: EphemerisProvider,
  options?: PositionOptions,
): Promise<{ readonly natalJd: JulianDayUT; readonly natalPhaseAngle: Degrees }> {
  const natalJd = await julianDayFor(provider, resolveMoment(natalMoment));
  return { natalJd, natalPhaseAngle: await phaseAngle(provider, natalJd, options) };
}

/** Every return in `[fromJd, toJd]`, leaving out the birth instant itself. */
async function returnsBetween(
  provider: EphemerisProvider,
  natalJd: JulianDayUT,
  natalPhaseAngle: Degrees,
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
  options?: PositionOptions,
): Promise<readonly JulianDayUT[]> {
  const crossings = await phaseCrossings(provider, natalPhaseAngle, fromJd, toJd, options);
  return crossings.filter((jd) => Math.abs(jd - natalJd) >= NATAL_EXCLUSION_DAYS);
}

/**
 * `count` lunar phase returns, Solar Fire's list (§12.10): starting at the most recent return before `searchJd`, which
 * always lies within one lunar month before it, then each following one. `provider` must already be initialized.
 */
export async function findLunarPhaseReturns(
  natalMoment: BirthMomentInput,
  searchJd: JulianDayUT,
  count: number,
  provider: EphemerisProvider,
  options: Pick<ChartCalculationOptions, 'zodiac'> = {},
): Promise<LunarPhaseReturnList> {
  if (!Number.isInteger(count) || count < 1)
    throw new RangeError(`count must be a positive integer, got ${String(count)}`);
  const positionOptions: PositionOptions | undefined =
    options.zodiac === undefined ? undefined : { zodiac: options.zodiac };
  const { natalJd, natalPhaseAngle } = await natalPhase(natalMoment, provider, positionOptions);
  const crossings = await returnsBetween(
    provider,
    natalJd,
    natalPhaseAngle,
    searchJd - PHASE_RETURN_SEARCH_DAYS,
    searchJd + PHASE_RETURN_SEARCH_DAYS * count,
    positionOptions,
  );
  // The most recent return before the date starts the list; crossings are in order.
  const start = Math.max(0, crossings.filter((jd) => jd < searchJd).length - 1);
  const returns = crossings.slice(start, start + count);
  if (returns.length < count) throw new ReturnNotFoundError('Fewer lunar phase returns were found than asked for.');
  return { natalPhaseAngle, returns };
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
  const { natalJd, natalPhaseAngle } = await natalPhase(natalMoment, provider, positionOptions);
  const crossings = await returnsBetween(
    provider,
    natalJd,
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
