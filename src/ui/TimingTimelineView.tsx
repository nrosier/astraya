/**
 * @module TimingTimelineView
 * @purpose Renders the timing techniques on one shared date axis: a Gantt chart of every track over a 5 or 10 year range either side of the centre date, the same events in a searchable table, and the technique filter in a popover on the table's toolbar (#1237, #1442).
 * @conventions Keeps each calculation in its domain module and displays normalized TimingTimelineEvent records only; all visible labels use the co-located message catalogue.
 * @exports TimingTimelineView
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { firdariaPeriods } from '../astrology/firdaria.js';
import { zodiacalReleasingPeriods, zodiacalReleasingSubperiods } from '../astrology/zodiacal-releasing.js';
import { computeChartData } from '../domain/chart-compute.js';
import { computeProfections } from '../domain/profections.js';
import { generatePrimaryDirections } from '../domain/primary-directions.js';
import { computeSecondaryProgression } from '../domain/secondary-progression.js';
import { computeSolarArcDirections } from '../domain/solar-arc-directions.js';
import { computeTransit } from '../domain/transit.js';
import { computePeriodicTransitForecast } from '../domain/periodic-transit.js';
import { computeTransitOrbWindows } from '../domain/transit-orb-windows.js';
import {
  firdariaPeriodsToTimelineEvents,
  periodicTransitToTimelineEvents,
  primaryDirectionsToTimelineEvents,
  profectionToTimelineEvents,
  releasingPeriodsToTimelineEvents,
  releasingSubperiodsToTimelineEvents,
  secondaryProgressionToTimelineEvents,
  eventMatchesBodyGroup,
  solarArcToTimelineEvents,
  TIMING_TIMELINE_TRACKS,
  timingTimelineTracks,
  type TimelineBodyGroup,
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
import { ganttRows, techniqueColorVar } from './timeline-gantt.js';
import { useExclusiveOpen } from './use-exclusive-open.js';
import { Badge } from './primitives/Badge.js';
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
import { orbsOf, toChartCalculationOptions } from '../chart/extended-settings.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly events: readonly TimingTimelineEvent[]; readonly centreJd: number }
  | { readonly kind: 'error'; readonly message: string };

const YEAR_DAYS = 365.2425;
/** The ranges the header offers: years either side of the centre date (#1237). */
const BODY_GROUPS = ['all', 'major', 'minor'] as const satisfies readonly TimelineBodyGroup[];

/** The one popover on the table toolbar: which techniques are shown. */
const TECHNIQUES_KEY = 'techniques';

const RANGES = ['5', '10'] as const;
type Range = (typeof RANGES)[number];

