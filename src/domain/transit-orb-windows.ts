/**
 * @module domain/transit-orb-windows
 * @purpose For each exact transit-to-natal aspect, the stretch of time the transiting body stays within the aspect's orb (entry, exact, exit) and which pass through the point each exact date is (#1401, after Solar Fire's Time Map entering, exact and leaving dates).
 * @conventions Async only because it asks the ephemeris provider for positions. The orb is the one Astraya already applies to that aspect (`orbFor` under the transit context's orb config): no new setting, no new number. Entry and exit are the first moments the gap to the exact longitude passes the orb either side of the exact date, found by stepping and bisecting to about a second. Every pass of the body through that longitude inside that one stretch is numbered in date order, direct and retrograde alike. Exact dates come from `findExactTransitAspects`, never recomputed here.
 * @exports TransitOrbWindow, TransitPass, TransitOrbWindowInfo, TransitOrbWindowOptions, computeTransitOrbWindows
 */
import { DEFAULT_ORB_CONFIG, orbFor, type OrbConfig } from '../astrology/aspects.js';
import { bodyById } from '../astrology/bodies.js';
import { orbConfigForContext } from '../astrology/orb-profiles.js';
import {
  DEFAULT_SAMPLE_STEP_DAYS,
  findExactTransitAspects,
  type TransitAspectEvent,
} from '../astrology/transit-events.js';
import type { BodyId, Degrees, EphemerisProvider, JulianDayUT, PositionOptions, Zodiac } from '../ephemeris/types.js';

/** The orb window around one exact transit date. */
export interface TransitOrbWindow {
  /** When the transiting body comes within the aspect's orb. */
  readonly entryJd: JulianDayUT;
  /** When the transiting body leaves the aspect's orb again. */
  readonly exitJd: JulianDayUT;
  /** The orb the window is measured with, in degrees. */
  readonly orb: Degrees;
}

/** Which pass through the point an exact date is: 1-based, in date order, of `count` inside the same orb window. */
export interface TransitPass {
  readonly number: number;
  readonly count: number;
}

export interface TransitOrbWindowInfo {
  readonly window: TransitOrbWindow;
  readonly pass: TransitPass;
}

export interface TransitOrbWindowOptions {
  /** The chart's orb settings; the transit context's own minor-aspect set is applied on top, as the Transits screen does. */
  readonly orbConfig?: OrbConfig;
  readonly zodiac?: Zodiac;
}

/** Bisection stops once the bracket is narrower than about one second. */
const TOLERANCE_DAYS = 1 / 86400;
/** The longest single step outward; a safety bound so a body that stands still is still sampled. */
const MAX_STEP_DAYS = 10;
/** Stops the walk if a body never leaves the orb (a guard against a loop, not a calendar rule). */
const MAX_WALK_DAYS = 100 * 365.2425;
/** Two exact dates closer than this are the same crossing found twice. */
const SAME_CROSSING_DAYS = 0.1;

function signedDelta(from: Degrees, to: Degrees): Degrees {
  const raw = (((to - from) % 360) + 360) % 360;
  return raw > 180 ? raw - 360 : raw;
}

