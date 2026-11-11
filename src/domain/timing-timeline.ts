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
 * @conventions Adapters are pure and one-way (technique output → events, never the reverse). An event says what it is about as data (`TimelineSubject`: keys and numbers), never as words, so the screen words it in the reader's language (#674).
 * @exports TimelineBodyGroup, timelineEventBodies, eventMatchesBodyGroup, TimingTimelineEvent, TimelineSubject, TimelineReturn, ReleasingLot, TimingTimelineTrack, TIMING_TIMELINE_TRACKS, timingTimelineTracks, releasingPeriodsToTimelineEvents, firdariaPeriodsToTimelineEvents, profectionToTimelineEvents, primaryDirectionsToTimelineEvents, secondaryProgressionToTimelineEvents, solarArcToTimelineEvents, transitToTimelineEvents, periodicTransitToTimelineEvents
 */
import { bodyByKey, bodyById } from '../astrology/bodies.js';
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
import type { TransitOrbWindowInfo, TransitPass } from './transit-orb-windows.js';

/** The lot zodiacal releasing starts from (#680): Fortune for the body and life, Spirit for action and career. */
export type ReleasingLot = 'fortune' | 'spirit';

export type TimelineReturn = 'solar-return' | 'demibirthday' | 'progressed-lunar-return' | 'lunar-return';

/**
 * What a timeline event is about, as keys and numbers for the screen to put into words (#674). Signs are
 * `SignDefinition.name`s and bodies `BodyDefinition.key`s (or a primary-direction angle key, a firdaria node key).
 */
export type TimelineSubject =
  | {
      readonly kind: 'releasing';
      /** The lot released from (#680). */
      readonly lot: ReleasingLot;
      readonly level: 1 | 2;
      readonly sign: string;
      readonly ruler: string;
      readonly loosingOfBond: boolean;
    }
  | { readonly kind: 'firdaria'; readonly ruler: string }
  | { readonly kind: 'profection'; readonly sign: string; readonly house: number }
  | { readonly kind: 'aspect'; readonly from: string; readonly aspect: string; readonly to: string }
  | { readonly kind: 'station'; readonly body: string; readonly direction: 'retrograde' | 'direct' }
  | { readonly kind: 'return'; readonly which: TimelineReturn };

