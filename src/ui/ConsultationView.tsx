/**
 * The consultation dashboard (#563, part of #536/#540's audit epic): a single at-a-glance view
 * of current transits, active timing techniques, and chart highlights for one person, for right
 * now — built for a live session, not a general-purpose chart screen.
 *
 * This screen computes nothing new. Each section reuses an existing, already-reviewed pipeline,
 * just windowed to "today" instead of a chosen date or a multi-year span:
 * - Transits: the exact `useTransitFilter`/`filterTransits`/`rankTransits` pipeline, with the
 *   yearly rule set (#672): a consultation reads the year's chapters, so the slow planets lead, and
 *   the remembered filter preset is the Forecast screen's. Today's fast contacts (the daily rules,
 *   Sun to Mars transiting) follow on one line of their own (`fastTriggers`).
 * - Timing techniques: the same `Promise.all` of per-technique computations and
 *   `*ToTimelineEvents` adapters `TimingTimelineView.tsx` runs, rendered with that same module's
 *   exported `TimingTimelineTracks`, but `timingTimelineTracks(events, todayJd, todayJd)` instead
 *   of a 5-year window — "what is active today," not a history. Only the period/discrete-hit
 *   tracks are shown here (zodiacal releasing, firdaria, profections, primary directions, solar
 *   arc): `transitToTimelineEvents`/`secondaryProgressionToTimelineEvents` stamp every current
 *   contact at the target date rather than filtering to the exact/significant ones, so at a
 *   single-day window those two tracks (and periodic-transit) dump the full, unranked contact
 *   list — the opposite of a glance. Transits already have their own ranked, filtered section
 *   above; secondary progression and the periodic-transit forecast have no equivalent ranking
 *   yet, so they stay on their own full screens rather than flooding this one.
 * - Chart highlights: a literal, deterministic slice of `chart-tables.ts`'s existing
 *   `dignityRows`/`conditionRows`/`chartShapeOf` — the same rows `ChartView.tsx`'s Patterns &
 *   condition view shows in full — not a new notability score.
 *
 * Deliberately has no settings surface and no date picker: every section is read-only with one
 * "open full view" link to its canonical screen (Transits, Timing timeline, Chart). Adding a
 * second settings surface or date control here would compete with those screens' own, which is
 * exactly what `docs/UI-UX_GUIDELINES.md`'s "one canonical home per feature" rule forbids.
 */
/**
 * @module ui/ConsultationView
 * @purpose Consultation dashboard (#563): current transits, active timing techniques, and chart highlights for one person, for today only.
 * @conventions Pure read-only aggregation of other screens' own compute pipelines — introduces no new calculation. Uses ConsultationView.messages.ts for its own copy and reuses chartViewMessages/timingTimelineViewMessages/transitFilterPanelMessages for shared terminology rather than duplicating strings.
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
  type TimingTimelineTrack,
} from '../domain/timing-timeline.js';
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
import { bodyDisplayName, aspectDisplayName } from './astro-names.messages.js';
import { EVERY_BODY_KEY, useTransitFilter } from './TransitFilterPanel.js';
import { transitFilterPanelMessages } from './TransitFilterPanel.messages.js';
import { TimingTimelineTracks } from './TimingTimelineView.js';
import { timingTimelineViewMessages } from './TimingTimelineView.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { PersonNotFound } from './PersonNotFound.js';
import { hrefFor } from './feature-registry.js';
import { personHref } from './route.js';
import { useRulershipChoice } from './rulership-setting.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { useStoreState } from './store-context.js';
import { todayInputValue } from './format.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';
import { FilterSummary } from './primitives/FilterSummary.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { consultationViewMessages } from './ConsultationView.messages.js';
import { BackLink } from './BackLink.js';

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
    }
  | { readonly kind: 'error'; readonly message: string };

/** The top handful of ranked transit contacts, most important first — this screen only ever shows a glance. */
const SHOWN_TRANSIT_COUNT = 5;
/** Today's fast contacts, on one line under the year's transits (#672). */
const SHOWN_FAST_COUNT = 3;

/**
 * Only the period/discrete-hit tracks, per this module's own doc comment — `transit` and
 * `secondary-progression` (and `periodic-transit`) stamp every current contact at the target
 * date rather than filtering to the significant ones, so at a single-day window they dump the
 * full, unranked list instead of a glance.
 */
