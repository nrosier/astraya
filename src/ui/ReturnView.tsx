/**
 * The solar and lunar return charts on the Charts page.
 *
 * A return is a complete chart cast for one moment, so it is shown by `ChartDataView` like every other chart
 * type (wheel, shape, and the tables). What a natal chart does not have is the pair of inputs picked here, the
 * year (solar) or the date to search from (lunar) and where the chart is cast, and a table of the return's
 * contacts to the natal chart, shown under the chart.
 */
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeLunarReturnChart, computeSolarReturnChart, type ReturnChartData } from '../domain/return-chart.js';
import { crossAspectRows, type AspectRow } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { momentKey } from '../time/encode.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { ChartDataView } from './ChartView.js';
import { ChartTypeSelector, changeChartSection } from './ChartTypeSelector.js';
import type { ChartSection } from './chart-sections.js';
import { todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { ReportView } from './ReportView.js';
import { returnViewMessages } from './ReturnView.messages.js';
import { useRulershipChoice } from './rulership-setting.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import { formatUtc } from './void-of-course-text.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { GeoPosition } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import type { TableColumn } from './table-sort.js';

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
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => `${row.orb.toFixed(2)}°` },
    {
      key: 'applying',
      label: t.applyingLabel,
      valueOf: (row) => row.applying,
      render: (row) => (row.applying ? t.applying : t.separating),
    },
  ];
}

export function ReturnView({
  personId,
  kind,
  section,
}: {
  personId: string;
  kind: 'solar-return' | 'lunar-return';
  section?: ChartSection | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(returnViewMessages);
  const [locale] = useLocale();
  const [rulership] = useRulershipChoice();
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
        const options = { rulership, ...(place === undefined ? {} : { place }) };
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
  }, [momentKey(person?.moment), provider, solar, yearNumber, fromJdParts, place, placeInvalid, inputValid, rulership]);

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
          <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{fallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={`#/person/${personId}`}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const heading = person.displayName ? (solar ? t.solarHeading : t.lunarHeading)(person.displayName) : fallback;
  const displayName = person.displayName ? `${person.displayName} — ${label}` : label;

  return (
    <main className="shell">
      <p className="back">
        <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{heading}</h1>
      <ChartTypeSelector personId={personId} type={kind} section={section} />
      <p className="hint">{solar ? t.solarHint : t.lunarHint}</p>

      <div className="field-grid">
        {solar ? (
          <label>
            {t.yearLabel}
            <input
              type="number"
              min={MIN_YEAR}
              max={MAX_YEAR}
              step={1}
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
              }}
            />
          </label>
        ) : (
          <label>
            {t.fromDateLabel}
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
              }}
            />
          </label>
        )}
      </div>
      {!inputValid && (
        <p className="warning" role="alert">
          {solar ? t.invalidYear : t.invalidDate}
        </p>
      )}

      <fieldset className="field-group">
        <legend>{t.placeLegend}</legend>
        <p className="hint">{t.placeHint}</p>
        <label>
          <input
            type="radio"
            name="return-place"
            checked={!otherPlace}
            onChange={() => {
              setOtherPlace(false);
            }}
          />{' '}
          {t.placeBirth}
        </label>{' '}
        <label>
          <input
            type="radio"
            name="return-place"
            checked={otherPlace}
            onChange={() => {
              setOtherPlace(true);
            }}
          />{' '}
          {t.placeOther}
        </label>
        {otherPlace && (
          <div>
            <label>
              {t.latitudeLabel}{' '}
              <input
                type="number"
                inputMode="decimal"
                min={-90}
                max={90}
                value={lat}
                onChange={(event) => {
                  setLat(event.target.value);
                }}
              />
            </label>{' '}
            <label>
              {t.longitudeLabel}{' '}
              <input
                type="number"
                inputMode="decimal"
                min={-180}
                max={180}
                value={lon}
                onChange={(event) => {
                  setLon(event.target.value);
                }}
              />
            </label>
          </div>
        )}
        {placeInvalid && lat !== '' && lon !== '' && (
          <p className="warning" role="alert">
            {t.invalidPlace}
          </p>
        )}
      </fieldset>

      {load.kind === 'ready' && <p className="status">{t.returnMoment(formatUtc(load.result.returnJd))}</p>}
      <p className="hint">{t.conventions}</p>
      {load.kind === 'loading' && <p className="status">{t.calculating}</p>}

      {load.kind !== 'idle' && (
        <ChartDataView
          load={load.kind === 'ready' ? { kind: 'ready', data: load.data } : load}
          displayName={displayName}
          showHouses
          metaLines={metaLines}
          section={section ?? 'chart'}
          onSectionChange={(next) => {
            changeChartSection(personId, kind, next);
          }}
        />
      )}

      {load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <p className="warning" role="alert">
          {t.housesUndefined}
        </p>
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
