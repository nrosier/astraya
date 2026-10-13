/**
 * A shared shape for "when is this timing technique's period active" (#554), so a future
 * timeline view can lay multiple timing techniques on one shared axis without needing to know
 * each technique's own internal period structure.
 *
 * It keeps every technique's own calculation isolated while letting the UI align their periods
 * and exact events on one date axis.
 */
/**
 * @module domain/timing-timeline
 * @purpose Shared `TimingTimelineEvent` shape plus adapters for each timing technique exposed by TimingTimelineView.
 * @conventions Adapters are pure and one-way (technique output → events, never the reverse).
 * @exports TimingTimelineEvent, TimingTimelineTrack, TIMING_TIMELINE_TRACKS, timingTimelineTracks, releasingPeriodsToTimelineEvents, firdariaPeriodsToTimelineEvents, profectionToTimelineEvents, primaryDirectionsToTimelineEvents, secondaryProgressionToTimelineEvents, solarArcToTimelineEvents, transitToTimelineEvents, periodicTransitToTimelineEvents
 */
import { bodyById } from '../astrology/bodies.js';
import type { Aspect } from '../astrology/aspects.js';
import type { FirdariaPeriod } from '../astrology/firdaria.js';
import type { TransitAspectEvent } from '../astrology/transit-events.js';
import type { StationEvent } from '../astrology/stations.js';
import type { ReleasingPeriod, ReleasingSubperiod } from '../astrology/zodiacal-releasing.js';
import { SIGNS } from '../astrology/signs.js';
import type { JulianDayUT } from '../ephemeris/types.js';
import type { PrimaryDirection } from './primary-directions.js';
import type { ProfectionData } from './profections.js';
import type { SecondaryProgressionData } from './secondary-progression.js';
import type { SolarArcDirectionsData } from './solar-arc-directions.js';
import type { TransitData } from './transit.js';
import type { PeriodicTransitForecast } from './periodic-transit.js';

export interface TimingTimelineEvent {
  readonly kind: string;
  readonly startJd: JulianDayUT;
  /** Open-ended if omitted — not used by any adapter here, since every technique adapted so far has a known end. */
  readonly endJd?: JulianDayUT;
  readonly label: string;
  /** Which module computed this event, for a timeline UI to group/color/filter by technique. */
  readonly sourceModule: string;
}

/** The stable tracks rendered on the shared timing axis, ordered from long periods to short contacts. */
export const TIMING_TIMELINE_TRACKS = [
  'zodiacal-releasing',
  'firdaria',
  'profections',
  'primary-directions',
  'secondary-progression',
  'solar-arc',
  'transit',
  'periodic-transit',
] as const;

export type TimingTimelineTrack = (typeof TIMING_TIMELINE_TRACKS)[number];

export interface TimingTimelineTrackEvents {
  readonly track: TimingTimelineTrack;
  readonly events: readonly TimingTimelineEvent[];
}

function isInWindow(event: TimingTimelineEvent, fromJd: JulianDayUT, toJd: JulianDayUT): boolean {
  return event.startJd <= toJd && (event.endJd ?? event.startJd) >= fromJd;
}

function belongsToTrack(event: TimingTimelineEvent, track: TimingTimelineTrack): boolean {
  if (track === 'profections') return event.kind.startsWith('profection');
  if (track === 'primary-directions') return event.kind.startsWith('primary-direction');
  return event.kind === track;
}