/** The window and pass number of every event, keyed by the event object. Passes that share one in-orb stretch share its window. */
export async function computeTransitOrbWindows(
  provider: EphemerisProvider,
  events: readonly TransitAspectEvent[],
  options: TransitOrbWindowOptions = {},
): Promise<ReadonlyMap<TransitAspectEvent, TransitOrbWindowInfo>> {
  const config = orbConfigForContext('transit', options.orbConfig ?? DEFAULT_ORB_CONFIG);
  const positionOptions: PositionOptions | undefined =
    options.zodiac === undefined ? undefined : { zodiac: options.zodiac };
  const zodiacOption = options.zodiac === undefined ? {} : { zodiac: options.zodiac };
  const result = new Map<TransitAspectEvent, TransitOrbWindowInfo>();
  /** Stretches already found, so the passes of one loop (and duplicates across forecast tiers) cost one search. */
  const stretches: { event: TransitAspectEvent; window: TransitOrbWindow; passes: readonly JulianDayUT[] }[] = [];

  for (const event of events) {
    const known = stretches.find(
      (stretch) =>
        stretch.event.transitingBody === event.transitingBody &&
        stretch.event.natalBody === event.natalBody &&
        stretch.event.aspect.key === event.aspect.key &&
        stretch.passes.some((jd) => Math.abs(jd - event.jd) < SAME_CROSSING_DAYS),
    );
    if (known !== undefined) {
      result.set(event, infoFor(known.window, known.passes, event.jd));
      continue;
    }
    const transiting = bodyById(event.transitingBody);
    const natal = bodyById(event.natalBody);
    if (transiting === undefined || natal === undefined) continue;
    const orb = orbFor(event.aspect.key, transiting.category, natal.category, config, {
      a: transiting.key,
      b: natal.key,
    });
    const body: BodyId = event.transitingBody;
    // The longitude the body is at on the exact date is the point this pass goes through.
    const target = (await provider.position(event.jd, body, positionOptions)).longitude;

    // Walk outward in `direction` from the exact date to the first sample outside the orb, then bisect that bracket.
    const gapAt = async (jd: JulianDayUT): Promise<{ readonly gap: Degrees; readonly speed: number }> => {
      const here = await provider.position(jd, body, positionOptions);
      return { gap: Math.abs(signedDelta(here.longitude, target)), speed: Math.abs(here.longitudeSpeed) };
    };
    const boundary = async (direction: 1 | -1): Promise<JulianDayUT> => {
      let inside: JulianDayUT = event.jd;
      let outside: JulianDayUT | undefined;
      let walked = 0;
      while (walked < MAX_WALK_DAYS && outside === undefined) {
        const jd: JulianDayUT = event.jd + direction * walked;
        const { gap, speed } = await gapAt(jd);
        if (gap > orb) {
          outside = jd;
        } else {
          inside = jd;
          // Half the time the body would need to leave the orb at its current speed, within sane bounds.
          const toGo = (orb - gap) / Math.max(speed, 1e-3);
          walked += Math.min(MAX_STEP_DAYS, Math.max(DEFAULT_SAMPLE_STEP_DAYS, toGo / 2));
        }
      }
      if (outside === undefined) return inside;
      let lo: JulianDayUT = inside;
      let hi: JulianDayUT = outside;
      while (Math.abs(hi - lo) > TOLERANCE_DAYS) {
        const mid: JulianDayUT = (lo + hi) / 2;
        if ((await gapAt(mid)).gap > orb) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    };
    const entryJd = await boundary(-1);
    const exitJd = await boundary(1);

    // Every pass through this longitude inside the stretch: a conjunction search against the point itself.
    const crossings = await findExactTransitAspects(provider, [body], new Map([[0, target]]), entryJd, exitJd, {
      ...zodiacOption,
      sampleStepDays: Math.max(DEFAULT_SAMPLE_STEP_DAYS, (exitJd - entryJd) / 400),
    });
    const passes = [
      ...crossings.filter((hit) => hit.aspect.angle === 0).map((hit) => hit.jd),
      ...(crossings.some((hit) => hit.aspect.angle === 0 && Math.abs(hit.jd - event.jd) < SAME_CROSSING_DAYS)
        ? []
        : [event.jd]),
    ].sort((a, b) => a - b);
    const window = { entryJd, exitJd, orb };
    stretches.push({ event, window, passes });
    result.set(event, infoFor(window, passes, event.jd));
  }
  return result;
}

function infoFor(window: TransitOrbWindow, passes: readonly JulianDayUT[], jd: JulianDayUT): TransitOrbWindowInfo {
  let nearest = 0;
  passes.forEach((pass, index) => {
    if (Math.abs(pass - jd) < Math.abs((passes[nearest] ?? pass) - jd)) nearest = index;
  });
  return { window, pass: { number: nearest + 1, count: passes.length } };
}
