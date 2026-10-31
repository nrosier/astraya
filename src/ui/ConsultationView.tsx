/**
 * The consultation dashboard (#563): one person, right now, built for a live session rather than as a general chart
 * screen. Since #800 it reads as key-metric tiles on top (the big three, chart ruler, sect and the profection year),
 * then two balanced columns, about 60/40: transits and chart highlights on the left, time lords, zodiacal releasing
 * and directions on the right. Major transits are a data table with state badges; the transits to the Ascendant and to
 * the Midheaven each sit in their own disclosure (D-800a). No tabs: an astrologer reads transits against timing
 * against the chart, and tabs would hide two of the three.
 *
 * This screen computes nothing new. Each section reuses an existing pipeline, windowed to "now":
 * - Transits: `useTransitFilter`/`filterTransits`/`rankTransits` with the yearly rule set (#672), today's fast
 *   contacts on one line (`fastTriggers`), transits to the angles apart and unscored (#678), and each shown contact's
 *   exact passes (`exactPassDates`), of which the table shows the next one still ahead (an em dash when none, D-800b).
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
 * @purpose Consultation dashboard (#563, #669, #800): key-metric tiles, then a 60/40 grid of transit tables and chart highlights beside time lords, zodiacal releasing and directions, for one person at the moment the page opened.
 * @conventions Read-only aggregation of other screens' pipelines and the shared chart overview (#691); no new calculation. Sections are `<section aria-labelledby>` in a container-query grid (single column below 48rem); one Disclosure per angle for the secondary transits; overflow goes in the Disclosure primitive. Copy in ConsultationView.messages.ts; shared terms from chartViewMessages, timingTimelineViewMessages, transitFilterPanelMessages and chartOverviewMessages.
 * @exports ConsultationView
 */
