/**
 * @module rise-set-chart
 * @purpose The rise and set chart (#1407): the chart cast at the first rise, set, culmination or anti-culmination of a body after a birth moment, at the birthplace.
 * @conventions Solar Fire Deluxe guide §12.9 (PDF p. 92): the chart is for the moment of the event, at the base chart's place, with a True Altitude or Visual horizon. The event is found by `EphemerisProvider.riseTransit` (Step 7, #1407), so this module does no rise arithmetic itself. A `undefined` event is returned as the typed reason `circumpolar`, never thrown. Resolved like `lunar-phase-return.ts`: the moment comes from a `BirthMomentInput`, and the place is its coordinates at altitude 0.
 * @exports computeRiseSetChart, RiseSetChartData, RiseSetChartResult, RiseSetCircumpolar
 */
import type { ChartCalculationOptions, ChartData } from './chart-compute.js';
import { computeChartDataAtJd } from './chart-compute.js';
import type {
  BodyId,
  EphemerisProvider,
  GeoPosition,
  JulianDayUT,
  RiseTransitEvent,
  RiseTransitHorizon,
} from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';

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
 * The body does not rise or set (for this event and horizon) within the search window: at this latitude it stays up
 * or stays down. `riseTransit` returns `undefined` for both the visual and the true horizon, and this module reports
 * both as this one reason.
 */
export interface RiseSetCircumpolar {
  readonly chart: undefined;
  readonly reason: 'circumpolar';
}

/** A chart with its event moment, or the typed reason there is none. The caller must handle the reason. */
export type RiseSetChartResult = RiseSetChartData | RiseSetCircumpolar;

/**
 * The first `event` of `body` after the birth moment, at the birthplace, as a chart. Pass the same `horizon` the engine
 * uses for `riseTransit`: `'true'` (True Altitude) or `'visual'` (Visual). `provider` must already be initialized.
 */
export async function computeRiseSetChart(
  base: BirthMomentInput,
  body: BodyId,
  event: RiseTransitEvent,
  horizon: RiseTransitHorizon,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<RiseSetChartResult> {
  const place: GeoPosition = { ...base.coordinates, altitude: 0 };
  const baseJd = await julianDayFor(provider, resolveMoment(base));
  const eventJd = await provider.riseTransit(baseJd, body, place, event, horizon);
  if (eventJd === undefined) return { chart: undefined, reason: 'circumpolar' };
  const chart = await computeChartDataAtJd(eventJd, place, provider, options);
  return { chart, eventJd, place };
}
