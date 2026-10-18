/**
 * The consultation dashboard (#563): one person, right now, built for a live session rather than as a general chart
 * screen. Since #669 it reads summary first: an at-a-glance block (the big three, chart ruler and sect from the shared
 * chart overview, #691, plus the profection year, firdaria and the top transit), then grouped sections laid out two
 * to a row on a wide screen: This year, Major transits now, Directions, and Chart highlights. Detail that a session
 * rarely needs first (zodiacal releasing level 2, the month profection, the chart shape, natal retrogrades, primary
 * directions beyond the first three) sits behind a disclosure. No tabs: an astrologer reads transits against timing
 * against the chart, and tabs would hide two of the three.
 *
 * This screen computes nothing new. Each section reuses an existing pipeline, windowed to "now":
 * - Transits: `useTransitFilter`/`filterTransits`/`rankTransits` with the yearly rule set (#672), today's fast
 *   contacts on one line (`fastTriggers`), transits to the angles apart and unscored (#678), and each shown contact's
 *   exact passes (`exactPassDates`).
 * - Timing: the `*ToTimelineEvents` adapters, windowed `now..now`; only the period and discrete-hit tracks, since
 *   the transit and progression tracks stamp every contact at the target date.
 * - The year: `consultationYear` (profection and lord, firdaria, progressed Moon, solar returns).
 * - Highlights: a literal slice of `dignityRows`/`conditionRows`/`chartShapeOf`, not a new score.
 *
 * No settings surface and no date picker beyond Now: each section links to its canonical screen, per the guidelines'
 * "one canonical home per feature".
 */
/**
 * @module ui/ConsultationView
 * @purpose Consultation dashboard (#563, #669): an at-a-glance summary, then This year, Major transits now, Directions and Chart highlights for one person at the moment the page opened.
 * @conventions Read-only aggregation of other screens' pipelines and the shared chart overview (#691); no new calculation. Sections are `<section aria-labelledby>` in a container-query grid; overflow goes in the Disclosure primitive. Copy in ConsultationView.messages.ts; shared terms from chartViewMessages, timingTimelineViewMessages, transitFilterPanelMessages and chartOverviewMessages.
 * @exports ConsultationView
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { firdariaPeriods } from '../astrology/firdaria.js';
import { zodiacalReleasingPeriods, zodiacalReleasingSubperiods } from '../astrology/zodiacal-releasing.js';
import { computeChartData, housesAreDefined } from '../domain/chart-compute.js';
import { computeProfections } from '../domain/profections.js';
import { generatePrimaryDirections } from '../domain/primary-directions.js';
import { computeSolarArcDirections } from '../domain/solar-arc-directions.js';
import { computeTransit, type TransitData } from '../domain/transit.js';
import {
  firdariaPeriodsToTimelineEvents,
  primaryDirectionsToTimelineEvents,
  profectionToTimelineEvents,
  releasingPeriodsToTimelineEvents,
  releasingSubperiodsToTimelineEvents,
  solarArcToTimelineEvents,
  timingTimelineTracks,
  type TimingTimelineEvent,
} from '../domain/timing-timeline.js';
import { chartOverview, type ChartOverview } from '../domain/chart-overview.js';
import { consultationYear, type ConsultationYear } from '../domain/consultation-year.js';
import { SIGNS } from '../astrology/signs.js';
import { bodyById } from '../astrology/bodies.js';
import {
  chartShapeOf,
  conditionRows,
  crossAspectRows,
  dignityRows,
  type ConditionRow,
  type DignityRow,
} from '../domain/chart-tables.js';
import {
  chartRulerKeysOf,
  fastTriggers,
  filterTransits,
  presetOf,
  rankTransits,
  type TransitRuleContext,
} from '../astrology/transit-importance.js';
import { civilFromJulianDay, julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { EVERY_BODY_KEY, useTransitFilter } from './TransitFilterPanel.js';
import { transitFilterPanelMessages } from './TransitFilterPanel.messages.js';
import { timingTimelineViewMessages } from './TimingTimelineView.messages.js';
import { timelineSubjectLabel } from './timing-timeline-labels.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { PersonNotFound } from './PersonNotFound.js';
import { hrefFor } from './feature-registry.js';
import { personHref } from './route.js';
import { useRulershipChoice } from './rulership-setting.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { useStoreState } from './store-context.js';
import { formatOrb, formatTimestamp } from './format.js';
import { angleTransits, exactPassDates, type AngleTransit } from '../domain/angle-transits.js';
import { chartOverviewRows } from './chart-overview-rows.js';
import { chartOverviewMessages } from './chart-overview.messages.js';
import { ordinal } from './placement-label.js';
import { PageHeader } from './PageHeader.js';
import { Disclosure } from './primitives/Disclosure.js';
import { Button } from './primitives/Button.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';
import { FilterSummary } from './primitives/FilterSummary.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { consultationViewMessages } from './ConsultationView.messages.js';
import { BackLink } from './BackLink.js';
import type { JulianDayUT } from '../ephemeris/types.js';

type Load =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly transit: TransitData;
      readonly events: readonly TimingTimelineEvent[];
      readonly todayJd: number;
      readonly dignities: readonly DignityRow[];
      readonly conditions: readonly ConditionRow[];
      readonly shape: ReturnType<typeof chartShapeOf>;
      /** Slow transits to the natal Ascendant and MC (#678); undefined without a known birth time. */
      readonly angles: readonly AngleTransit[] | undefined;
      readonly overview: ChartOverview;
      readonly year: ConsultationYear;
    }
  | { readonly kind: 'error'; readonly message: string };

