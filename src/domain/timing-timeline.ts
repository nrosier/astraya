/**
 * A shared shape for "when is this timing technique's period active" (#554), so a future
 * timeline view can lay multiple timing techniques on one shared axis without needing to know
 * each technique's own internal period structure.
 *
 * **Scope, deliberately time-boxed.** This module defines the shared shape and gives adapters
 * for the two new techniques built directly against it (zodiacal releasing, firdaria) plus one
 * existing technique (profections) as a worked proof-of-concept that an existing module's output
 * can be adapted without changing that module itself. The other six existing timing techniques
 * (secondary/minor progressions, solar-arc directions, primary directions, transits, periodic
 * transits) are not adapted here — each would need its own small, technique-specific adapter
 * later, and none of this module's own exports require it. No UI consumes this yet.
 */
/**
 * @module domain/timing-timeline
 * @purpose Shared `TimingTimelineEvent` shape for timing-technique periods, with adapters from zodiacal releasing, firdaria, and profections.
 * @conventions Adapters are pure, one-way (technique output → events, never the reverse) and change nothing in the adapted module; only three of the ten timing techniques are adapted so far (see module header for why).
 * @exports TimingTimelineEvent, releasingPeriodsToTimelineEvents, firdariaPeriodsToTimelineEvents, profectionToTimelineEvents
 */
import { bodyById } from '../astrology/bodies.js';
import type { FirdariaPeriod } from '../astrology/firdaria.js';
import type { ReleasingPeriod } from '../astrology/zodiacal-releasing.js';
import { SIGNS } from '../astrology/signs.js';
import type { JulianDayUT } from '../ephemeris/types.js';
import type { ProfectionData } from './profections.js';

export interface TimingTimelineEvent {
  readonly kind: string;
  readonly startJd: JulianDayUT;
  /** Open-ended if omitted — not used by any adapter here, since every technique adapted so far has a known end. */
  readonly endJd?: JulianDayUT;
  readonly label: string;
  /** Which module computed this event, for a timeline UI to group/color/filter by technique. */
  readonly sourceModule: string;
}

/** Zodiacal-releasing (#554) Level-1 periods as timeline events, one per sign period. */
export function releasingPeriodsToTimelineEvents(periods: readonly ReleasingPeriod[]): readonly TimingTimelineEvent[] {
  return periods.map((period) => ({
    kind: 'zodiacal-releasing',
    startJd: period.startJd,
    endJd: period.endJd,
    label: `${SIGNS[period.sign]?.name ?? String(period.sign)} / ${bodyById(period.ruler)?.key ?? String(period.ruler)}`,
    sourceModule: 'astrology/zodiacal-releasing',
  }));
}

/** Firdaria (#554) periods as timeline events, one per ruler period. */
export function firdariaPeriodsToTimelineEvents(periods: readonly FirdariaPeriod[]): readonly TimingTimelineEvent[] {
  return periods.map((period) => ({
    kind: 'firdaria',
    startJd: period.startJd,
    endJd: period.endJd,
    label: period.ruler,
    sourceModule: 'astrology/firdaria',
  }));
}

const TROPICAL_YEAR_DAYS = 365.2425;

/**
 * One `ProfectionData` snapshot (#168, already computed for a single target moment) as the pair
 * of timeline events — year and month — active at that moment. Unlike the releasing/firdaria
 * adapters, this is adapting a single point-in-time result rather than a pre-built sequence,
 * since `computeProfections` itself only ever answers "what is active right now", not "give me
 * the next N periods" — reconstructing the boundaries here from `natalJd`/`age` rather than
 * changing `profections.ts`'s own return shape.
 */
export function profectionToTimelineEvents(data: ProfectionData): readonly TimingTimelineEvent[] {
  const years = Math.floor(data.age);
  const yearStartJd = data.natalJd + years * TROPICAL_YEAR_DAYS;
  const yearEndJd = yearStartJd + TROPICAL_YEAR_DAYS;
  const monthLengthJd = TROPICAL_YEAR_DAYS / 12;
  const monthStartJd = yearStartJd + data.month.monthIndex * monthLengthJd;
  const monthEndJd = monthStartJd + monthLengthJd;

  return [
    {
      kind: 'profection-year',
      startJd: yearStartJd,
      endJd: yearEndJd,
      label: `${data.year.signName} / house ${String(data.year.house)}`,
      sourceModule: 'domain/profections',
    },
    {
      kind: 'profection-month',
      startJd: monthStartJd,
      endJd: monthEndJd,
      label: `${data.month.signName} / house ${String(data.month.house)}`,
      sourceModule: 'domain/profections',
    },
  ];
}