const GLANCE_TRACKS: readonly TimingTimelineTrack[] = [
  'zodiacal-releasing',
  'firdaria',
  'profections',
  'primary-directions',
  'solar-arc',
];

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

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined) return undefined;
    const effect = { cancelled: false };
    const moment = person.moment;
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const today = todayInputValue();
        const [year, month, day] = today.split('-').map(Number) as [number, number, number];
        const todayJd = await provider.julianDayFromUtc(year, month, day, 12, 0, 0);
        const natalJd = await julianDayFor(provider, resolveMoment(moment));
        // Only the techniques that feed a `GLANCE_TRACKS` track are computed here —
        // secondary progression and the periodic-transit forecast would only be filtered back
        // out at render time (see this module's own doc comment), so skipping them keeps this
        // "glance" screen's load lighter than `TimingTimelineView`'s own full computation.
        const [natal, profections, directions, solarArc, transit] = await Promise.all([
          computeChartData(moment, provider),
          computeProfections(moment, todayJd, provider),
          generatePrimaryDirections(moment, provider),
          computeSolarArcDirections(moment, todayJd, provider),
          computeTransit(moment, todayJd, provider),
        ]);
        const releasing = zodiacalReleasingPeriods(natal.partOfFortune, natalJd, 18);
        const events = [
          ...releasingPeriodsToTimelineEvents(releasing),
          ...releasingSubperiodsToTimelineEvents(releasing.flatMap(zodiacalReleasingSubperiods)),
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
  }, [person?.moment, provider]);

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

  const zodiac = defaultProfile?.settings.zodiac ?? DEFAULT_EXTENDED_SETTINGS.zodiac;
  const zodiacLabel = zodiac.kind === 'sidereal' ? t.sidereal : t.tropical;
  const tracks =
    load.kind === 'ready'
      ? timingTimelineTracks(load.events, load.todayJd, load.todayJd).filter((track) =>
          GLANCE_TRACKS.includes(track.track),
        )
      : [];

  // Literal, deterministic highlights — every entry is a `true` field already on `dignityRows`/
  // `conditionRows`, not a new score (see this module's own doc comment).
  const dignityHighlights =
    load.kind === 'ready'
      ? load.dignities
          .filter((row) => row.ruler || row.exalted)
          .map((row) =>
            t.dignityNote(bodyDisplayName(row.bodyKey, locale), row.ruler ? t.rulerDignity : t.exaltedDignity),
          )
      : [];
  const conditionHighlights =
    load.kind === 'ready'
      ? load.conditions
          .filter(
            (row) =>
              row.besieged ||
              row.solarCondition === 'cazimi' ||
              row.solarCondition === 'combust' ||
              row.motion === 'retrograde',
          )
          .flatMap((row) => {
            const name = bodyDisplayName(row.bodyKey, locale);
            const notes: string[] = [];
            if (row.solarCondition === 'cazimi') notes.push(t.cazimiCondition);
            if (row.solarCondition === 'combust') notes.push(t.combustCondition);
            if (row.besieged) notes.push(t.besiegedCondition);
            if (row.motion === 'retrograde') notes.push(t.retrogradeCondition);
            return notes.map((note) => t.conditionNote(name, note));
          })
      : [];
  const highlights = [...dignityHighlights, ...conditionHighlights];

  return (
    <main className="shell">
      <BackLink fallback={personHref(personId)} />
      <h1>{person.displayName ? t.heading(person.displayName) : t.fallback}</h1>

      <h2>{t.basisHeading}</h2>
      <p>{t.basisLine(zodiacLabel, rulershipT.options[rulership])}</p>

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

      {load.kind === 'ready' && (
        <>
          <h2>{t.transitsHeading}</h2>
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
                <li key={`${row.bodyAKey}-${row.aspectKey}-${row.bodyBKey}`}>
                  {bodyDisplayName(row.bodyAKey, locale)} {aspectDisplayName(row.aspectKey, locale)}{' '}
                  {bodyDisplayName(row.bodyBKey, locale)}
                </li>
              ))}
            </ul>
          )}
          <p>
            {fastRows.length === 0
              ? t.noFastToday
              : t.fastToday(
                  fastRows
                    .map(
                      (row) =>
                        `${bodyDisplayName(row.bodyAKey, locale)} ${aspectDisplayName(row.aspectKey, locale).toLowerCase()} ${bodyDisplayName(row.bodyBKey, locale)}`,
                    )
                    .join(t.listSeparator),
                )}
          </p>
          <p>
            <a href={hrefFor('transit', { personId })}>{t.viewAllTransits}</a>
          </p>

          <h2>{t.timingHeading}</h2>
          <TimingTimelineTracks
            axisLabel={t.asOfToday}
            tracks={tracks}
            labels={timingT.tracks}
            noEvents={timingT.noEvents}
            dateLabel={dateLabel}
          />
          <p>
            <a href={hrefFor('timing-timeline', { personId })}>{t.openTimingTimeline}</a>
          </p>

          <h2>{t.highlightsHeading}</h2>
          {load.shape === undefined ? (
            <p className="hint">{t.shapeCannotBeWorkedOut}</p>
          ) : (
            <p>{chartT.jonesShapeLabels[load.shape.shape]}</p>
          )}
          {highlights.length === 0 ? (
            <p className="hint">{t.noNotableConditions}</p>
          ) : (
            <ul>
              {highlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p>
            <a href={hrefFor('chart', { personId })}>{t.openPatternsAndCondition}</a>
          </p>
        </>
      )}

      <h2>{t.nextHeading}</h2>
      <ul className="overview-actions">
        <li>
          <a href={hrefFor('transit', { personId })}>{t.viewAllTransits}</a>
        </li>
        <li>
          <a href={hrefFor('timing-timeline', { personId })}>{t.openTimingTimeline}</a>
        </li>
        <li>
          <a href={hrefFor('chart', { personId })}>{t.openNatalChart}</a>
        </li>
        <li>
          <a href={hrefFor('report', { personId })}>{t.openInterpretation}</a>
        </li>
        <li>
          <a href={hrefFor('export-builder', {})}>{t.buildPdf}</a>
        </li>
      </ul>
    </main>
  );
}