/** The top handful of ranked transit contacts, most important first — this screen only ever shows a glance. */
const SHOWN_TRANSIT_COUNT = 5;
/** Today's fast contacts, on one line under the year's transits (#672). */
const SHOWN_FAST_COUNT = 3;

/** Directions shown before the rest go behind a disclosure (#669). */
const SHOWN_DIRECTION_COUNT = 3;

/** Same formatting as `TimingTimelineView.tsx`'s own (unexported) `dateLabel`, for a track's start/end dates. */
function dateLabel(jd: number): string {
  const date = civilFromJulianDay(jd);
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function ConsultationView({ personId }: { readonly personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const { provider } = useEphemerisProvider();
  const t = useMessages(consultationViewMessages);
  const transitFilterT = useMessages(transitFilterPanelMessages);
  const timingT = useMessages(timingTimelineViewMessages);
  const chartT = useMessages(chartViewMessages);
  const rulershipT = useMessages(rulershipSettingMessages);
  const [locale] = useLocale();
  const [rulership] = useRulershipChoice();
  const [defaultProfile] = useDefaultCalculationProfile();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // The session's moment (#676): when the page opened, or when Now was last pressed. Not noon UT, where the Moon can be 6° off.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined) return undefined;
    const effect = { cancelled: false };
    const moment = person.moment;
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const todayJd = await provider.julianDayFromUtc(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          now.getUTCDate(),
          now.getUTCHours(),
          now.getUTCMinutes(),
          now.getUTCSeconds(),
        );
        const natalJd = await julianDayFor(provider, resolveMoment(moment));
        // Only the techniques that feed a `GLANCE_TRACKS` track are computed here —
        // secondary progression and the periodic-transit forecast would only be filtered back
        // out at render time (see this module's own doc comment), so skipping them keeps this
        // "glance" screen's load lighter than `TimingTimelineView`'s own full computation.
        const [natal, profections, directions, solarArc, transit] = await Promise.all([
          // The reader's rulership (#679), so a "ruler" highlight follows the setting the basis line names.
          computeChartData(moment, provider, { rulership }),
          computeProfections(moment, todayJd, provider),
          generatePrimaryDirections(moment, provider),
          computeSolarArcDirections(moment, todayJd, provider),
          computeTransit(moment, todayJd, provider),
        ]);
        // The angles are never among the ranked contacts (#678), so they are found and listed apart.
        const angles = housesAreDefined(natal.houses)
          ? await angleTransits(transit.transit.positions, natal.houses, todayJd, provider)
          : undefined;
        const year = await consultationYear(moment, natal, natalJd, todayJd, provider, rulership);
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
          ...solarArcToTimelineEvents(solarArc),
        ];
        if (!effect.cancelled) {
          setLoad({
            kind: 'ready',
            transit,
            events,
            todayJd,
            dignities: dignityRows(natal),
            conditions: conditionRows(natal),
            shape: chartShapeOf(natal),
            angles,
            overview: chartOverview(natal, rulership),
            year,
          });
        }
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [person?.moment, provider, now, rulership]);

  const natalHouses = load.kind === 'ready' ? load.transit.natal.houses : undefined;
  const rules = useMemo<TransitRuleContext>(
    () => ({
      everyBodyKey: EVERY_BODY_KEY,
      context: 'yearly',
      chartRulerKeys:
        natalHouses !== undefined && housesAreDefined(natalHouses)
          ? chartRulerKeysOf(natalHouses.ascendant, rulership)
          : undefined,
    }),
    [natalHouses, rulership],
  );
  const [filter] = useTransitFilter(rules);
  const filteredContacts = useMemo(
    () =>
      load.kind === 'ready'
        ? rankTransits(filterTransits(load.transit.contacts, filter), filter, rules.chartRulerKeys)
        : [],
    [load, filter, rules],
  );
  const shownContactRows = useMemo(
    () => crossAspectRows(filteredContacts.slice(0, SHOWN_TRANSIT_COUNT)),
    [filteredContacts],
  );
  const fastRows = useMemo(
    () => (load.kind === 'ready' ? crossAspectRows(fastTriggers(load.transit.contacts, rules, SHOWN_FAST_COUNT)) : []),
    [load, rules],
  );

  // Each shown transit's exact passes (#669), found once the ranked list is known.
  const [exactDates, setExactDates] = useState<ReadonlyMap<string, readonly JulianDayUT[]>>(new Map());
  useEffect(() => {
    if (load.kind !== 'ready' || provider === undefined || shownContactRows.length === 0) return undefined;
    let cancelled = false;
    const natalLongitudes = new Map(
      load.transit.natal.positions.map((position) => [bodyKeyOf(position.body), position.longitude] as const),
    );
    const queries = shownContactRows.map((row) => ({
      transitingKey: row.bodyAKey,
      aspectKey: row.aspectKey,
      target: row.bodyBKey,
    }));
    void exactPassDates(provider, natalLongitudes, queries, load.todayJd).then(
      (dates) => {
        if (!cancelled) setExactDates(new Map(queries.map((query, index) => [contactKey(query), dates[index] ?? []])));
      },
      () => {
        // Without exact dates the rows still show orb and motion.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, provider, shownContactRows]);

  if (person === undefined) return <PersonNotFound />;

  const title = person.displayName ? t.heading(person.displayName) : t.fallback;
  if (person.moment === undefined) {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={title} />
        <p>
          {t.notComplete(person.displayName || t.fallback)} <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const zodiac = defaultProfile?.settings.zodiac ?? DEFAULT_EXTENDED_SETTINGS.zodiac;
  const zodiacLabel = zodiac.kind === 'sidereal' ? t.sidereal : t.tropical;
  const signName = (sign: number): string => signDisplayName(SIGNS[sign]?.name ?? '', locale);
  const body = (key: string): string => bodyDisplayName(key, locale);
  const aspect = (key: string): string => aspectDisplayName(key, locale).toLowerCase();
  const motion = (applying: boolean): string =>
    applying ? chartT.applying.toLowerCase() : chartT.separating.toLowerCase();
  // Each date kept whole on one line: a wrap at its hyphens would split it (#669).
  const exactDatesNode = (dates: readonly JulianDayUT[] | undefined): React.ReactNode =>
    dates === undefined || dates.length === 0 ? (
      t.noExactDate
    ) : (
      <>
        {t.exactPrefix}{' '}
        {dates.map((jd, index) => (
          <Fragment key={jd}>
            {index > 0 && t.listSeparator}
            <time className="consultation-date" dateTime={dateLabel(jd)}>
              {dateLabel(jd)}
            </time>
          </Fragment>
        ))}
      </>
    );

  const trackEvents = (track: string): readonly TimingTimelineEvent[] =>
    load.kind === 'ready'
      ? (timingTimelineTracks(load.events, load.todayJd, load.todayJd).find((entry) => entry.track === track)?.events ??
        [])
      : [];
  const releasing = trackEvents('zodiacal-releasing');
  const releasingLevel1 = releasing.filter((event) => event.subject.kind === 'releasing' && event.subject.level === 1);
  const releasingLevel2 = releasing.filter((event) => event.subject.kind === 'releasing' && event.subject.level === 2);
  const monthProfection = trackEvents('profections').filter((event) => event.kind === 'profection-month');
  const directions = [...trackEvents('solar-arc'), ...trackEvents('primary-directions')];
  const eventLine = (event: TimingTimelineEvent): string =>
    `${timelineSubjectLabel(event.subject, locale)} — ${
      event.endJd === undefined || event.endJd === event.startJd
        ? dateLabel(event.startJd)
        : timingT.range(dateLabel(event.startJd), dateLabel(event.endJd))
    }`;
  const eventList = (events: readonly TimingTimelineEvent[]): React.JSX.Element => (
    <ul>
      {events.map((event, index) => (
        <li key={`${event.kind}-${String(event.startJd)}-${String(index)}`}>{eventLine(event)}</li>
      ))}
    </ul>
  );

  // Literal, deterministic highlights: every entry is a `true` field already on `dignityRows`/`conditionRows`.
  const dignityHighlights =
    load.kind === 'ready'
      ? load.dignities
          .filter((row) => row.ruler || row.exalted)
          .map((row) => t.dignityNote(body(row.bodyKey), row.ruler ? t.rulerDignity : t.exaltedDignity))
      : [];
  // One line per body (#669): "Mars: combust, besieged".
  const conditionHighlights =
    load.kind === 'ready'
      ? load.conditions.flatMap((row) => {
          const notes = [
            ...(row.solarCondition === 'cazimi' ? [t.cazimiCondition] : []),
            ...(row.solarCondition === 'combust' ? [t.combustCondition] : []),
            ...(row.besieged ? [t.besiegedCondition] : []),
          ];
          return notes.length === 0 ? [] : [t.conditionLine(body(row.bodyKey), notes.join(t.conditionSeparator))];
        })
      : [];
  const retrogradeAtBirth =
    load.kind === 'ready'
      ? load.conditions.filter((row) => row.motion === 'retrograde').map((row) => body(row.bodyKey))
      : [];

  const overviewT = chartOverviewMessages[locale];
  const glanceRows: readonly { readonly term: string; readonly value: string }[] =
    load.kind === 'ready'
      ? [
          ...chartOverviewRows(load.overview, locale).filter((row) =>
            [overviewT.sun, overviewT.moon, overviewT.ascendant, overviewT.chartRuler, overviewT.sect].includes(
              row.term,
            ),
          ),
          ...(load.year.profection === undefined
            ? []
            : [
                {
                  term: t.profectionYear,
                  value: t.profectionValue(
                    signName(load.year.profection.sign),
                    ordinal(load.year.profection.house, locale),
                    load.year.profection.lords.map(body).join(t.rulerSeparator),
                    dateLabel(load.year.profection.endJd),
                  ),
                },
              ]),
          ...(load.year.firdaria === undefined
            ? []
            : [
                {
                  term: t.firdaria,
                  value: t.firdariaValue(
                    timelineSubjectLabel({ kind: 'firdaria', ruler: load.year.firdaria.ruler }, locale),
                    dateLabel(load.year.firdaria.endJd),
                  ),
                },
              ]),
          ...shownContactRows.slice(0, 1).map((row) => ({
            term: t.topTransit,
            value: `${body(row.bodyAKey)} ${aspect(row.aspectKey)} ${body(row.bodyBKey)}`,
          })),
        ]
      : [];

  return (
    <main className="shell consultation">
      <BackLink fallback={personHref(personId)} />
      <PageHeader title={title} basis={t.basisLine(zodiacLabel, rulershipT.options[rulership])}>
        <p className="consultation-moment">
          {t.asOf(formatTimestamp(now))}{' '}
          <Button
            size="compact"
            onClick={() => {
              setNow(new Date());
            }}
          >
            {t.refreshNow}
          </Button>
        </p>
        <p className="actions">
          <a href={hrefFor('report', { personId })}>{t.openInterpretation}</a>{' '}
          <a href={hrefFor('export-builder', {})}>{t.buildPdf}</a>
        </p>
      </PageHeader>

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

      {load.kind === 'ready' && (
        <div className="consultation-layout">
          <section className="consultation-glance" aria-labelledby="consultation-glance-heading">
            <h2 id="consultation-glance-heading">{overviewT.heading}</h2>
            <dl>
              {glanceRows.map((row) => (
                <Fragment key={row.term}>
                  <dt>{row.term}</dt>
                  <dd>{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          </section>

          <div className="consultation-grid">
            <section className="consultation-section" aria-labelledby="consultation-year-heading">
              <h2 id="consultation-year-heading">{t.thisYearHeading}</h2>
              <dl>
                {load.year.profection !== undefined && (
                  <>
                    <dt>{t.profectionYear}</dt>
                    <dd>
                      {t.profectionValue(
                        signName(load.year.profection.sign),
                        ordinal(load.year.profection.house, locale),
                        load.year.profection.lords.map(body).join(t.rulerSeparator),
                        dateLabel(load.year.profection.endJd),
                      )}
                    </dd>
                  </>
                )}
                {load.year.firdaria !== undefined && (
                  <>
                    <dt>{t.firdaria}</dt>
                    <dd>
                      {t.firdariaValue(
                        timelineSubjectLabel({ kind: 'firdaria', ruler: load.year.firdaria.ruler }, locale),
                        dateLabel(load.year.firdaria.endJd),
                      )}
                    </dd>
                  </>
                )}
                <dt>{t.progressedMoon}</dt>
                <dd>
                  {t.progressedMoonValue(
                    signName(load.year.progressedMoon.sign),
                    load.year.progressedMoon.house === undefined
                      ? undefined
                      : ordinal(load.year.progressedMoon.house, locale),
                    chartT.lunarPhaseLabels[load.year.progressedMoon.phase],
                  )}
                </dd>
                <dt>{t.solarReturns}</dt>
                <dd>
                  {t.solarReturnsValue(
                    dateLabel(load.year.solarReturns.current),
                    dateLabel(load.year.solarReturns.next),
                  )}
                </dd>
              </dl>
              <h3>{timingT.tracks['zodiacal-releasing']}</h3>
              {releasingLevel1.length === 0 ? <p className="hint">{timingT.noEvents}</p> : eventList(releasingLevel1)}
              {(releasingLevel2.length > 0 || monthProfection.length > 0) && (
                <Disclosure title={t.moreTiming} summary={t.moreTimingSummary} showLabel={t.show} hideLabel={t.hide}>
                  {eventList([...releasingLevel2, ...monthProfection])}
                  <p className="hint">{timingT.trackNotes.profections}</p>
                </Disclosure>
              )}
              <p>
                <a href={hrefFor('timing-timeline', { personId })}>{t.openTimingTimeline}</a>
              </p>
            </section>

            <section className="consultation-section" aria-labelledby="consultation-transits-heading">
              <h2 id="consultation-transits-heading">{t.majorTransitsHeading}</h2>
              <FilterSummary
                summary={transitFilterT.count(
                  filteredContacts.length,
                  load.transit.contacts.length,
                  transitFilterT.presetsShort[presetOf(filter, rules) ?? 'custom'],
                )}
              />
              {/* The weights and orbs have no published source (transit-importance.ts, #590), so say so (#681). */}
              <p className="hint">{t.rankingConvention}</p>
              {shownContactRows.length === 0 ? (
                <p className="hint">{t.noShownTransits}</p>
              ) : (
                <ul>
                  {shownContactRows.map((row) => (
                    <li
                      key={contactKey({ transitingKey: row.bodyAKey, aspectKey: row.aspectKey, target: row.bodyBKey })}
                    >
                      {t.transitRow(
                        body(row.bodyAKey),
                        aspect(row.aspectKey),
                        body(row.bodyBKey),
                        formatOrb(row.orb),
                        motion(row.applying),
                      )}{' '}
                      ·{' '}
                      {exactDatesNode(
                        exactDates.get(
                          contactKey({ transitingKey: row.bodyAKey, aspectKey: row.aspectKey, target: row.bodyBKey }),
                        ),
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                {fastRows.length === 0
                  ? t.noFastToday
                  : t.fastToday(
                      fastRows
                        .map((row) => `${body(row.bodyAKey)} ${aspect(row.aspectKey)} ${body(row.bodyBKey)}`)
                        .join(t.listSeparator),
                    )}
              </p>
              <h3>{t.anglesHeading}</h3>
              {load.angles === undefined ? (
                <p className="hint">{t.anglesNeedBirthTime}</p>
              ) : load.angles.length === 0 ? (
                <p className="hint">{t.noAngleTransits}</p>
              ) : (
                // In time order, unscored: no weight is invented for an angle (#678).
                <ul>
                  {load.angles.map((contact) => (
                    <li key={`${contact.transitingKey}-${contact.aspectKey}-${contact.angle}`}>
                      {t.angleTransit(
                        body(contact.transitingKey),
                        aspect(contact.aspectKey),
                        body(contact.angle),
                        formatOrb(contact.orb),
                        motion(contact.applying),
                      )}{' '}
                      · {exactDatesNode(contact.exactJds)}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                <a href={hrefFor('transit', { personId })}>{t.viewAllTransits}</a>
              </p>
            </section>

            <section className="consultation-section" aria-labelledby="consultation-directions-heading">
              <h2 id="consultation-directions-heading">{t.directionsHeading}</h2>
              {directions.length === 0 ? (
                <p className="hint">{t.noDirections}</p>
              ) : (
                <>
                  {eventList(directions.slice(0, SHOWN_DIRECTION_COUNT))}
                  {directions.length > SHOWN_DIRECTION_COUNT && (
                    <Disclosure
                      title={t.moreDirections(directions.length - SHOWN_DIRECTION_COUNT)}
                      showLabel={t.show}
                      hideLabel={t.hide}
                    >
                      {eventList(directions.slice(SHOWN_DIRECTION_COUNT))}
                    </Disclosure>
                  )}
                </>
              )}
              <p>
                <a href={hrefFor('timing-timeline', { personId })}>{t.openTimingTimeline}</a>
              </p>
            </section>

            <section className="consultation-section" aria-labelledby="consultation-highlights-heading">
              <h2 id="consultation-highlights-heading">{t.highlightsHeading}</h2>
              {dignityHighlights.length === 0 && conditionHighlights.length === 0 && (
                <p className="hint">{t.noNotableConditions}</p>
              )}
              {/* Each list says which rules it follows (#679): dignities the reader's rulership, conditions the traditional seven. */}
              {dignityHighlights.length > 0 && (
                <>
                  <p className="hint">{t.dignityCaption(rulershipT.options[rulership])}</p>
                  <ul>
                    {dignityHighlights.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
              {conditionHighlights.length > 0 && (
                <>
                  <p className="hint">{t.conditionCaption}</p>
                  <ul>
                    {conditionHighlights.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
              <Disclosure title={t.moreChart} summary={t.moreChartSummary} showLabel={t.show} hideLabel={t.hide}>
                <p>
                  {t.chartShape}:{' '}
                  {load.shape === undefined ? t.shapeCannotBeWorkedOut : chartT.jonesShapeLabels[load.shape.shape]}
                </p>
                {retrogradeAtBirth.length > 0 && (
                  <p>{t.retrogradeAtBirth(retrogradeAtBirth.join(t.conditionSeparator))}</p>
                )}
              </Disclosure>
              <p>
                <a href={hrefFor('chart', { personId })}>{t.openPatternsAndCondition}</a>
              </p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

const bodyKeyOf = (id: number): string => bodyById(id)?.key ?? String(id);

/** A transit's identity: transiting body, aspect and natal point. */
function contactKey(query: {
  readonly transitingKey: string;
  readonly aspectKey: string;
  readonly target: string;
}): string {
  return `${query.transitingKey}-${query.aspectKey}-${query.target}`;
}