export interface TimingTimelineEvent {
  readonly kind: string;
  readonly startJd: JulianDayUT;
  /** Open-ended if omitted — not used by any adapter here, since every technique adapted so far has a known end. */
  readonly endJd?: JulianDayUT;
  readonly subject: TimelineSubject;
  /** Which module computed this event, for a timeline UI to group/color/filter by technique. */
  readonly sourceModule: string;
  /** For a transit with an orb window (#1401): the exact date inside `startJd`..`endJd`, which are the orb entry and exit. */
  readonly exactJd?: JulianDayUT;
  /** For a transit that passes its point more than once inside one orb window (#1401): this pass's place, 1-based, in date order. */
  readonly pass?: TransitPass;
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

/** The bodies filter of the timeline (#1260): everything, the major planets, or the asteroids, centaurs and Lilith. */
export type TimelineBodyGroup = 'all' | 'major' | 'minor';

/** The keys of the bodies an event names: both ends of an aspect, the body of a station; none for the other kinds. */
export function timelineEventBodies(subject: TimelineSubject): readonly string[] {
  if (subject.kind === 'aspect') return [subject.from, subject.to];
  if (subject.kind === 'station') return [subject.body];
  return [];
}

/**
 * Whether an event shows under a bodies filter. Major planets are the luminaries, planets and lunar nodes; the others
 * (Lilith, centaurs, asteroids) are the minor group, and an angle or any key that is not a body counts with the major
 * ones. An event that names no body (zodiacal releasing, firdaria, profections, returns) is always shown. "Major" shows
 * an event only if none of its bodies is minor; "minor" shows it if any of its bodies is.
 */
export function eventMatchesBodyGroup(event: TimingTimelineEvent, group: TimelineBodyGroup): boolean {
  const bodies = timelineEventBodies(event.subject);
  if (group === 'all' || bodies.length === 0) return true;
  const isMinor = (key: string): boolean => {
    const category = bodyByKey(key)?.category;
    return category === 'lilith' || category === 'centaur' || category === 'asteroid';
  };
  return group === 'minor' ? bodies.some(isMinor) : !bodies.some(isMinor);
}

const bodyKeyOf = (id: number): string => bodyById(id)?.key ?? String(id);

function releasingSubject(
  lot: ReleasingLot,
  level: 1 | 2,
  sign: number,
  ruler: number,
  loosingOfBond: boolean,
): TimelineSubject {
  return {
    kind: 'releasing',
    lot,
    level,
    sign: SIGNS[sign]?.name ?? String(sign),
    ruler: bodyKeyOf(ruler),
    loosingOfBond,
  };
}

/** Zodiacal-releasing (#554) Level-1 periods as timeline events, one per sign period. */
export function releasingPeriodsToTimelineEvents(
  periods: readonly ReleasingPeriod[],
  lot: ReleasingLot,
): readonly TimingTimelineEvent[] {
  return periods.map((period) => ({
    kind: 'zodiacal-releasing',
    startJd: period.startJd,
    endJd: period.endJd,
    subject: releasingSubject(lot, 1, period.sign, period.ruler, false),
    sourceModule: 'astrology/zodiacal-releasing',
  }));
}

/** Level-2 zodiacal-releasing subperiods, labelled apart from the enclosing Level-1 periods. */
export function releasingSubperiodsToTimelineEvents(
  periods: readonly ReleasingSubperiod[],
  lot: ReleasingLot,
): readonly TimingTimelineEvent[] {
  return periods.map((period) => ({
    kind: 'zodiacal-releasing',
    startJd: period.startJd,
    endJd: period.endJd,
    subject: releasingSubject(lot, 2, period.sign, period.ruler, period.loosingOfBond),
    sourceModule: 'astrology/zodiacal-releasing',
  }));
}

/** Firdaria (#554) periods as timeline events, one per ruler period. */
export function firdariaPeriodsToTimelineEvents(periods: readonly FirdariaPeriod[]): readonly TimingTimelineEvent[] {
  return periods.map((period) => ({
    kind: 'firdaria',
    startJd: period.startJd,
    endJd: period.endJd,
    subject: { kind: 'firdaria', ruler: period.ruler },
    sourceModule: 'astrology/firdaria',
  }));
}

const TROPICAL_YEAR_DAYS = 365.2425;

/**
 * One `ProfectionData` snapshot (#168, computed for a single target moment) as the pair of timeline events — year
 * and month — active at that moment, with the bounds `computeProfections` found: birthday to birthday, and equal
 * twelfths of that year (#677).
 */
export function profectionToTimelineEvents(data: ProfectionData): readonly TimingTimelineEvent[] {
  return [
    {
      kind: 'profection-year',
      startJd: data.year.startJd,
      endJd: data.year.endJd,
      subject: { kind: 'profection', sign: data.year.signName, house: data.year.house },
      sourceModule: 'domain/profections',
    },
    {
      kind: 'profection-month',
      startJd: data.month.startJd,
      endJd: data.month.endJd,
      subject: { kind: 'profection', sign: data.month.signName, house: data.month.house },
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
    subject: { kind: 'aspect', from: direction.promissor, aspect: direction.aspect, to: direction.significator },
    sourceModule: 'domain/primary-directions',
  }));
}

function aspectSubject(aspect: Aspect): TimelineSubject {
  return { kind: 'aspect', from: bodyKeyOf(aspect.bodyA), aspect: aspect.aspect.key, to: bodyKeyOf(aspect.bodyB) };
}

function contactsToTimelineEvents(
  kind: string,
  sourceModule: string,
  contacts: readonly Aspect[],
  jd: JulianDayUT,
): readonly TimingTimelineEvent[] {
  return contacts.map((contact) => ({ kind, startJd: jd, endJd: jd, subject: aspectSubject(contact), sourceModule }));
}

/** Secondary-progression contacts as a dated snapshot at the selected target moment. */
export function secondaryProgressionToTimelineEvents(
  data: SecondaryProgressionData,
  targetJd: JulianDayUT,
): readonly TimingTimelineEvent[] {
  return contactsToTimelineEvents('secondary-progression', 'domain/secondary-progression', data.contacts, targetJd);
}

/**
 * Solar-arc contacts as the span they are active (#673): from coming within 1° of exact to passing 1° beyond it
 * (`SOLAR_ARC_ACTIVE_ORB_DEG`), the way primary directions show their active window. A contact with no exact date
 * inside the search window is left out.
 */
