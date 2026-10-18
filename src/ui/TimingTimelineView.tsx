/**
 * @module TimingTimelineView
 * @purpose Renders a shared date-axis timeline for the app's timing techniques.
 * @conventions Keeps each calculation in its domain module and displays normalized TimingTimelineEvent records only; all visible labels use the co-located message catalogue.
 * @exports TimingTimelineTracks, TimingTimelineView
 */
import { useEffect, useMemo, useState } from 'react';
import { firdariaPeriods } from '../astrology/firdaria.js';
import { zodiacalReleasingPeriods, zodiacalReleasingSubperiods } from '../astrology/zodiacal-releasing.js';
import { computeChartData } from '../domain/chart-compute.js';
import { computeProfections } from '../domain/profections.js';
import { generatePrimaryDirections } from '../domain/primary-directions.js';
import { computeSecondaryProgression } from '../domain/secondary-progression.js';
import { computeSolarArcDirections } from '../domain/solar-arc-directions.js';
import { computeTransit } from '../domain/transit.js';
import { computePeriodicTransitForecast } from '../domain/periodic-transit.js';
import {
  firdariaPeriodsToTimelineEvents,
  periodicTransitToTimelineEvents,
  primaryDirectionsToTimelineEvents,
  profectionToTimelineEvents,
  releasingPeriodsToTimelineEvents,
  releasingSubperiodsToTimelineEvents,
  secondaryProgressionToTimelineEvents,
  solarArcToTimelineEvents,
  timingTimelineTracks,
  transitToTimelineEvents,
  type TimelineSubject,
  type TimingTimelineEvent,
  type TimingTimelineTrackEvents,
} from '../domain/timing-timeline.js';
import { julianDayFor, civilFromJulianDay } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import { DateField } from './primitives/DateField.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { PersonNotFound } from './PersonNotFound.js';
import { personHref } from './route.js';
import { useStoreState } from './store-context.js';
import { todayInputValue } from './format.js';
import { useMessages } from './messages.js';
import { timingTimelineViewMessages } from './TimingTimelineView.messages.js';
import { timelineSubjectLabel } from './timing-timeline-labels.js';
import { useLocale } from './locale.js';
import { BackLink } from './BackLink.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly events: readonly TimingTimelineEvent[]; readonly centreJd: number }
  | { readonly kind: 'error'; readonly message: string };

const WINDOW_DAYS = 365.2425 * 5;

