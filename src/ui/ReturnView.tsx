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
import { GlossaryText } from './GlossaryText.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeLunarReturnChart, computeSolarReturnChart, type ReturnChartData } from '../domain/return-chart.js';
import { crossAspectRows, type AspectRow } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { ChartDataView, PdfCreatorLink, pdfCreatorHref } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { useCalculationBasisLine } from './calculation-basis.js';
import { type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { formatOrb, todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { returnViewMessages } from './ReturnView.messages.js';
import { toChartCalculationOptions } from '../chart/extended-settings.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import { formatUtc } from './void-of-course-text.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { GeoPosition } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import type { TableColumn } from './table-sort.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { BackLink } from './BackLink.js';
import { PageHeader } from './PageHeader.js';

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
      labelTerm: 'aspect',
      valueOf: (row) => row.aspect,
      render: (row) => aspectDisplayName(row.aspectKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.natalColumn,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
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
  const personMoment = useStableMoment(person?.moment);
  // The person's chosen fixed stars (#860), as the natal chart reads them.
  const fixedStars = useStableBy(person?.fixedStars, (stars) => JSON.stringify(stars ?? []));
  const t = useMessages(returnViewMessages);
  const [locale] = useLocale();
  const {
    settings: settings,
    unreadable: settingsUnreadable,
    setSettings: setSettings,
    rulership,
  } = usePersonCalculationSettings(personId);
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
    if (personMoment === undefined || provider === undefined || settingsUnreadable || !inputValid || placeInvalid) {
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
          ...(place === undefined ? {} : { place }),
          ...(fixedStars === undefined ? {} : { fixedStars }),
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
    settingsUnreadable,
    personMoment,
    provider,
    solar,
    yearNumber,
    fromJdParts,
    place,
    placeInvalid,
    inputValid,
    rulership,
    settings,
    fixedStars,
  ]);

  const baseLabel = solar ? t.solarLabel(year) : t.lunarLabel;
  const label =
    place === undefined
      ? baseLabel
      : `${baseLabel}, ${t.castFor(`${String(place.latitude)}, ${String(place.longitude)}`)}`;
  // Memoised: a new array each render (a change of section re-renders this screen) would redraw the wheel and drop a selection.
  const metaLines = useMemo(() => [label], [label]);
  const contacts = useMemo(() => (load.kind === 'ready' ? crossAspectRows(load.result.contacts) : []), [load]);

  // The contacts table's CSV, offered in the page header (#887).
  useCsvExports(
    load.kind === 'ready' && person !== undefined
      ? [
          csvExportTable(
            'contacts',
            t.contactsCaption,
            deriveExportFilename(person.displayName, `${kind}-contacts`, 'csv'),
            contactColumns(t, locale),
            contacts,
          ),
        ]
      : undefined,
  );

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  const fallback = solar ? t.solarHeadingFallback : t.lunarHeadingFallback;
  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={fallback} titleTerm="solarReturn" />
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const heading = person.displayName ? (solar ? t.solarHeading : t.lunarHeading)(person.displayName) : fallback;
  const displayName = person.displayName ? `${person.displayName} — ${label}` : label;

  // The page's one export (#915): the PDF creator, opened on this person, this return chart and the view on screen.
  const creatorHref = pdfCreatorHref(personId, kind, view ?? 'wheel');

  return (
    <main className="shell shell--wide">
      <BackLink fallback={personHref(personId)} />
      <PageHeader title={heading} titleTerm="solarReturn" basis={basisLine}>
        <PdfCreatorLink href={creatorHref} />
      </PageHeader>
      <ChartTypeSelector personId={personId} type={kind} view={view} />
      {/* The result region: busy while the return (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

        {load.kind !== 'idle' && (
          <ChartDataView
            personId={personId}
            chartType={kind}
            load={load.kind === 'ready' ? { kind: 'ready', data: load.data } : load}
            displayName={displayName}
            showHouses
            metaLines={metaLines}
            rulership={rulership}
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
                    options: {
                      ...toChartCalculationOptions(settings),
                      rulership,
                      ...(fixedStars === undefined ? {} : { fixedStars }),
                    },
                  }
            }
          />
        )}

        {load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
          <StatusMessage kind="error">
            <GlossaryText text={t.housesUndefined} />
          </StatusMessage>
        )}
      </div>

      {/* Below the wheel and the Selection card (#1013): the inputs and explanations never push the chart down. */}
      <p className="hint">
        <GlossaryText text={solar ? t.solarHint : t.lunarHint} />
      </p>

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
        <p className="hint">
          <GlossaryText text={t.placeHint} />
        </p>
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
      <p className="hint">
        <GlossaryText text={t.conventions} />
      </p>

      <div>
        {load.kind === 'ready' && (
          <>
            <p className="hint">
              <GlossaryText text={t.contactsHint} />
            </p>
            <SortableTable
              caption={t.contactsCaption}
              columns={contactColumns(t, locale)}
              rows={contacts}
              getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
              downloadFilename={deriveExportFilename(person.displayName, `${kind}-contacts`, 'csv')}
            />
          </>
        )}
      </div>
    </main>
  );
}