import { useEffect, useMemo, useState } from 'react';
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
import { besiegementRescueList } from './besiegement-rescue-label.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { EVERY_BODY_KEY, useTransitFilter } from './TransitFilterPanel.js';
import { transitFilterPanelMessages } from './TransitFilterPanel.messages.js';
import { timingTimelineViewMessages } from './TimingTimelineView.messages.js';
import { timelineSubjectLabel } from './timing-timeline-labels.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { PersonNotFound } from './PersonNotFound.js';
import { hrefFor } from './feature-registry.js';
import { chartHref, personHref } from './route.js';
import { ConsultationNotesCard } from './ConsultationNotesCard.js';
import { houseSystemLabel } from './ChartView.js';
import { matchOrbProfile } from '../astrology/orb-profiles.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { useStoreState } from './store-context.js';
import { useStableBy } from './use-stable-moment.js';
import { formatOrb, formatTimestamp } from './format.js';
import { angleTransits, exactPassDates, type AngleKey, type AngleTransit } from '../domain/angle-transits.js';
import { chartOverviewRows } from './chart-overview-rows.js';
import { chartOverviewMessages } from './chart-overview.messages.js';
import { ordinal } from './placement-label.js';
import { PageHeader } from './PageHeader.js';
import { Disclosure } from './primitives/Disclosure.js';
import { Badge } from './primitives/Badge.js';
import { ConsultationTransitTable, type TransitTableLabels, type TransitTableRow } from './ConsultationTransitTable.js';
import { angleGroups, nextExactJd } from './consultation-transit-rows.js';
import { Button } from './primitives/Button.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
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
  // The person's chosen fixed stars (#860), as the natal chart reads them.
  const fixedStars = useStableBy(person?.fixedStars, (stars) => JSON.stringify(stars ?? []));
  const { provider } = useEphemerisProvider();
  const t = useMessages(consultationViewMessages);
  const transitFilterT = useMessages(transitFilterPanelMessages);
  const timingT = useMessages(timingTimelineViewMessages);
  const chartT = useMessages(chartViewMessages);
  const rulershipT = useMessages(rulershipSettingMessages);
  const orbNames = useMessages(extendedSettingsPanelMessages);
  const [locale] = useLocale();
  const {
    settings: personSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // The session's moment (#676): when the page opened, or when Now was last pressed. Not noon UT, where the Moon can be 6° off.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // An unreadable register means no chart-dependent content at all, never one from placeholder settings (#806).
    if (person?.moment === undefined || provider === undefined || settingsUnreadable) return undefined;
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
          computeChartData(moment, provider, {
            rulership,
            ...(fixedStars === undefined ? {} : { fixedStars }),
          }),
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
  }, [person?.moment, fixedStars, provider, now, rulership, settingsUnreadable]);

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

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  // The title is the feature; the person is the subject, named in the muted basis line (#800 decision, 2026-10-30).
  const subject = person.displayName || t.fallback;
  if (person.moment === undefined) {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={t.heading} />
        <p>
          {t.notComplete(subject)} <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const zodiac = personSettings.zodiac;
  const zodiacLabel = zodiac.kind === 'sidereal' ? t.sidereal : t.tropical;
  // The calculation basis as the person's own settings resolve it: the house system, and the named orb profile
  // (Custom when the orbs are edited or match no profile).
  const houseLabel = houseSystemLabel(personSettings.houseSystem);
  const orbProfile =
    personSettings.orbRules === undefined ? matchOrbProfile(personSettings.orbScalePercent) : undefined;
  // The day the wheel opens on (#800): the day of the page's own "As of" moment, so Refresh moves it too.
  const selectedDay = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const signName = (sign: number): string => signDisplayName(SIGNS[sign]?.name ?? '', locale);
  const body = (key: string): string => bodyDisplayName(key, locale);
  const aspect = (key: string): string => aspectDisplayName(key, locale).toLowerCase();
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
            ...(row.besieged
              ? [
                  row.besiegementRescuedBy === undefined
                    ? t.besiegedCondition
                    : t.besiegedEasedCondition(besiegementRescueList(row.besiegementRescuedBy, locale)),
                ]
              : []),
          ];
          return notes.length === 0 ? [] : [t.conditionLine(body(row.bodyKey), notes.join(t.conditionSeparator))];
        })
      : [];
  const retrogradeAtBirth =
    load.kind === 'ready'
      ? load.conditions.filter((row) => row.motion === 'retrograde').map((row) => body(row.bodyKey))
      : [];

  const overviewT = chartOverviewMessages[locale];
  // The key-metric tiles (#800): the big three, chart ruler, sect and the profection, in that order.
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
                  value: t.profectionTile(
                    signName(load.year.profection.sign),
                    ordinal(load.year.profection.house, locale),
                    load.year.profection.lords.map(body).join(t.rulerSeparator),
                  ),
                },
              ]),
        ]
      : [];

  const tableLabels: TransitTableLabels = {
    aspect: t.colAspect,
    orb: t.colOrb,
    state: chartT.applyingLabel,
    nextExact: t.colNextExact,
    noPass: t.noFurtherPass,
  };
  const nextExactLabel = (jds: readonly number[] | undefined): string | undefined => {
    const next = load.kind === 'ready' ? nextExactJd(jds, load.todayJd) : undefined;
    return next === undefined ? undefined : dateLabel(next);
  };
  const stateLabel = (applying: boolean): string => (applying ? chartT.applying : chartT.separating);
  const majorRows: readonly TransitTableRow[] = shownContactRows.map((row) => {
    const key = contactKey({ transitingKey: row.bodyAKey, aspectKey: row.aspectKey, target: row.bodyBKey });
    return {
      key,
      aspect: t.transitAspect(body(row.bodyAKey), aspect(row.aspectKey), body(row.bodyBKey)),
      orb: formatOrb(row.orb),
      state: stateLabel(row.applying),
      applying: row.applying,
      nextExact: nextExactLabel(exactDates.get(key)),
    };
  });
  const angleRows = (contacts: readonly AngleTransit[]): readonly TransitTableRow[] =>
    contacts.map((contact) => ({
      key: `${contact.transitingKey}-${contact.aspectKey}-${contact.angle}`,
      aspect: t.transitAspect(body(contact.transitingKey), aspect(contact.aspectKey), body(contact.angle)),
      orb: formatOrb(contact.orb),
      state: stateLabel(contact.applying),
      applying: contact.applying,
      nextExact: nextExactLabel(contact.exactJds),
    }));
  const angleTitle = (angle: AngleKey): string => (angle === 'asc' ? t.ascTransitsTitle : t.mcTransitsTitle);
  const angleEmpty = (angle: AngleKey): string => (angle === 'asc' ? t.noAscTransits : t.noMcTransits);

  // A date pair as pills (#800): a span shows Start and End, a single day just the one.
  const datePills = (event: TimingTimelineEvent): React.JSX.Element =>
    event.endJd === undefined || event.endJd === event.startJd ? (
      <span className="consultation-pills">
        <Badge>
          <span className="consultation-date">{t.datePill(dateLabel(event.startJd))}</span>
        </Badge>
      </span>
    ) : (
      <span className="consultation-pills">
        <Badge>
          <span className="consultation-date">{t.startPill(dateLabel(event.startJd))}</span>
        </Badge>
        <Badge>
          <span className="consultation-date">{t.endPill(dateLabel(event.endJd))}</span>
        </Badge>
      </span>
    );
  const directionList = (events: readonly TimingTimelineEvent[]): React.JSX.Element => (
    <ul className="consultation-directions">
      {events.map((event, index) => (
        <li key={`${event.kind}-${String(event.startJd)}-${String(index)}`}>
          <span>{timelineSubjectLabel(event.subject, locale)}</span>
          {datePills(event)}
        </li>
      ))}
    </ul>
  );
  const releasingBadges = [...releasingLevel1, ...releasingLevel2].flatMap((event) =>
    event.subject.kind === 'releasing'
      ? [
          {
            key: `${event.subject.lot}-${String(event.subject.level)}-${event.subject.sign}`,
            text: t.releasingBadge(
              event.subject.level,
              `${timingT.lots[event.subject.lot]} ${signDisplayName(event.subject.sign, locale)}`,
            ),
          },
        ]
      : [],
  );

  return (
    <main className="shell consultation">
      <BackLink fallback={personHref(personId)} />
      <PageHeader
        title={t.heading}
        basis={t.basisLine(
          subject,
          zodiacLabel,
          houseLabel,
          t.rulersBasis(rulershipT.titles[rulership]),
          t.orbsBasis(orbNames.orbProfileOptions[orbProfile ?? 'custom']),
        )}
      >
        <span className="consultation-date-field">
          <span>{t.asOf(formatTimestamp(now))}</span>{' '}
          <Button
            size="compact"
            onClick={() => {
              setNow(new Date());
            }}
          >
            {t.refreshNow}
          </Button>
        </span>
        <a className="primitive-button-primary" href={chartHref(personId, 'wheel', 'natal', undefined, selectedDay)}>
          {t.viewWheel}
        </a>
        <p className="actions">
          <a href={hrefFor('report', { personId })}>{t.openInterpretation}</a>{' '}
          <a href={hrefFor('export-builder', {})}>{t.buildPdf}</a>
        </p>
      </PageHeader>

      {/* The result region: busy while the consultation (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
        {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

        {load.kind === 'ready' && (
          <div className="consultation-layout">
            <section className="consultation-glance" aria-labelledby="consultation-glance-heading">
              <h2 id="consultation-glance-heading">{overviewT.heading}</h2>
              <dl className="consultation-tiles">
                {glanceRows.map((row) => (
                  <div key={row.term}>
                    <dt>{row.term}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="consultation-grid">
              <div className="consultation-col">
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
                  {majorRows.length === 0 ? (
                    <p className="hint">{t.noShownTransits}</p>
                  ) : (
                    <ConsultationTransitTable caption={t.majorTransitsHeading} labels={tableLabels} rows={majorRows} />
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
                  {/* One Disclosure per angle (D-800a), in time order and unscored: no weight is invented for an angle (#678). */}
                  {load.angles === undefined ? (
                    <p className="hint">{t.anglesNeedBirthTime}</p>
                  ) : (
                    angleGroups(load.angles).map((group) => (
                      <Disclosure
                        key={group.angle}
                        title={angleTitle(group.angle)}
                        summary={t.groupCount(group.contacts.length)}
                        showLabel={t.show}
                        hideLabel={t.hide}
                      >
                        {group.contacts.length === 0 ? (
                          <p className="hint">{angleEmpty(group.angle)}</p>
                        ) : (
                          <ConsultationTransitTable
                            caption={angleTitle(group.angle)}
                            labels={tableLabels}
                            rows={angleRows(group.contacts)}
                          />
                        )}
                        <p>
                          <a href={hrefFor('transit', { personId })}>{t.openTransitsLink}</a>
                        </p>
                      </Disclosure>
                    ))
                  )}
                  <p className="hint">
                    <a href={hrefFor('transit', { personId })}>{t.openTransitsLink}</a>
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

              <div className="consultation-col">
                <section className="consultation-section" aria-labelledby="consultation-year-heading">
                  <h2 id="consultation-year-heading">{t.timeLordsHeading}</h2>
                  <ul className="consultation-lords">
                    {load.year.profection !== undefined && (
                      <li>
                        <span className="consultation-lord-key">{t.profectionYear}</span>
                        <span className="consultation-lord-value">
                          {t.placeValue(
                            signName(load.year.profection.sign),
                            ordinal(load.year.profection.house, locale),
                          )}
                        </span>
                        <span className="consultation-lord-meta consultation-date">
                          {t.endsOn(dateLabel(load.year.profection.endJd))}
                        </span>
                      </li>
                    )}
                    {load.year.firdaria !== undefined && (
                      <li>
                        <span className="consultation-lord-key">{t.firdaria}</span>
                        <span className="consultation-lord-value">
                          {timelineSubjectLabel({ kind: 'firdaria', ruler: load.year.firdaria.ruler }, locale)}
                        </span>
                        <span className="consultation-lord-meta consultation-date">
                          {t.endsOn(dateLabel(load.year.firdaria.endJd))}
                        </span>
                      </li>
                    )}
                    <li>
                      <span className="consultation-lord-key">{t.progressedMoon}</span>
                      <span className="consultation-lord-value">
                        {t.placeValue(
                          signName(load.year.progressedMoon.sign),
                          load.year.progressedMoon.house === undefined
                            ? undefined
                            : ordinal(load.year.progressedMoon.house, locale),
                        )}
                      </span>
                      <Badge tone="soft">{chartT.lunarPhaseLabels[load.year.progressedMoon.phase]}</Badge>
                    </li>
                    <li>
                      <span className="consultation-lord-key">{t.solarReturns}</span>
                      <span className="consultation-lord-value">
                        {t.solarReturnsValue(
                          dateLabel(load.year.solarReturns.current),
                          dateLabel(load.year.solarReturns.next),
                        )}
                      </span>
                    </li>
                  </ul>
                  <p>
                    <a href={hrefFor('progressions', { personId })}>{t.openProgressions}</a>
                  </p>
                  {monthProfection.length > 0 && (
                    <Disclosure
                      title={t.moreTiming}
                      summary={t.moreTimingSummary}
                      showLabel={t.show}
                      hideLabel={t.hide}
                    >
                      {eventList(monthProfection)}
                      <p className="hint">{timingT.trackNotes.profections}</p>
                    </Disclosure>
                  )}
                </section>

                <section className="consultation-section" aria-labelledby="consultation-releasing-heading">
                  <h2 id="consultation-releasing-heading">{t.releasingDirectionsHeading}</h2>
                  {releasingBadges.length === 0 ? (
                    <p className="hint">{timingT.noEvents}</p>
                  ) : (
                    <div className="consultation-pills" role="group" aria-label={t.activeReleasing}>
                      {releasingBadges.map((badge) => (
                        <Badge key={badge.key} tone="accent">
                          {badge.text}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <h3>{t.directionsHeading}</h3>
                  {directions.length === 0 ? (
                    <p className="hint">{t.noDirections}</p>
                  ) : (
                    <>
                      {directionList(directions.slice(0, SHOWN_DIRECTION_COUNT))}
                      {directions.length > SHOWN_DIRECTION_COUNT && (
                        <Disclosure
                          title={t.moreDirections(directions.length - SHOWN_DIRECTION_COUNT)}
                          showLabel={t.show}
                          hideLabel={t.hide}
                        >
                          {directionList(directions.slice(SHOWN_DIRECTION_COUNT))}
                        </Disclosure>
                      )}
                    </>
                  )}
                  <p>
                    <a href={hrefFor('primary-directions', { personId })}>{t.openDirections}</a>{' '}
                    <a href={hrefFor('timing-timeline', { personId })}>{t.openTimingTimeline}</a>
                  </p>
                </section>

                <ConsultationNotesCard />
              </div>
            </div>
          </div>
        )}
      </div>
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