function dateLabel(jd: number): string {
  const date = civilFromJulianDay(jd);
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export interface TimingTimelineTracksProps {
  readonly axisLabel: string;
  readonly tracks: readonly TimingTimelineTrackEvents[];
  readonly labels: Readonly<Record<TimingTimelineTrackEvents['track'], string>>;
  readonly noEvents: string;
  readonly dateLabel: (jd: number) => string;
  /** An event's subject in words, in the reader's language (`timelineSubjectLabel`, #674). */
  readonly describe: (subject: TimelineSubject) => string;
  /** A start and end date as one range, in the reader's language. */
  readonly range: (start: string, end: string) => string;
  /** A note under a track's heading, such as the convention it follows (#677). */
  readonly notes?: Partial<Record<string, string>>;
}

/** The render-only shared-axis track list, separated so concurrent-technique output is testable without an ephemeris worker. */
export function TimingTimelineTracks({
  axisLabel,
  tracks,
  labels,
  noEvents,
  dateLabel: formatDate,
  describe,
  range,
  notes = {},
}: TimingTimelineTracksProps): React.JSX.Element {
  return (
    <section aria-label={axisLabel}>
      <p>
        <strong>{axisLabel}</strong>
      </p>
      {tracks.map(({ track, events }) => (
        <section key={track} className="timing-timeline-track" aria-labelledby={`${track}-heading`}>
          <h2 id={`${track}-heading`}>{labels[track]}</h2>
          {notes[track] !== undefined && <p className="hint">{notes[track]}</p>}
          {events.length === 0 ? (
            <p className="hint">{noEvents}</p>
          ) : (
            <ol>
              {events.map((event, index) => (
                <li key={`${event.kind}-${String(event.startJd)}-${String(index)}`}>
                  <strong>{describe(event.subject)}</strong> —{' '}
                  {event.endJd === undefined || event.endJd === event.startJd
                    ? formatDate(event.startJd)
                    : range(formatDate(event.startJd), formatDate(event.endJd))}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </section>
  );
}

export function TimingTimelineView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const { provider } = useEphemerisProvider();
  const t = useMessages(timingTimelineViewMessages);
  const [locale] = useLocale();
  const [asOf, setAsOf] = useState(todayInputValue);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const target = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year === undefined || month === undefined || day === undefined ? undefined : { year, month, day };
  }, [asOf]);

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined || target === undefined) return undefined;
    const effect = { cancelled: false };
    const moment = person.moment;
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const targetJd = await provider.julianDayFromUtc(target.year, target.month, target.day, 12, 0, 0);
        const natalJd = await julianDayFor(provider, resolveMoment(moment));
        const [natal, profections, directions, progressions, solarArc, transit, forecast] = await Promise.all([
          computeChartData(moment, provider),
          computeProfections(moment, targetJd, provider),
          generatePrimaryDirections(moment, provider),
          computeSecondaryProgression(moment, targetJd, provider),
          computeSolarArcDirections(moment, targetJd, provider),
          computeTransit(moment, targetJd, provider),
          computePeriodicTransitForecast(
            moment,
            { dayJd: targetJd, monthFromJd: targetJd - 15, monthToJd: targetJd + 15, year: target.year },
            provider,
          ),
        ]);
        const releasing = zodiacalReleasingPeriods(natal.partOfFortune, natalJd, 18);
        const events = [
          ...releasingPeriodsToTimelineEvents(releasing),
          ...releasingSubperiodsToTimelineEvents(releasing.flatMap(zodiacalReleasingSubperiods)),
          ...firdariaPeriodsToTimelineEvents(firdariaPeriods(natal.sect, natalJd, 18)),
          ...profectionToTimelineEvents(profections),
          ...primaryDirectionsToTimelineEvents(directions.hits),
          ...secondaryProgressionToTimelineEvents(progressions, targetJd),
          ...solarArcToTimelineEvents(solarArc),
          ...transitToTimelineEvents(transit, targetJd),
          ...periodicTransitToTimelineEvents(forecast),
        ];
        if (!effect.cancelled) setLoad({ kind: 'ready', events, centreJd: targetJd });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [asOf, person?.moment, provider, target]);

  if (person === undefined) return <PersonNotFound />;
  if (person.moment === undefined) {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <h1>{t.fallback}</h1>
        <p>
          {t.notComplete(person.displayName || t.fallback)} <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const fromJd = load.kind === 'ready' ? load.centreJd - WINDOW_DAYS : 0;
  const toJd = load.kind === 'ready' ? load.centreJd + WINDOW_DAYS : 0;
  const tracks = load.kind === 'ready' ? timingTimelineTracks(load.events, fromJd, toJd) : [];

  return (
    <main className="shell shell--wide">
      <BackLink fallback={personHref(personId)} />
      <h1>{person.displayName ? t.heading(person.displayName) : t.fallback}</h1>
      <p className="hint">{t.hint}</p>
      <p className="hint">{t.source}</p>
      <DateField label={t.asOfLabel} value={asOf} onChange={setAsOf} />
      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}
      {load.kind === 'ready' && (
        <TimingTimelineTracks
          axisLabel={t.axis(dateLabel(fromJd), dateLabel(toJd))}
          tracks={tracks}
          labels={t.tracks}
          noEvents={t.noEvents}
          dateLabel={dateLabel}
          describe={(subject) => timelineSubjectLabel(subject, locale)}
          range={t.range}
          notes={t.trackNotes}
        />
      )}
    </main>
  );
}