export function solarArcToTimelineEvents(data: SolarArcDirectionsData): readonly TimingTimelineEvent[] {
  return data.contacts.flatMap((contact) =>
    contact.exactJd === undefined
      ? []
      : [
          {
            kind: 'solar-arc',
            startJd: contact.activeFromJd ?? contact.exactJd,
            endJd: contact.activeUntilJd ?? contact.exactJd,
            subject: aspectSubject(contact),
            sourceModule: 'domain/solar-arc-directions',
          },
        ],
  );
}

/** Transit contacts as a dated snapshot at the selected target moment. */
export function transitToTimelineEvents(data: TransitData, targetJd: JulianDayUT): readonly TimingTimelineEvent[] {
  return contactsToTimelineEvents('transit', 'domain/transit', data.contacts, targetJd);
}

/**
 * An exact transit as an event. With its orb window (#1401) the event spans orb entry to orb exit, carries the exact date
 * and, when the body passes the point more than once in that window, the pass number; without one it is a point.
 */
function exactTransitEvents(
  events: readonly TransitAspectEvent[],
  windows: ReadonlyMap<TransitAspectEvent, TransitOrbWindowInfo>,
): readonly TimingTimelineEvent[] {
  return events.map((event) => {
    const info = windows.get(event);
    return {
      kind: 'periodic-transit',
      startJd: info?.window.entryJd ?? event.jd,
      endJd: info?.window.exitJd ?? event.jd,
      subject: {
        kind: 'aspect',
        from: bodyKeyOf(event.transitingBody),
        aspect: event.aspect.key,
        to: bodyKeyOf(event.natalBody),
      },
      sourceModule: 'domain/periodic-transit',
      ...(info === undefined ? {} : { exactJd: event.jd }),
      ...(info === undefined || info.pass.count < 2 ? {} : { pass: info.pass }),
    };
  });
}

function stationEvents(events: readonly StationEvent[]): readonly TimingTimelineEvent[] {
  return events.map((event) => ({
    kind: 'periodic-transit',
    startJd: event.jd,
    endJd: event.jd,
    subject: { kind: 'station', body: bodyKeyOf(event.body), direction: event.direction },
    sourceModule: 'domain/periodic-transit',
  }));
}

function returnEvent(jd: JulianDayUT, which: TimelineReturn): TimingTimelineEvent {
  return {
    kind: 'return',
    startJd: jd,
    endJd: jd,
    subject: { kind: 'return', which },
    sourceModule: 'domain/periodic-transit',
  };
}

/**
 * Exact transit and station events from the daily, weekly, and monthly forecast tiers. `windows` (from
 * `computeTransitOrbWindows`, #1401) gives each exact transit its orb entry, exit and pass number.
 */
export function periodicTransitToTimelineEvents(
  data: PeriodicTransitForecast,
  windows: ReadonlyMap<TransitAspectEvent, TransitOrbWindowInfo> = new Map(),
): readonly TimingTimelineEvent[] {
  return [
    returnEvent(data.yearly.solarReturn.returnJd, 'solar-return'),
    returnEvent(data.yearly.demibirthday.demibirthdayJd, 'demibirthday'),
    returnEvent(data.monthly.progressedLunarReturn.returnJd, 'progressed-lunar-return'),
    ...data.weekly.lunarReturns.returns.map((entry) => returnEvent(entry.returnJd, 'lunar-return')),
    ...exactTransitEvents(
      uniqueExactTransits([data.daily.exactToday, data.weekly.events, data.monthly.events]),
      windows,
    ),
    ...stationEvents(data.daily.stationsToday),
  ];
}

/**
 * The exact transits across the forecast tiers, each once (owner decision, #1442): the weekly and monthly lists repeat
 * the daily exacts, so an exact transit is identified by its transiting body, natal body, aspect and exact minute, and the
 * first tier to list it keeps it.
 */
export function uniqueExactTransits(tiers: readonly (readonly TransitAspectEvent[])[]): readonly TransitAspectEvent[] {
  const seen = new Set<string>();
  const out: TransitAspectEvent[] = [];
  for (const event of tiers.flat()) {
    const key = `${String(event.transitingBody)}|${String(event.natalBody)}|${event.aspect.key}|${String(Math.round(event.jd * 1440))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}
