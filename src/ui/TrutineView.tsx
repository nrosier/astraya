/**
 * The Trutine of Hermes screen (#1407): William Lilly's conception chart (Christian Astrology, 1647, pp. 502-504).
 *
 * The birth Moon and Ascendant give a gestation in days from Lilly's table, which dates the conception; the chart is
 * cast for noon on that day at the birthplace and drawn through `ChartDataView`. Modelled on `RiseSetView`.
 */
/**
 * @module TrutineView
 * @purpose Trutine of Hermes conception chart screen for one person: a summary of the conception day and Lilly's 13-degree check above the conception chart.
 * @conventions A derived chart shown through `ChartDataView` like the other Charts-page types, with no PDF link because the PDF builder does not offer this type; gated for an incomplete or unknown-time birth record; Lilly's table is Julian-calendar reckoning, so a Gregorian birth is converted to the Julian date by the domain and calculated like a Julian one; a birth whose conception chart falls outside the engine's 1800-2399 range gets the outside-range message and no chart; a failed check is a warning, not an error; text from TrutineView.messages.ts via useMessages().
 * @exports TrutineView
 */
import { useEffect, useMemo, useState } from 'react';
import { GlossaryText } from './GlossaryText.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeTrutine, type TrutineConception } from '../domain/trutine.js';
import { housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import { ChartDataView, type ChartOverlayContext } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { ChartViewNav } from './ChartViewNav.js';
import { useCalculationBasisLine, withBasisItems } from './calculation-basis.js';
import { type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { useMessages } from './messages.js';
import { useLocale } from './locale.js';
import { formatCivilDate, formatDecimalExact, formatInteger } from './format.js';
import { PersonNotFound } from './PersonNotFound.js';
import { trutineViewMessages } from './TrutineView.messages.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useStoreState } from './store-context.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { ChartHelpTooltip } from './ChartHelpTooltip.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly result: TrutineConception }
  | { readonly kind: 'outside-range'; readonly first: number; readonly last: number }
  | { readonly kind: 'error'; readonly message: string };

export function TrutineView({
  personId,
  view,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const fixedStars = useStableBy(person?.fixedStars, (stars) => JSON.stringify(stars ?? []));
  const t = useMessages(trutineViewMessages);
  const [locale] = useLocale();
  const { settings, unreadable: settingsUnreadable, setSettings, rulership } = usePersonCalculationSettings(personId);
  const baseBasis = useCalculationBasisLine(settings, rulership);
  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const options = {
          ...toChartCalculationOptions(settings),
          rulership,
          ...(fixedStars === undefined ? {} : { fixedStars }),
        };
        const outcome = await computeTrutine(moment, provider, options);
        if (effect.cancelled) return;
        setLoad(
          outcome.kind === 'ready'
            ? { kind: 'ready', result: outcome.result }
            : { kind: 'outside-range', first: outcome.first, last: outcome.last },
        );
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, provider, rulership, settings, fixedStars]);

  const result = load.kind === 'ready' ? load.result : undefined;
  const data: ChartData | undefined = result?.chart;
  const basisLine = withBasisItems(baseBasis, t.basis);
  const metaLines = useMemo(() => [t.headingFallback], [t.headingFallback]);

  const personName = person?.displayName;
  const overlayLabel = personName ? `${personName} — ${t.headingFallback}` : t.headingFallback;
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

  const chartLoad = useMemo((): React.ComponentProps<typeof ChartDataView>['load'] => {
    if (data !== undefined) return { kind: 'ready', data };
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
  const displayName = person.displayName ? `${person.displayName} — ${t.headingFallback}` : t.headingFallback;
  const distance = result === undefined ? '' : formatDecimalExact(result.check.distance, 1, locale);

  return (
    <main className="shell shell--wide">
      <PageHeader
        title={heading}
        titleAside={<ChartHelpTooltip explanation={t.hint} />}
        basis={basisLine}
        variant="return"
      />
      <ChartTypeSelector personId={personId} type="trutine" view={view} />
      {load.kind === 'outside-range' && (
        <>
          {/* No chart is calculated outside the engine's range, so `ChartDataView` is not mounted; the page still carries
              the shared view bar, as `ChartDataView` draws it while a chart loads (no views until there is a chart). */}
          <ChartViewNav
            activeView={view ?? 'wheel'}
            buildHref={(next) => chartHref(personId, next, 'trutine')}
            onNavigate={(next) => {
              changeChartView(personId, 'trutine', next);
            }}
            availableViews={[]}
          />
          <StatusMessage kind="empty">{t.outsideRange(String(load.first), String(load.last))}</StatusMessage>
        </>
      )}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {result !== undefined && (
          <dl className="metric-cards" aria-label={t.summaryLabel}>
            <div className="flat-card">
              <dt>{t.conceptionLabel}</dt>
              <dd>{formatCivilDate(result.conception, locale)}</dd>
            </div>
            {result.conceptionGregorian !== undefined && (
              <div className="flat-card">
                <dt>{t.conceptionGregorianLabel}</dt>
                <dd>{formatCivilDate(result.conceptionGregorian, locale)}</dd>
              </div>
            )}
            <div className="flat-card">
              <dt>{t.gestationLabel}</dt>
              <dd>{t.gestationDays(formatInteger(result.gestationDays, locale))}</dd>
            </div>
            <div className="flat-card">
              <dt>{t.columnLabel}</dt>
              <dd>{result.column === 'under' ? t.columnUnder : t.columnAbove}</dd>
            </div>
          </dl>
        )}
        {result !== undefined && (
          <StatusMessage kind={result.check.passed ? 'success' : 'partial'}>
            {result.check.passed ? t.checkPassed(distance) : t.checkFailed(distance)}
          </StatusMessage>
        )}

        {(load.kind === 'loading' || load.kind === 'error' || data !== undefined) && (
          <ChartDataView
            wheelHint={false}
            personId={personId}
            chartType="trutine"
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
              changeChartView(personId, 'trutine', next);
            }}
            buildViewHref={(next) => chartHref(personId, next, 'trutine')}
            overlayContext={overlayContext}
          />
        )}

        {data !== undefined && !housesAreDefined(data.houses) && (
          <StatusMessage kind="error">
            <GlossaryText text={t.housesUndefined} />
          </StatusMessage>
        )}
      </div>

      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}
    </main>
  );
}