/** Group already-normalized events into the fixed tracks visible on one common date range. */
export function timingTimelineTracks(
  events: readonly TimingTimelineEvent[],
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
): readonly TimingTimelineTrackEvents[] {
  return TIMING_TIMELINE_TRACKS.map((track) => ({
    track,
    events: events.filter((event) => belongsToTrack(event, track) && isInWindow(event, fromJd, toJd)),
  }));
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

/** Level-2 zodiacal-releasing subperiods, labelled apart from the enclosing Level-1 periods. */
export function releasingSubperiodsToTimelineEvents(
  periods: readonly ReleasingSubperiod[],
): readonly TimingTimelineEvent[] {
  return periods.map((period) => ({
    kind: 'zodiacal-releasing',
    startJd: period.startJd,
    endJd: period.endJd,
    label: `L2 ${SIGNS[period.sign]?.name ?? String(period.sign)} / ${bodyById(period.ruler)?.key ?? String(period.ruler)}${period.loosingOfBond ? ' (loosing of the bond)' : ''}`,
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

/** Primary directions as their configured active windows rather than only a zero-width exact instant. */
export function primaryDirectionsToTimelineEvents(
  directions: readonly PrimaryDirection[],
): readonly TimingTimelineEvent[] {
  return directions.map((direction) => ({
    kind: `primary-direction-${direction.mode}`,
    startJd: direction.exactJd + (direction.activeFromAge - direction.ageYears) * TROPICAL_YEAR_DAYS,
    endJd: direction.exactJd + (direction.activeUntilAge - direction.ageYears) * TROPICAL_YEAR_DAYS,
    label: `${direction.promissor} ${direction.aspect} ${direction.significator}`,
    sourceModule: 'domain/primary-directions',
  }));
}

function aspectLabel(aspect: Aspect): string {
  const a = bodyById(aspect.bodyA)?.key ?? String(aspect.bodyA);
  const b = bodyById(aspect.bodyB)?.key ?? String(aspect.bodyB);
  return `${a} ${aspect.aspect.name} ${b}`;
}

function contactsToTimelineEvents(
  kind: string,
  sourceModule: string,
  contacts: readonly Aspect[],
  jd: JulianDayUT,
): readonly TimingTimelineEvent[] {
  return contacts.map((contact) => ({ kind, startJd: jd, endJd: jd, label: aspectLabel(contact), sourceModule }));
}

/** Secondary-progression contacts as a dated snapshot at the selected target moment. */
export function secondaryProgressionToTimelineEvents(
  data: SecondaryProgressionData,
  targetJd: JulianDayUT,
): readonly TimingTimelineEvent[] {
  return contactsToTimelineEvents('secondary-progression', 'domain/secondary-progression', data.contacts, targetJd);
}

/** Solar-arc contacts with an independently calculated exact date. */
export function solarArcToTimelineEvents(data: SolarArcDirectionsData): readonly TimingTimelineEvent[] {
  return data.contacts.flatMap((contact) =>
    contact.exactJd === undefined
      ? []
      : [
          {
            kind: 'solar-arc',
            startJd: contact.exactJd,
            endJd: contact.exactJd,
            label: aspectLabel(contact),
            sourceModule: 'domain/solar-arc-directions',
          },
        ],
  );
}

/** Transit contacts as a dated snapshot at the selected target moment. */
export function transitToTimelineEvents(data: TransitData, targetJd: JulianDayUT): readonly TimingTimelineEvent[] {
  return contactsToTimelineEvents('transit', 'domain/transit', data.contacts, targetJd);
}

function exactTransitEvents(events: readonly TransitAspectEvent[]): readonly TimingTimelineEvent[] {
  return events.map((event) => ({
    kind: 'periodic-transit',
    startJd: event.jd,
    endJd: event.jd,
    label: `${bodyById(event.transitingBody)?.key ?? String(event.transitingBody)} ${event.aspect.name} ${bodyById(event.natalBody)?.key ?? String(event.natalBody)}`,
    sourceModule: 'domain/periodic-transit',
  }));
}

function stationEvents(events: readonly StationEvent[]): readonly TimingTimelineEvent[] {
  return events.map((event) => ({
    kind: 'periodic-transit',
    startJd: event.jd,
    endJd: event.jd,
    label: `${bodyById(event.body)?.key ?? String(event.body)} stations ${event.direction}`,
    sourceModule: 'domain/periodic-transit',
  }));
}

function returnEvent(kind: string, jd: JulianDayUT, label: string): TimingTimelineEvent {
  return { kind, startJd: jd, endJd: jd, label, sourceModule: 'domain/periodic-transit' };
}

/** Exact transit and station events from the daily, weekly, and monthly forecast tiers. */
export function periodicTransitToTimelineEvents(data: PeriodicTransitForecast): readonly TimingTimelineEvent[] {
  return [
    returnEvent('return', data.yearly.solarReturn.returnJd, 'solar return'),
    returnEvent('return', data.yearly.demibirthday.demibirthdayJd, 'demibirthday'),
    returnEvent('return', data.monthly.progressedLunarReturn.returnJd, 'progressed lunar return'),
    ...data.weekly.lunarReturns.returns.map((entry) => returnEvent('return', entry.returnJd, 'lunar return')),
    ...exactTransitEvents(data.daily.exactToday),
    ...stationEvents(data.daily.stationsToday),
    ...exactTransitEvents(data.weekly.events),
    ...exactTransitEvents(data.monthly.events),
  ];
}