interface EventRow {
  readonly key: string;
  readonly track: string;
  readonly trackKey: TimingTimelineTrack;
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
  // The timeline is calculated with the person's own settings (#1492), except primary directions, which are always
  // tropical and Placidus (noted on screen). No technique here takes a ruler choice, so the line leaves the rulers off.
  const {
    settings: personSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const basisLine = useCalculationBasisLine(personSettings, rulership, undefined, { rulers: false });
  const [asOf, setAsOf] = useState(todayInputValue);
  const [range, setRange] = useState<Range>('5');
  const [query, setQuery] = useState('');
  const [bodyGroup, setBodyGroup] = useState<TimelineBodyGroup>('all');
  const [hidden, setHidden] = useState<ReadonlySet<TimingTimelineTrack>>(new Set());
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // One event shared by the chart and the table (#1442): the one under the pointer or focus, and the one chosen.
  const [hoveredKey, setHoveredKey] = useState<string>();
  const [selectedKey, setSelectedKey] = useState<string>();
  const techniques = useExclusiveOpen<typeof TECHNIQUES_KEY>('timeline');
  const techniquesOpen = techniques.open === TECHNIQUES_KEY;
  const techniquesId = useId();
  const chartRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);
  // Where the selection came from: a bar brings its row into view, a row brings its bar.
  const selectionFrom = useRef<'chart' | 'table'>('chart');
  const target = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year === undefined || month === undefined || day === undefined ? undefined : { year, month, day };
  }, [asOf]);

  useEffect(() => {
    // An unreadable register means no timeline at all, never one from placeholder settings (#806).
    if (person?.moment === undefined || provider === undefined || target === undefined || settingsUnreadable)
      return undefined;
    const effect = { cancelled: false };
    const moment = person.moment;
    const options = toChartCalculationOptions(personSettings);
    const { houseSystem, zodiac } = personSettings;
    const { orbConfig } = orbsOf(personSettings);
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const targetJd = await provider.julianDayFromUtc(target.year, target.month, target.day, 12, 0, 0);
        const natalJd = await julianDayFor(provider, resolveMoment(moment));
        const [natal, profections, directions, progressions, solarArc, transit, forecast] = await Promise.all([
          computeChartData(moment, provider, fixedStars === undefined ? options : { ...options, fixedStars }),
          computeProfections(moment, targetJd, provider, { houseSystem, zodiac }),
          // Always tropical and Placidus by design (src/domain/primary-directions.ts:28-30), whatever the person's settings.
          generatePrimaryDirections(moment, provider),
          computeSecondaryProgression(moment, targetJd, provider, { houseSystem, zodiac, orbConfig }),
          computeSolarArcDirections(moment, targetJd, provider, { houseSystem, zodiac, orbConfig }),
          computeTransit(moment, targetJd, provider, options),
          computePeriodicTransitForecast(
            moment,
            { dayJd: targetJd, monthFromJd: targetJd - 15, monthToJd: targetJd + 15, year: target.year },
            provider,
            options,
          ),
        ]);
        // Each exact transit's orb entry, exit and pass number (#1401), across the tiers (the weekly tier's events repeat in the monthly one).
        const windows = await computeTransitOrbWindows(
          provider,
          [...forecast.daily.exactToday, ...forecast.weekly.events, ...forecast.monthly.events],
          { zodiac, orbConfig },
        );
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
          ...periodicTransitToTimelineEvents(forecast, windows),
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
  }, [asOf, person?.moment, fixedStars, provider, target, personSettings, settingsUnreadable]);

  const halfWindow = YEAR_DAYS * Number(range);
  const fromJd = load.kind === 'ready' ? load.centreJd - halfWindow : 0;
  const toJd = load.kind === 'ready' ? load.centreJd + halfWindow : 0;
  // The tracks in the window, minus those the technique filter hides: the chart and the table both read this.
  const tracks = useMemo(
    () =>
      load.kind === 'ready'
        ? timingTimelineTracks(load.events, fromJd, toJd)
            .filter(({ track }) => !hidden.has(track))
            .map(({ track, events }) => ({
              track,
              events: events.filter((event) => eventMatchesBodyGroup(event, bodyGroup)),
            }))
        : [],
    [load, fromJd, toJd, hidden, bodyGroup],
  );
  const describeEvent = (event: TimingTimelineEvent): string => {
    const name = timelineSubjectLabel(event.subject, locale);
    const pass = event.pass === undefined ? '' : ` (${t.passOf(event.pass.number, event.pass.count)})`;
    if (event.exactJd !== undefined && event.endJd !== undefined)
      return `${name}${pass}: ${t.orbWindow(dateLabel(event.startJd), dateLabel(event.exactJd), dateLabel(event.endJd))}`;
    return `${name}: ${
      event.endJd === undefined || event.endJd === event.startJd
        ? dateLabel(event.startJd)
        : t.range(dateLabel(event.startJd), dateLabel(event.endJd))
    }`;
  };
  const rows = useMemo<readonly EventRow[]>(() => {
    const needle = query.trim().toLowerCase();
    const all = tracks.flatMap(({ track, events }) =>
      events.map((event, index) => {
        const end = event.endJd === undefined || event.endJd === event.startJd ? undefined : event.endJd;
        return {
          key: `${track}-${event.kind}-${String(event.startJd)}-${String(index)}`,
          track: t.tracks[track],
          trackKey: track,
          event:
            timelineSubjectLabel(event.subject, locale) +
            (event.pass === undefined ? '' : ` (${t.passOf(event.pass.number, event.pass.count)})`),
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
    {
      key: 'track',
      label: t.columnTrack,
      valueOf: (row) => row.track,
      // The badge's text is the technique name; its dot is the colour the chart's bars use (#1442).
      renderCell: (row) => (
        <span className="technique-cell" style={{ '--tech': techniqueColorVar(row.trackKey) } as React.CSSProperties}>
          <Badge>{row.track}</Badge>
        </span>
      ),
    },
    { key: 'event', label: t.columnEvent, valueOf: (row) => row.event },
    { key: 'start', label: t.columnStart, valueOf: (row) => row.startJd, render: (row) => row.start, align: 'start' },
    { key: 'end', label: t.columnEnd, valueOf: (row) => row.end },
  ];
  // A new result or filter can drop the selected or hovered event.
  useEffect(() => {
    const present = new Set(rows.map((row) => row.key));
    setSelectedKey((key) => (key !== undefined && present.has(key) ? key : undefined));
    setHoveredKey((key) => (key !== undefined && present.has(key) ? key : undefined));
  }, [rows]);
  // Selecting brings the other side's element into view: `nearest`, so nothing moves when it is already visible. The whole
  // date range is always drawn, so a row's bar is inside the axis; only the page may need to scroll to it.
  useEffect(() => {
    if (selectedKey === undefined) return;
    const from = selectionFrom.current;
    const root = from === 'chart' ? tableRef.current : chartRef.current;
    const attribute = from === 'chart' ? 'data-row-key' : 'data-mark-key';
    const target = Array.from(root?.querySelectorAll(`[${attribute}]`) ?? []).find(
      (candidate) => candidate.getAttribute(attribute) === selectedKey,
    );
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [selectedKey]);
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
  if (settingsUnreadable) return <UnreadableSettingsNotice name={person.displayName || ''} />;
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
            <section className="timing-card" ref={chartRef}>
              <TimingTimelineGantt
                rows={ganttRows(tracks, fromJd, toJd)}
                fromJd={fromJd}
                toJd={toJd}
                targetJd={load.centreJd}
                label={t.axis(dateLabel(fromJd), dateLabel(toJd))}
                trackLabels={t.tracks}
                rowLabel={t.rowLabel}
                describe={describeEvent}
                barLabel={(event) => timelineSubjectLabel(event.subject, locale)}
                passLabel={t.passShort}
                bandLabel={t.bandLabel}
                targetTitle={t.targetLine(dateLabel(load.centreJd))}
                hoveredKey={hoveredKey}
                selectedKey={selectedKey}
                onHover={setHoveredKey}
                onSelect={(key) => {
                  selectionFrom.current = 'chart';
                  setSelectedKey(key);
                }}
              />
              <p className="hint">{t.targetLine(dateLabel(load.centreJd))}</p>
            </section>

            {/* The event table on the left, the technique filter on the right (#1237, the shared timing layout). */}
            <div className="timing-layout timing-layout--full">
              <div className="timing-layout-main">
                <section className="timing-card" ref={tableRef}>
                  <div className="timing-toolbar">
                    <TextField label={t.searchLabel} value={query} onChange={setQuery} />
                    <ChoiceGroup
                      label={t.bodiesLabel}
                      value={bodyGroup}
                      segmented
                      showLabel
                      options={BODY_GROUPS.map((group) => ({ value: group, label: t.bodyGroups[group] }))}
                      onChange={(value) => {
                        setBodyGroup(value === 'major' || value === 'minor' ? value : 'all');
                      }}
                    />
                    <div
                      className="timing-popover-anchor"
                      ref={techniques.groupRef(TECHNIQUES_KEY)}
                      onBlur={(event) => {
                        techniques.onGroupBlur(TECHNIQUES_KEY, event);
                      }}
                    >
                      <Button
                        ref={techniques.buttonRef(TECHNIQUES_KEY)}
                        aria-haspopup="true"
                        aria-expanded={techniquesOpen}
                        aria-controls={techniquesOpen ? techniquesId : undefined}
                        onClick={() => {
                          techniques.toggle(TECHNIQUES_KEY);
                        }}
                      >
                        {t.techniquesButton(TIMING_TIMELINE_TRACKS.length - hidden.size)}
                      </Button>
                      {techniquesOpen && (
                        <div id={techniquesId} className="timing-popover" role="group" aria-label={t.filterLegend}>
                          <div className="timing-technique-filter">
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
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="hint">{t.bodiesNote}</p>
                  {rows.length === 0 ? (
                    <p className="hint">{query.trim() === '' ? t.noEvents : t.noMatches}</p>
                  ) : (
                    <SortableTable
                      caption={t.tableCaption}
                      headingLevel={2}
                      columns={columns}
                      rows={rows}
                      getRowKey={(row) => row.key}
                      selectedRowKey={selectedKey}
                      linking={{
                        hoveredKey,
                        onHover: setHoveredKey,
                        onSelect: (key) => {
                          selectionFrom.current = 'table';
                          setSelectedKey(key);
                        },
                        tint: (row) => techniqueColorVar(row.trackKey),
                      }}
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
            </div>
          </>
        )}
      </div>
    </main>
  );
}
