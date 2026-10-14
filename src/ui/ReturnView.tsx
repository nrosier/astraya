/**
 * The solar and lunar return charts on the Charts page.
 *
 * A return is a complete chart cast for one moment, so it is shown by `ChartDataView` like every other chart
 * type (wheel, shape, and the tables). What a natal chart does not have is the pair of inputs picked here, the
 * year (solar) or the date to search from (lunar) and where the chart is cast, and a table of the return's
 * contacts to the natal chart, shown under the chart.
 */
/**
 * @module ReturnView
 * @purpose Solar and lunar return chart screens: picks the return moment/casting place, computes the return chart, and shows it via ChartDataView plus natal contacts.
 * @conventions Gated for incomplete/unknown-time birth records like other person-scoped views; uses ReturnView.messages.ts for en/nl text via useMessages().
 * @exports ReturnView
 */
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { GlossaryTerms } from './GlossaryTerm.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeLunarReturnChart, computeSolarReturnChart, type ReturnChartData } from '../domain/return-chart.js';
import { crossAspectRows, type AspectRow } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { momentKey } from '../time/encode.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { ChartDataView } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { useCalculationBasisLine } from './calculation-basis.js';
import { type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { formatFixed, todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { ReportView } from './ReportView.js';
import { returnViewMessages } from './ReturnView.messages.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { useExtendedSettings } from './extended-settings-store.js';
import { useRulershipChoice } from './rulership-setting.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import { formatUtc } from './void-of-course-text.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { GeoPosition } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import type { TableColumn } from './table-sort.js';
import { StatusMessage } from './primitives/StatusMessage.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData; readonly result: ReturnChartData }
  | { readonly kind: 'error'; readonly message: string };

const MIN_YEAR = 1800;
const MAX_YEAR = 2200;

function parseCoordinate(value: string, min: number, max: number): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function contactColumns(t: typeof returnViewMessages.en, locale: Locale): readonly TableColumn<AspectRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.returnColumn,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'aspect',
      label: t.aspectLabel,
      valueOf: (row) => row.aspect,
      render: (row) => aspectDisplayName(row.aspectKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.natalColumn,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => `${formatFixed(row.orb, 2)}°` },
    {
      key: 'applying',
      label: t.applyingLabel,
      valueOf: (row) => row.applying,
      render: (row) => (row.applying ? t.applying : t.separating),
    },
  ];
}

