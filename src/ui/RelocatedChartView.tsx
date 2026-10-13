/**
 * The relocated chart for a saved person (#559).
 *
 * Unlike draconic/harmonic (single synthetic chart, no in-screen parameter), this screen needs
 * one: the relocation place. Saved named locations live on the person record and are selected
 * into the same typed-latitude/typed-longitude fields used by `map-settings.ts`; manual values
 * remain possible. Shows the relocated chart as the usual wheel/tables (`ChartDataView`,
 * wholesale like every other derived-chart screen) plus a natal-vs-relocated comparison table
 * of houses and angles, since planetary positions themselves never differ between the two
 * (see `domain/relocated-chart.ts`'s own header).
 */
/**
 * @module RelocatedChartView
 * @purpose Renders the relocated-chart screen for a saved person: persisted named-location and manual coordinate controls, the relocated chart's wheel/tables, and a natal-vs-relocated houses/angles comparison table.
 * @conventions Reuses `ChartDataView` wholesale for the relocated chart like DraconicView/HarmonicView; named places are validated by domain/person.ts and persisted as one op-log register, while manual coordinate input uses `map-settings.ts`'s `parseCoordinate`. Text comes from co-located `RelocatedChartView.messages.ts` via `useMessages()`.
 * @exports RelocatedChartView
 */
import { useEffect, useMemo, useState } from 'react';
import { GlossaryTerms } from './GlossaryTerm.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeRelocatedChart, relocatedComparisonRows, type RelocatedChartData } from '../domain/relocated-chart.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { momentKey } from '../time/encode.js';
import { ChartDataView } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { ReportView } from './ReportView.js';
import { relocatedChartViewMessages } from './RelocatedChartView.messages.js';
import { useMessages } from './messages.js';
import { useLocale } from './locale.js';
import type { Locale } from '../interpretation/schema.js';
import { signDisplayName } from './astro-names.messages.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { parseCoordinate } from './map-settings.js';
import { NumberField } from './primitives/NumberField.js';
import { Select } from './primitives/Select.js';
import { TextField } from './primitives/TextField.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStore, useStoreState } from './store-context.js';
import type { RelocatedComparisonRow } from '../domain/relocated-chart.js';
import { StatusMessage } from './primitives/StatusMessage.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: RelocatedChartData }
  | { readonly kind: 'error'; readonly message: string };

function comparisonColumns(
  t: typeof relocatedChartViewMessages.en,
  locale: Locale,
): readonly TableColumn<RelocatedComparisonRow>[] {
  const cell = (parts: RelocatedComparisonRow['natal']): string =>
    `${signDisplayName(parts.sign, locale)} ${String(parts.degree)}°${String(parts.minute).padStart(2, '0')}'${String(parts.second).padStart(2, '0')}"`;
  return [
    { key: 'label', label: t.comparisonLabel, valueOf: (row) => row.label },
    { key: 'natal', label: t.comparisonNatal, valueOf: (row) => row.natalLongitude, render: (row) => cell(row.natal) },
    {
      key: 'relocated',
      label: t.comparisonRelocated,
      valueOf: (row) => row.relocatedLongitude,
      render: (row) => cell(row.relocated),
    },
  ];
}

