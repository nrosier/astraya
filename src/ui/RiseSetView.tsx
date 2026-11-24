/**
 * The rise and set chart screen (#1407): the chart for the moment a body rises, sets or culminates at the birthplace,
 * as Solar Fire Deluxe has it (§12.9).
 *
 * A body, an event, a horizon (True or Visual; not for a culmination, which has none) and a date cast one full chart at
 * the birthplace through `computeRiseSetChart`. A body that never crosses the horizon in the search window is
 * explained, not drawn. Modelled on `LunarPhaseReturnView`.
 */
/**
 * @module RiseSetView
 * @purpose Rise and set chart screen for one person: a body, an event, a horizon and a date give one chart at the birthplace.
 * @conventions A derived chart shown through `ChartDataView` like the other Charts-page types, with no PDF link because the PDF builder does not offer this type; gated for an incomplete or unknown-time birth record; the typed circumpolar and never-rises reasons are shown as a status message; text from RiseSetView.messages.ts via useMessages().
 * @exports RiseSetView
 */
import { useEffect, useMemo, useState } from 'react';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { DateField } from './primitives/DateField.js';
import { Select } from './primitives/Select.js';
import { GlossaryText } from './GlossaryText.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeRiseSetChart, type RiseSetChartResult } from '../domain/rise-set-chart.js';
import { BODIES, bodyByKey } from '../astrology/bodies.js';
import { housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import { ChartDataView, type ChartOverlayContext } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { useCalculationBasisLine, withBasisItems } from './calculation-basis.js';
import { type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { riseSetViewMessages } from './RiseSetView.messages.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useStoreState } from './store-context.js';
import { formatUtc } from './void-of-course-text.js';
import type { RiseTransitEvent, RiseTransitHorizon } from '../ephemeris/types.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { ChartHelpTooltip } from './ChartHelpTooltip.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly result: RiseSetChartResult }
  | { readonly kind: 'error'; readonly message: string };

const EVENTS: readonly RiseTransitEvent[] = ['rise', 'set', 'culminate', 'anticulminate'];
const HORIZONS: readonly RiseTransitHorizon[] = ['true', 'visual'];

/** The Sun, as the brief's default. */
const DEFAULT_BODY_KEY = 'sun';

export function RiseSetView({
  personId,
  view,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  // The person's chosen fixed stars (#860), as the natal chart reads them.
  const fixedStars = useStableBy(person?.fixedStars, (stars) => JSON.stringify(stars ?? []));
  const t = useMessages(riseSetViewMessages);
  const [locale] = useLocale();
  const { settings, unreadable: settingsUnreadable, setSettings, rulership } = usePersonCalculationSettings(personId);
  const baseBasis = useCalculationBasisLine(settings, rulership);
  const { provider } = useEphemerisProvider();

  const [fromDate, setFromDate] = useState(todayInputValue);
  const [bodyKey, setBodyKey] = useState(DEFAULT_BODY_KEY);
  const [event, setEvent] = useState<RiseTransitEvent>('rise');
  const [horizon, setHorizon] = useState<RiseTransitHorizon>('true');
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  // A culmination has no horizon, so the control is hidden and the choice does not matter for it.
  const usesHorizon = event === 'rise' || event === 'set';

  const dateParts = useMemo(() => {
    const [year, month, day] = fromDate.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined && !Number.isNaN(year + month + day)
      ? { year, month, day }
      : undefined;
  }, [fromDate]);

  useEffect(() => {
    const body = bodyByKey(bodyKey);
    if (
      personMoment === undefined ||
      provider === undefined ||
      settingsUnreadable ||
      dateParts === undefined ||
      body === undefined
    ) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const searchJd = await provider.julianDay(dateParts.year, dateParts.month, dateParts.day, 0);
        const options = {
          ...toChartCalculationOptions(settings),
          rulership,
          ...(fixedStars === undefined ? {} : { fixedStars }),
          searchJd,
        };
        const result = await computeRiseSetChart(moment, body.id, event, horizon, provider, options);
        if (!effect.cancelled) setLoad({ kind: 'ready', result });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, provider, dateParts, bodyKey, event, horizon, rulership, settings, fixedStars]);

  const bodyName = bodyDisplayName(bodyKey, locale);
  const eventName = t.event[event];
  const found = load.kind === 'ready' ? load.result : undefined;
  const data: ChartData | undefined = found?.chart;
  const eventJd = found?.chart === undefined ? undefined : found.eventJd;
  const label = `${bodyName} ${eventName}`;
  const basisLine =
    eventJd === undefined
      ? baseBasis
      : withBasisItems(
          baseBasis,
          usesHorizon
            ? t.basis(bodyName, eventName, t.horizon[horizon], formatUtc(eventJd))
            : `${bodyName} ${eventName}, ${formatUtc(eventJd)}`,
        );
  // Memoised: a new array each render (a change of section re-renders this screen) would redraw the wheel and drop a selection.
  const metaLines = useMemo(() => [label], [label]);

  // Memoised (#1333): a new object each render reruns the overlay effect and drops the wheel selection, as on the natal chart.
  const personName = person?.displayName;
  const overlayLabel = personName ? `${personName} — ${label}` : label;
  const overlayContext = useMemo(
    (): ChartOverlayContext | undefined =>
      provider === undefined || personMoment === undefined
        ? undefined
        : {
            moment: personMoment,
            provider,
            baseLabel: overlayLabel,
            options: {
              ...toChartCalculationOptions(settings),
              rulership,
              ...(fixedStars === undefined ? {} : { fixedStars }),
            },
          },
    [provider, personMoment, overlayLabel, settings, rulership, fixedStars],
  );

  // Memoised (#1333): the wheel's overlay effect depends on `load`, so a new object each render would drop the selection.
  const chartLoad = useMemo((): React.ComponentProps<typeof ChartDataView>['load'] => {
    if (data !== undefined) return { kind: 'ready', data };
    // Only drawn while loading or on error: with no event there is nothing to draw.
    return load.kind === 'error' ? load : { kind: 'loading' };
  }, [load, data]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice name={person.displayName || ''} />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <PageHeader title={t.headingFallback} variant="return" />
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const heading = person.displayName ? t.heading(person.displayName) : t.headingFallback;
  const displayName = person.displayName ? `${person.displayName} — ${label}` : label;

  return (
    <main className="shell shell--wide">
      <PageHeader
        title={heading}
        titleAside={<ChartHelpTooltip explanation={t.hint} />}
        basis={basisLine}
        variant="return"
      />
      <ChartTypeSelector personId={personId} type="rise-set" view={view} />
      {/* The result region: busy while the event (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {(load.kind === 'loading' || load.kind === 'error' || data !== undefined) && (
          <ChartDataView
            wheelHint={false}
            personId={personId}
            chartType="rise-set"
            load={chartLoad}
            displayName={displayName}
            showHouses
            metaLines={metaLines}
            rulership={rulership}
            extendedSettings={settings}
            onExtendedSettingsChange={setSettings}
            settingsProvider={provider}
            view={view ?? 'wheel'}
            onViewChange={(next) => {
              changeChartView(personId, 'rise-set', next);
            }}
            buildViewHref={(next) => chartHref(personId, next, 'rise-set')}
            overlayContext={overlayContext}
          />
        )}

        {found !== undefined && found.chart === undefined && (
          <StatusMessage kind="empty">
            {found.reason === 'circumpolar' ? t.circumpolar(bodyName) : t.neverRises(bodyName, eventName.toLowerCase())}
          </StatusMessage>
        )}

        {data !== undefined && !housesAreDefined(data.houses) && (
          <StatusMessage kind="error">
            <GlossaryText text={t.housesUndefined} />
          </StatusMessage>
        )}
      </div>

      {/* Below the wheel and the Selection card (#1013): the inputs never push the chart down. */}
      <div className="field-grid">
        <Select
          label={t.bodyLabel}
          value={bodyKey}
          options={BODIES.map((body) => ({ value: body.key, label: bodyDisplayName(body.key, locale) }))}
          onChange={setBodyKey}
        />
        <ChoiceGroup
          label={t.eventLabel}
          showLabel
          value={event}
          options={EVENTS.map((value) => ({ value, label: t.event[value] }))}
          onChange={(value) => {
            const next = EVENTS.find((candidate) => candidate === value);
            if (next !== undefined) setEvent(next);
          }}
        />
        {usesHorizon && (
          <ChoiceGroup
            label={t.horizonLabel}
            showLabel
            value={horizon}
            options={HORIZONS.map((value) => ({ value, label: t.horizon[value] }))}
            onChange={(value) => {
              const next = HORIZONS.find((candidate) => candidate === value);
              if (next !== undefined) setHorizon(next);
            }}
          />
        )}
        <DateField label={t.dateLabel} value={fromDate} onChange={setFromDate} />
      </div>
      {usesHorizon && (
        <p className="hint">
          <GlossaryText text={t.horizonHint} />
        </p>
      )}
      {dateParts === undefined && <StatusMessage kind="error">{t.invalidDate}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}
      {eventJd !== undefined && <StatusMessage kind="loading">{t.eventMoment(formatUtc(eventJd))}</StatusMessage>}
      <p className="hint">
        <GlossaryText text={t.conventions} />
      </p>
    </main>
  );
}
