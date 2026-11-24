/**
 * @module rise-set-chart
 * @purpose The rise and set chart (#1407): the chart cast at the first rise, set, culmination or anti-culmination of a body after a search moment (the birth moment by default), at the birthplace.
 * @conventions Solar Fire Deluxe guide §12.9 (PDF p. 92): the chart is for the moment of the event, at the base chart's place, with a True Altitude or Visual horizon. The event is found by `EphemerisProvider.riseTransit` (Step 7, #1407), so this module does no rise arithmetic itself. A `undefined` event is returned as a typed reason, never thrown: `circumpolar` when the body stays up through the window, `never-rises` when it stays down or does not rise within it (owner decision, 2026-11-23). Resolved like `lunar-phase-return.ts`: the moment comes from a `BirthMomentInput` (or `searchJd`, the search-from date), and the place is its coordinates at altitude 0.
 * @exports computeRiseSetChart, RiseSetChartData, RiseSetChartOptions, RiseSetChartResult, RiseSetCircumpolar, RiseSetNeverRises
 */
import type { ChartCalculationOptions, ChartData } from './chart-compute.js';
import { computeChartDataAtJd } from './chart-compute.js';
import type {
  BodyId,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  JulianDayUT,
  RiseTransitEvent,
  RiseTransitHorizon,
} from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';

/**
 * How far after the search moment the up/down state is read to tell the two reasons apart. It mirrors
 * `TRUE_HORIZON_WINDOW_DAYS` in `ephemeris/engine.ts` (the search window `riseTransit` uses): the body is up or down at
 * the window's end, and the search itself found no crossing in between.
 */
const STATE_WINDOW_DAYS = 1.5;

/** A rise, set, culmination or anti-culmination found for the chart: the chart at that instant, and where it was cast. */
export interface RiseSetChartData {
  /** The chart cast at `eventJd`, at `place`. */
  readonly chart: ChartData;
  /** The moment of the event, from `EphemerisProvider.riseTransit`. */
  readonly eventJd: JulianDayUT;
  /** The birthplace, at altitude 0 (the same place the lunar phase return uses). */
  readonly place: GeoPosition;
}

/**
 * The body stays up through the search window (up at its start and at its end, with no event in between): it is
 * circumpolar at this latitude, so the event does not happen on this day.
 */
export interface RiseSetCircumpolar {
  readonly chart: undefined;
  readonly reason: 'circumpolar';
}

/**
 * The body stays down through the search window, or does not rise (or set) within it: the event does not happen in the
 * window. A body that is down, or that rises and is still up at the end, is reported this way too.
 */
export interface RiseSetNeverRises {
  readonly chart: undefined;
  readonly reason: 'never-rises';
}

/** A chart with its event moment, or the typed reason there is none. The caller must handle the reason. */
export type RiseSetChartResult = RiseSetChartData | RiseSetCircumpolar | RiseSetNeverRises;

export interface RiseSetChartOptions extends ChartCalculationOptions {
  /**
   * The Julian day (UT) the search starts from, at the birthplace; the birth moment when omitted. Its name and type
   * follow `computeLunarPhaseReturnChart`'s `searchJd`, so the Rise/set screen can search from any day.
   */
  readonly searchJd?: JulianDayUT;
}

/**
 * Geometric altitude of the body's centre from `place`, without refraction: the same construction the engine's
 * true-horizon search uses (ecliptic position, then `azimuthAltitude`).
 */
async function centreAltitude(
  provider: EphemerisProvider,
  jd: JulianDayUT,
  body: BodyId,
  place: GeoPosition,
): Promise<Degrees> {
  const position = await provider.position(jd, body);
  const horizontal = await provider.azimuthAltitude(
    jd,
    { longitude: position.longitude, latitude: position.latitude },
    place,
  );
  return horizontal.altitude;
}

/**
 * The first `event` of `body` after the search moment, at the birthplace, as a chart. Pass the same `horizon` the engine
 * uses for `riseTransit`: `'true'` (True Altitude) or `'visual'` (Visual). `provider` must already be initialized.
 */
export async function computeRiseSetChart(
  base: BirthMomentInput,
  body: BodyId,
  event: RiseTransitEvent,
  horizon: RiseTransitHorizon,
  provider: EphemerisProvider,
  options: RiseSetChartOptions = {},
): Promise<RiseSetChartResult> {
  const place: GeoPosition = { ...base.coordinates, altitude: 0 };
  const fromJd = options.searchJd ?? (await julianDayFor(provider, resolveMoment(base)));
  const eventJd = await provider.riseTransit(fromJd, body, place, event, horizon);
  if (eventJd === undefined) {
    // `riseTransit` returns no moment in both cases, so the up/down state at the window's ends tells them apart.
    const upAtStart = (await centreAltitude(provider, fromJd, body, place)) > 0;
    const upAtEnd = (await centreAltitude(provider, fromJd + STATE_WINDOW_DAYS, body, place)) > 0;
    return upAtStart && upAtEnd
      ? { chart: undefined, reason: 'circumpolar' }
      : { chart: undefined, reason: 'never-rises' };
  }
  const chart = await computeChartDataAtJd(eventJd, place, provider, options);
  return { chart, eventJd, place };
}