export function RelocatedChartView({
  personId,
  view,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
}): React.JSX.Element {
  const store = useStore();
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(relocatedChartViewMessages);
  const [locale] = useLocale();

  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationError, setLocationError] = useState<string | undefined>();
  const latitude = parseCoordinate(latInput, -90, 90);
  const longitude = parseCoordinate(lonInput, -180, 180);
  const hasBothFields = latInput.trim() !== '' && lonInput.trim() !== '';
  const relocationPlace = latitude === undefined || longitude === undefined ? undefined : { latitude, longitude };

  const selectLocation = (id: string): void => {
    setSelectedLocationId(id);
    const location = person?.relocationPlaces?.find((candidate) => candidate.id === id);
    if (location === undefined) return;
    setLatInput(String(location.latitude));
    setLonInput(String(location.longitude));
  };

  const saveLocation = (): void => {
    if (person === undefined || relocationPlace === undefined || locationName.trim() === '') return;
    setLocationError(undefined);
    const id = crypto.randomUUID();
    void store
      .mutate([
        {
          entity: 'person',
          entityId: person.id,
          field: 'relocationPlaces',
          value: [
            ...(person.relocationPlaces ?? []).map((location) => ({
              id: location.id,
              label: location.label,
              latitude: location.latitude,
              longitude: location.longitude,
            })),
            {
              id,
              label: locationName.trim(),
              latitude: relocationPlace.latitude,
              longitude: relocationPlace.longitude,
            },
          ],
        },
      ])
      .then(() => {
        setLocationName('');
        setSelectedLocationId(id);
      })
      .catch((cause: unknown) => {
        setLocationError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  const removeLocation = (id: string): void => {
    if (person === undefined) return;
    setLocationError(undefined);
    void store
      .mutate([
        {
          entity: 'person',
          entityId: person.id,
          field: 'relocationPlaces',
          value: (person.relocationPlaces ?? [])
            .filter((location) => location.id !== id)
            .map((location) => ({
              id: location.id,
              label: location.label,
              latitude: location.latitude,
              longitude: location.longitude,
            })),
        },
      ])
      .then(() => {
        if (selectedLocationId === id) setSelectedLocationId('');
      })
      .catch((cause: unknown) => {
        setLocationError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  const metaLines = useMemo(() => [t.headingFallback], [t.headingFallback]);

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  const customPointsKey = JSON.stringify(person?.customPoints ?? []);

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined || relocationPlace === undefined) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const moment = person.moment;
    const place = { ...relocationPlace, altitude: 0 };
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const data = await computeRelocatedChart(
          moment,
          place,
          provider,
          person.customPoints === undefined ? {} : { customPoints: person.customPoints },
        );
        if (!effect.cancelled) setLoad({ kind: 'ready', data });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [momentKey(person?.moment), provider, relocationPlace?.latitude, relocationPlace?.longitude, customPointsKey]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <p className="back">
          <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.relocatedChartFallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName = person.displayName ? `${person.displayName} — ${t.headingFallback}` : t.headingFallback;

  return (
    <main className="shell shell--wide">
      <p className="back">
        <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{person.displayName ? t.heading(person.displayName) : t.headingFallback}</h1>
      <GlossaryTerms terms={['ascendant', 'houses', 'aspect']} />
      <ChartTypeSelector personId={personId} type="relocated" view={view} />
      <p className="hint">{t.hint}</p>

      <div className="relocation-saved-places">
        <Select
          label={t.savedLocationLabel}
          value={selectedLocationId}
          options={[
            { value: '', label: t.savedLocationPlaceholder },
            ...(person.relocationPlaces ?? []).map((location) => ({
              value: location.id,
              label: t.savedLocationOption(location.label, location.latitude, location.longitude),
            })),
          ]}
          onChange={selectLocation}
        />
        {(person.relocationPlaces?.length ?? 0) > 0 && selectedLocationId !== '' && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              removeLocation(selectedLocationId);
            }}
          >
            {t.deleteSavedLocation}
          </button>
        )}
      </div>

      <div className="field-grid">
        <NumberField
          label={t.latitudeLabel}
          value={latInput}
          min={-90}
          max={90}
          step={0.0001}
          decreaseLabel={t.latitudeDecreaseLabel}
          increaseLabel={t.latitudeIncreaseLabel}
          onChange={(next) => {
            setSelectedLocationId('');
            setLatInput(next);
          }}
        />
        <NumberField
          label={t.longitudeLabel}
          value={lonInput}
          min={-180}
          max={180}
          step={0.0001}
          decreaseLabel={t.longitudeDecreaseLabel}
          increaseLabel={t.longitudeIncreaseLabel}
          onChange={(next) => {
            setSelectedLocationId('');
            setLonInput(next);
          }}
        />
      </div>
      <div className="relocation-save-place">
        <TextField label={t.saveLocationName} value={locationName} onChange={setLocationName} />
        <button
          type="button"
          className="quiet"
          disabled={relocationPlace === undefined || locationName.trim() === ''}
          onClick={saveLocation}
        >
          {t.saveLocation}
        </button>
      </div>
      {locationError !== undefined && <StatusMessage kind="error">{t.savedLocationError(locationError)}</StatusMessage>}

      {!hasBothFields && <p className="hint">{t.needsLocation}</p>}
      {hasBothFields && relocationPlace === undefined && (
        <StatusMessage kind="error">{t.invalidLocation}</StatusMessage>
      )}

      {relocationPlace !== undefined && load.kind !== 'idle' && (
        <>
          <ChartDataView
            load={load.kind === 'ready' ? { kind: 'ready', data: load.data.relocated } : load}
            displayName={displayName}
            showHouses
            metaLines={metaLines}
            view={view ?? 'wheel'}
            onViewChange={(next) => {
              changeChartView(personId, 'relocated', next);
            }}
            buildViewHref={(next) => chartHref(personId, next, 'relocated')}
            overlayContext={
              provider === undefined
                ? undefined
                : {
                    moment: person.moment,
                    provider,
                    baseLabel: displayName,
                    ...(person.customPoints === undefined ? {} : { options: { customPoints: person.customPoints } }),
                  }
            }
          />

          {load.kind === 'ready' && !housesAreDefined(load.data.relocated.houses) && (
            <StatusMessage kind="error">{t.housesUndefined}</StatusMessage>
          )}
          {load.kind === 'ready' && housesAreDefined(load.data.relocated.houses) && (
            <>
              <ReportView chart={load.data.relocated} />
              <SortableTable
                caption={t.comparisonCaption}
                columns={comparisonColumns(t, locale)}
                rows={relocatedComparisonRows(load.data)}
                getRowKey={(row) => row.label}
                downloadFilename={deriveExportFilename(displayName, 'relocated-comparison', 'csv')}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