// Comparison mode (compareType) will be implemented in a follow-up (#439)
export function ReturnView({
  personId,
  kind,
  view,
  compareType,
}: {
  personId: string;
  kind: 'solar-return' | 'lunar-return';
  view?: ChartViewKind | undefined;
  compareType?: ChartType | undefined;
}): React.JSX.Element {
  if (compareType !== undefined) {
    // TODO: implement comparison mode for return charts (#439)
  }
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(returnViewMessages);
  const [locale] = useLocale();
  const [rulership] = useRulershipChoice();
  const [settings, setSettings] = useExtendedSettings();
  const basisLine = useCalculationBasisLine(settings, rulership);
  const { provider } = useEphemerisProvider();
  const solar = kind === 'solar-return';

  const [year, setYear] = useState(() => todayInputValue().slice(0, 4));
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [otherPlace, setOtherPlace] = useState(false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  const yearNumber = Number.parseInt(year, 10);
  const yearValid = Number.isInteger(yearNumber) && yearNumber >= MIN_YEAR && yearNumber <= MAX_YEAR;
  const fromJdParts = useMemo(() => {
    const [y, m, d] = fromDate.split('-').map(Number);
    return y !== undefined && m !== undefined && d !== undefined && !Number.isNaN(y + m + d)
      ? { year: y, month: m, day: d }
      : undefined;
  }, [fromDate]);
  const inputValid = solar ? yearValid : fromJdParts !== undefined;

  const latitude = parseCoordinate(lat, -90, 90);
  const longitude = parseCoordinate(lon, -180, 180);
  const place: GeoPosition | undefined = useMemo(
    () =>
      otherPlace && latitude !== undefined && longitude !== undefined
        ? { latitude, longitude, altitude: 0 }
        : undefined,
    [otherPlace, latitude, longitude],
  );
  const placeInvalid = otherPlace && place === undefined;

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined || !inputValid || placeInvalid) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const moment = person.moment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const options = {
          ...toChartCalculationOptions(settings),
          rulership,
          ...(place === undefined ? {} : { place }),
        };
        const result = solar
          ? await computeSolarReturnChart(moment, yearNumber, provider, options)
          : await computeLunarReturnChart(
              moment,
              await provider.julianDay(fromJdParts?.year ?? 0, fromJdParts?.month ?? 1, fromJdParts?.day ?? 1, 0),
              provider,
              options,
            );
        if (!effect.cancelled) setLoad({ kind: 'ready', data: result.chart, result });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [
    momentKey(person?.moment),
    provider,
    solar,
    yearNumber,
    fromJdParts,
    place,
    placeInvalid,
    inputValid,
    rulership,
    settings,
  ]);

  const baseLabel = solar ? t.solarLabel(year) : t.lunarLabel;
  const label =
    place === undefined
      ? baseLabel
      : `${baseLabel}, ${t.castFor(`${String(place.latitude)}, ${String(place.longitude)}`)}`;
  // Memoised: a new array each render (a change of section re-renders this screen) would redraw the wheel and drop a selection.
  const metaLines = useMemo(() => [label], [label]);
  const contacts = useMemo(() => (load.kind === 'ready' ? crossAspectRows(load.result.contacts) : []), [load]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  const fallback = solar ? t.solarHeadingFallback : t.lunarHeadingFallback;
  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <p className="back">
          <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{fallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const heading = person.displayName ? (solar ? t.solarHeading : t.lunarHeading)(person.displayName) : fallback;
  const displayName = person.displayName ? `${person.displayName} — ${label}` : label;

  return (
    <main className="shell shell--wide">
      <p className="back">
        <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{heading}</h1>
      <GlossaryTerms terms={['solarReturn', 'aspect', 'houses']} />
      <p className="hint page-header-basis">{basisLine}</p>
      <ChartTypeSelector personId={personId} type={kind} view={view} />
      <p className="hint">{solar ? t.solarHint : t.lunarHint}</p>

      <div className="field-grid">
        {solar ? (
          <NumberField label={t.yearLabel} min={MIN_YEAR} max={MAX_YEAR} value={year} onChange={setYear} />
        ) : (
          <DateField label={t.fromDateLabel} value={fromDate} onChange={setFromDate} />
        )}
      </div>
      {!inputValid && <StatusMessage kind="error">{solar ? t.invalidYear : t.invalidDate}</StatusMessage>}

      <fieldset className="field-group">
        <legend>{t.placeLegend}</legend>
        <p className="hint">{t.placeHint}</p>
        <ChoiceGroup
          label={t.placeLegend}
          value={otherPlace ? 'other' : 'birth'}
          options={[
            { value: 'birth', label: t.placeBirth },
            { value: 'other', label: t.placeOther },
          ]}
          onChange={(value) => {
            setOtherPlace(value === 'other');
          }}
        />
        {otherPlace && (
          <div className="field-grid">
            <NumberField label={t.latitudeLabel} step="any" min={-90} max={90} value={lat} onChange={setLat} />
            <NumberField label={t.longitudeLabel} step="any" min={-180} max={180} value={lon} onChange={setLon} />
          </div>
        )}
        {placeInvalid && lat !== '' && lon !== '' && <StatusMessage kind="error">{t.invalidPlace}</StatusMessage>}
      </fieldset>

      {load.kind === 'ready' && (
        <StatusMessage kind="loading">{t.returnMoment(formatUtc(load.result.returnJd))}</StatusMessage>
      )}
      <p className="hint">{t.conventions}</p>
      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

      {load.kind !== 'idle' && (
        <ChartDataView
          load={load.kind === 'ready' ? { kind: 'ready', data: load.data } : load}
          displayName={displayName}
          showHouses
          metaLines={metaLines}
          extendedSettings={settings}
          onExtendedSettingsChange={setSettings}
          settingsProvider={provider}
          view={view ?? 'wheel'}
          onViewChange={(next) => {
            changeChartView(personId, kind, next);
          }}
          buildViewHref={(next) => chartHref(personId, next, kind)}
          overlayContext={
            provider === undefined
              ? undefined
              : {
                  moment: person.moment,
                  provider,
                  baseLabel: displayName,
                  options: { ...toChartCalculationOptions(settings), rulership },
                }
          }
        />
      )}

      {load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">{t.housesUndefined}</StatusMessage>
      )}

      {load.kind === 'ready' && (
        <>
          <p className="hint">{t.contactsHint}</p>
          <SortableTable
            caption={t.contactsCaption}
            columns={contactColumns(t, locale)}
            rows={contacts}
            getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
            downloadFilename={deriveExportFilename(person.displayName, `${kind}-contacts`, 'csv')}
          />
        </>
      )}
      {load.kind === 'ready' && housesAreDefined(load.data.houses) && <ReportView chart={load.data} />}
    </main>
  );
}
