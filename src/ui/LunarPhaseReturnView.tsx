/**
 * The lunar phase return chart screen (#1407): the chart for the moment the Sun-Moon phase angle returns to its natal
 * value, as Solar Fire Deluxe lists it among its lunar phase charts (§12.10).
 *
 * A date and a choice of which return around it (before, nearest or after) cast one full chart at the birthplace, and
 * beneath it the returns from the most recent one before the date, Solar Fire's own list. It is modelled on `ReturnView`,
 * which a phase return does not fit: there is no natal-contacts table, and the chart is found from a phase angle rather
 * than a body returning to a longitude.
 */
/**
 * @module LunarPhaseReturnView
 * @purpose Lunar phase return chart screen for one person: a date and a before/nearest/after choice give one return chart, with the list of returns from the last one before the date.
 * @conventions A derived chart shown through `ChartDataView` like the other Charts-page types, with no PDF link because the PDF builder does not offer this type; gated for an incomplete or unknown-time birth record; the returns list uses `findLunarPhaseReturns` (Solar Fire's list), and Before/Nearest/After the date is Astraya's own convenience; text from LunarPhaseReturnView.messages.ts via useMessages().
 * @exports LunarPhaseReturnView
 */
import { useEffect, useMemo, useState } from 'react';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { DateField } from './primitives/DateField.js';
import { GlossaryText } from './GlossaryText.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import {
  computeLunarPhaseReturnChart,
  findLunarPhaseReturns,
  type LunarPhaseReturnData,
  type LunarPhaseReturnWhich,
} from '../domain/lunar-phase-return.js';
import { housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { ChartDataView, type ChartOverlayContext } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { useCalculationBasisLine, withBasisItems } from './calculation-basis.js';
import { type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { formatDecimal, todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { lunarPhaseReturnViewMessages } from './LunarPhaseReturnView.messages.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import { formatUtc } from './void-of-course-text.js';
import type { JulianDayUT } from '../ephemeris/types.js';
import type { TableColumn } from './table-sort.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { ChartHelpTooltip } from './ChartHelpTooltip.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly data: ChartData;
      readonly result: LunarPhaseReturnData;
      readonly returns: readonly JulianDayUT[];
    }
  | { readonly kind: 'error'; readonly message: string };

const WHICH: readonly LunarPhaseReturnWhich[] = ['current', 'nearest', 'next'];

/** How many returns the list shows: the last one before the date and the next two. */
const LISTED_RETURNS = 3;

export function LunarPhaseReturnView({
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
  const t = useMessages(lunarPhaseReturnViewMessages);
  const [locale] = useLocale();
  const { settings, unreadable: settingsUnreadable, setSettings, rulership } = usePersonCalculationSettings(personId);
  const baseBasis = useCalculationBasisLine(settings, rulership);
  const { provider } = useEphemerisProvider();

  const [fromDate, setFromDate] = useState(todayInputValue);
  const [which, setWhich] = useState<LunarPhaseReturnWhich>('next');
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  const dateParts = useMemo(() => {
    const [year, month, day] = fromDate.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined && !Number.isNaN(year + month + day)
      ? { year, month, day }
      : undefined;
  }, [fromDate]);

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable || dateParts === undefined) {
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
        };
        const [result, list] = await Promise.all([
          computeLunarPhaseReturnChart(moment, searchJd, provider, { ...options, which }),
          findLunarPhaseReturns(moment, searchJd, LISTED_RETURNS, provider, {
            ...(options.zodiac === undefined ? {} : { zodiac: options.zodiac }),
          }),
        ]);
        if (!effect.cancelled) setLoad({ kind: 'ready', data: result.chart, result, returns: list.returns });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, provider, dateParts, which, rulership, settings, fixedStars]);

  const label = t.which[which];
  const basisLine =
    load.kind === 'ready'
      ? withBasisItems(baseBasis, t.phaseAngle(formatDecimal(load.result.natalPhaseAngle, 1, locale)))
      : baseBasis;
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
    if (load.kind === 'ready') return { kind: 'ready', data: load.data };
    // Never drawn while idle: the chart is only rendered once a calculation has started.
    return load.kind === 'idle' ? { kind: 'loading' } : load;
  }, [load]);

  const returnRows = useMemo(() => (load.kind === 'ready' ? load.returns.map((jd) => ({ jd })) : []), [load]);
  const returnColumns: readonly TableColumn<{ readonly jd: JulianDayUT }>[] = [
    { key: 'jd', label: t.returnColumn, valueOf: (row) => row.jd, render: (row) => formatUtc(row.jd) },
  ];

  // The returns list's CSV, offered in the page header (#887).
  useCsvExports(
    load.kind === 'ready' && person !== undefined
      ? [
          csvExportTable(
            'phase-returns',
            t.returnsCaption,
            deriveExportFilename(person.displayName, 'lunar-phase-returns', 'csv'),
            returnColumns,
            returnRows,
          ),
        ]
      : undefined,
  );

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
      <ChartTypeSelector personId={personId} type="lunar-phase-return" view={view} />
      {/* The result region: busy while the return (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {load.kind !== 'idle' && (
          <ChartDataView
            wheelHint={false}
            personId={personId}
            chartType="lunar-phase-return"
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
              changeChartView(personId, 'lunar-phase-return', next);
            }}
            buildViewHref={(next) => chartHref(personId, next, 'lunar-phase-return')}
            overlayContext={overlayContext}
          />
        )}

        {load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
          <StatusMessage kind="error">
            <GlossaryText text={t.housesUndefined} />
          </StatusMessage>
        )}
      </div>

      {/* Below the wheel and the Selection card (#1013): the inputs never push the chart down. */}
      <div className="field-grid">
        <DateField label={t.dateLabel} value={fromDate} onChange={setFromDate} />
        <ChoiceGroup
          label={t.whichLabel}
          showLabel
          value={which}
          options={WHICH.map((value) => ({ value, label: t.which[value] }))}
          onChange={(value) => {
            const next = WHICH.find((candidate) => candidate === value);
            if (next !== undefined) setWhich(next);
          }}
        />
      </div>
      {dateParts === undefined && <StatusMessage kind="error">{t.invalidDate}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

      {load.kind === 'ready' && (
        <StatusMessage kind="loading">{t.returnMoment(formatUtc(load.result.returnJd))}</StatusMessage>
      )}
      <p className="hint">
        <GlossaryText text={t.conventions} />
      </p>

      {load.kind === 'ready' && (
        <>
          <p className="hint">
            <GlossaryText text={t.returnsHint} />
          </p>
          <SortableTable
            caption={t.returnsCaption}
            headingLevel={2}
            columns={returnColumns}
            rows={returnRows}
            getRowKey={(row) => String(row.jd)}
            downloadFilename={deriveExportFilename(person.displayName, 'lunar-phase-returns', 'csv')}
          />
        </>
      )}
    </main>
  );
}
