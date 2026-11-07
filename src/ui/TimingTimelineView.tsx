/**
 * @module TimingTimelineView
 * @purpose Renders the timing techniques on one shared date axis: a Gantt chart of every track over a 5 or 10 year range either side of the centre date, the same events in a searchable table, and the technique filter beside it (#1237).
 * @conventions Keeps each calculation in its domain module and displays normalized TimingTimelineEvent records only; all visible labels use the co-located message catalogue.
 * @exports TimingTimelineView
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
  TIMING_TIMELINE_TRACKS,
  timingTimelineTracks,
  type TimingTimelineTrack,
  transitToTimelineEvents,
  type TimingTimelineEvent,
} from '../domain/timing-timeline.js';
import { julianDayFor, civilFromJulianDay } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import { DateField } from './primitives/DateField.js';
import { Button } from './primitives/Button.js';
import { Checkbox } from './primitives/Checkbox.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { TextField } from './primitives/TextField.js';
import { Tooltip } from './primitives/Tooltip.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { TimingTimelineGantt } from './TimingTimelineGantt.js';
import { ganttRows } from './timeline-gantt.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { PersonNotFound } from './PersonNotFound.js';
import { personHref } from './route.js';
import { useStoreState } from './store-context.js';
import { useStableBy } from './use-stable-moment.js';
import { todayInputValue } from './format.js';
import { useMessages } from './messages.js';
import { timingTimelineViewMessages } from './TimingTimelineView.messages.js';
import { timelineSubjectLabel } from './timing-timeline-labels.js';
import { useLocale } from './locale.js';
import { PageHeader } from './PageHeader.js';
import { useCalculationBasisLine } from './calculation-basis.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly events: readonly TimingTimelineEvent[]; readonly centreJd: number }
  | { readonly kind: 'error'; readonly message: string };

const YEAR_DAYS = 365.2425;
/** The ranges the header offers: years either side of the centre date (#1237). */
const RANGES = ['5', '10'] as const;
type Range = (typeof RANGES)[number];

interface EventRow {
  readonly key: string;
  readonly track: string;
  readonly event: string;
  readonly start: string;
  readonly end: string;
  readonly startJd: number;
}

function dateLabel(jd: number): string {
  const date = civilFromJulianDay(jd);
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function TimingTimelineView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  // The person's chosen fixed stars (#860), as the natal chart reads them.
  const fixedStars = useStableBy(person?.fixedStars, (stars) => JSON.stringify(stars ?? []));
  const { provider } = useEphemerisProvider();
  const t = useMessages(timingTimelineViewMessages);
  const [locale] = useLocale();
  // Every technique on the timeline is calculated with the engine defaults and no ruler choice, so the line states those.
  // The Preferences link is left off: no preference changes this timeline.
  const basisLine = useCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE, undefined, {
    rulers: false,
  });
  const [asOf, setAsOf] = useState(todayInputValue);
  const [range, setRange] = useState<Range>('5');
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<ReadonlySet<TimingTimelineTrack>>(new Set());
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
          computeChartData(moment, provider, fixedStars === undefined ? {} : { fixedStars }),
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
        // Released from both lots (#680): Fortune for the body and life, Spirit for action and career.
        const fromFortune = zodiacalReleasingPeriods(natal.partOfFortune, natalJd, 18);
        const fromSpirit = zodiacalReleasingPeriods(natal.partOfSpirit, natalJd, 18);
        const events = [
          ...releasingPeriodsToTimelineEvents(fromFortune, 'fortune'),
          ...releasingSubperiodsToTimelineEvents(fromFortune.flatMap(zodiacalReleasingSubperiods), 'fortune'),
          ...releasingPeriodsToTimelineEvents(fromSpirit, 'spirit'),
          ...releasingSubperiodsToTimelineEvents(fromSpirit.flatMap(zodiacalReleasingSubperiods), 'spirit'),
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
  }, [asOf, person?.moment, fixedStars, provider, target]);

  const halfWindow = YEAR_DAYS * Number(range);
  const fromJd = load.kind === 'ready' ? load.centreJd - halfWindow : 0;
  const toJd = load.kind === 'ready' ? load.centreJd + halfWindow : 0;
  // The tracks in the window, minus those the technique filter hides: the chart and the table both read this.
  const tracks = useMemo(
    () =>
      load.kind === 'ready'
        ? timingTimelineTracks(load.events, fromJd, toJd).filter(({ track }) => !hidden.has(track))
        : [],
    [load, fromJd, toJd, hidden],
  );
  const rows = useMemo<readonly EventRow[]>(() => {
    const needle = query.trim().toLowerCase();
    const all = tracks.flatMap(({ track, events }) =>
      events.map((event, index) => {
        const end = event.endJd === undefined || event.endJd === event.startJd ? undefined : event.endJd;
        return {
          key: `${track}-${event.kind}-${String(event.startJd)}-${String(index)}`,
          track: t.tracks[track],
          event: timelineSubjectLabel(event.subject, locale),
          start: dateLabel(event.startJd),
          end: end === undefined ? '' : dateLabel(end),
          startJd: event.startJd,
        };
      }),
    );
    return needle === ''
      ? all
      : all.filter((row) => `${row.track} ${row.event} ${row.start} ${row.end}`.toLowerCase().includes(needle));
  }, [tracks, query, t, locale]);
  const columns: readonly TableColumn<EventRow>[] = [
    { key: 'track', label: t.columnTrack, valueOf: (row) => row.track },
    { key: 'event', label: t.columnEvent, valueOf: (row) => row.event },
    { key: 'start', label: t.columnStart, valueOf: (row) => row.startJd, render: (row) => row.start },
    { key: 'end', label: t.columnEnd, valueOf: (row) => row.end },
  ];
  useCsvExports(
    person === undefined || load.kind !== 'ready'
      ? undefined
      : [
          csvExportTable(
            'events',
            t.tableCaption,
            deriveExportFilename(person.displayName, 'timing-timeline', 'csv'),
            columns,
            rows,
          ),
        ],
  );

  if (person === undefined) return <PersonNotFound />;
  if (person.moment === undefined) {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.fallback} />
        <p>
          {t.notComplete(person.displayName || t.fallback)} <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="shell shell--wide">
      <PageHeader
        headingLevel={2}
        title={person.displayName ? t.heading(person.displayName) : t.fallback}
        titleAside={
          <Tooltip text={`${t.hint} ${t.source}`} label={t.hintInfoLabel} className="primitive-tooltip-icon">
            ?
          </Tooltip>
        }
        basis={basisLine}
        basisEditHref={null}
      >
        {/* The centre date, the range either side of it, Now and Export sit in the heading row, to the right (owner review 2026-11-07). */}
        <DateField label={t.asOfLabel} value={asOf} onChange={setAsOf} />
        <ChoiceGroup
          label={t.rangeLabel}
          value={range}
          segmented
          showLabel
          options={RANGES.map((years) => ({ value: years, label: t.rangeYears(years) }))}
          onChange={(value) => {
            setRange(value === '10' ? '10' : '5');
          }}
        />
        <Button
          onClick={() => {
            setAsOf(todayInputValue());
          }}
        >
          {t.nowLabel}
        </Button>
      </PageHeader>
      {/* The result region: busy while the timeline (re)calculates, as the Astrocartography map is. */}
      <div className="timing-stack" aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
        {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}
        {load.kind === 'ready' && (
          <>
            <section className="timing-card">
              <TimingTimelineGantt
                rows={ganttRows(tracks, fromJd, toJd)}
                fromJd={fromJd}
                toJd={toJd}
                targetJd={load.centreJd}
                label={t.axis(dateLabel(fromJd), dateLabel(toJd))}
                trackLabels={t.tracks}
                rowLabel={t.rowLabel}
                describe={(event) =>
                  `${timelineSubjectLabel(event.subject, locale)}: ${
                    event.endJd === undefined || event.endJd === event.startJd
                      ? dateLabel(event.startJd)
                      : t.range(dateLabel(event.startJd), dateLabel(event.endJd))
                  }`
                }
                targetTitle={t.targetLine(dateLabel(load.centreJd))}
              />
              <p className="hint">{t.targetLine(dateLabel(load.centreJd))}</p>
            </section>

            {/* The event table on the left, the technique filter on the right (#1237, the shared timing layout). */}
            <div className="timing-layout">
              <div className="timing-layout-main">
                <section className="timing-card">
                  <TextField label={t.searchLabel} value={query} onChange={setQuery} />
                  {rows.length === 0 ? (
                    <p className="hint">{query.trim() === '' ? t.noEvents : t.noMatches}</p>
                  ) : (
                    <SortableTable
                      caption={t.tableCaption}
                      headingLevel={2}
                      columns={columns}
                      rows={rows}
                      getRowKey={(row) => row.key}
                      downloadFilename={deriveExportFilename(person.displayName, 'timing-timeline', 'csv')}
                    />
                  )}
                </section>
                {tracks.some(({ track }) => t.trackNotes[track] !== undefined) && (
                  <ul className="hint">
                    {tracks.map(({ track }) =>
                      t.trackNotes[track] === undefined ? null : (
                        <li key={track}>
                          <strong>{t.tracks[track]}:</strong> {t.trackNotes[track]}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
              <div className="timing-layout-side">
                <section className="timing-card" aria-labelledby="timeline-techniques-heading">
                  <h2 id="timeline-techniques-heading">{t.filterLegend}</h2>
                  <div role="group" aria-labelledby="timeline-techniques-heading" className="timing-technique-filter">
                    {TIMING_TIMELINE_TRACKS.map((track) => (
                      <Checkbox
                        key={track}
                        label={t.tracks[track]}
                        checked={!hidden.has(track)}
                        onChange={(checked) => {
                          setHidden((current) => {
                            const next = new Set(current);
                            if (checked) next.delete(track);
                            else next.add(track);
                            return next;
                          });
                        }}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
