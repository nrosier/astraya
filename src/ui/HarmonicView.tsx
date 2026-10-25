/**
 * Harmonic and Vedic Varga (divisional) charts for a saved person (#170).
 *
 * A harmonic chart is a single synthetic chart derived from one natal chart, not a comparison
 * between two — like the composite chart (#169), this screen reuses `ChartDataView` wholesale
 * rather than the multi-wheel renderer. Unlike composite, there is only one input record, so the
 * in-screen picker here is the harmonic number rather than a second person: either a named Varga
 * preset (`VARGA_PRESETS`) or any positive integer, per the issue's "N selectable" ask.
 */
/**
 * @module HarmonicView
 * @purpose Renders the Harmonic & Varga (divisional) charts screen for a saved person: a chosen harmonic multiplies every longitude by a whole number and rebuilds whole-sign houses from the multiplied Ascendant.
 * @conventions A single synthetic chart derived from one natal chart (not a comparison), so it reuses `ChartDataView` wholesale like CompositeView/DraconicView; the in-screen picker is a named Varga preset (`VARGA_PRESETS`) or any positive integer, with a radix-to-result provenance table beside the derived chart. Text comes from co-located `HarmonicView.messages.ts` via `useMessages()`.
 * @exports HarmonicView
 */
import { GlossaryTerms } from './GlossaryTerm.js';
import { NumberField } from './primitives/NumberField.js';
import { Select } from './primitives/Select.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { VARGA_PRESETS } from '../astrology/harmonics.js';
import {
  computeHarmonic,
  harmonicPositionProvenance,
  type HarmonicData,
  type HarmonicPositionProvenanceRow,
} from '../domain/harmonic.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { ChartDataView } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { ReportView } from './ReportView.js';
import { harmonicViewMessages } from './HarmonicView.messages.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import type { ChartData } from '../domain/chart-compute.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { formatFixed } from './format.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { orbsOf } from '../chart/extended-settings.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { BackLink } from './BackLink.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData; readonly provenance: readonly HarmonicPositionProvenanceRow[] }
  | { readonly kind: 'error'; readonly message: string };

const CUSTOM = 'custom';

function provenanceColumns(
  t: typeof harmonicViewMessages.en,
  n: number,
): readonly TableColumn<HarmonicPositionProvenanceRow>[] {
  return [
    { key: 'bodyName', label: t.bodyLabel, valueOf: (row) => row.bodyName },
    {
      key: 'radixLongitude',
      label: t.radixLongitudeLabel,
      valueOf: (row) => row.radixLongitude,
      render: (row) => `${formatFixed(row.radixLongitude, 4)}°`,
    },
    {
      key: 'harmonicLongitude',
      label: t.harmonicLongitudeLabel(String(n)),
      valueOf: (row) => row.harmonicLongitude,
      render: (row) => `${formatFixed(row.harmonicLongitude, 4)}°`,
    },
  ];
}

// Comparison mode (compareType) will be implemented in a follow-up (#439)
export function HarmonicView({
  personId,
  view,
  compareType,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
  compareType?: ChartType | undefined;
}): React.JSX.Element {
  if (compareType !== undefined) {
    // TODO: implement comparison mode for harmonic charts (#439)
  }
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(harmonicViewMessages);

  const [presetKey, setPresetKey] = useState<string>(VARGA_PRESETS[0]?.key ?? CUSTOM);
  const [customN, setCustomN] = useState<string>('5');
  const preset = useMemo(() => VARGA_PRESETS.find((candidate) => candidate.key === presetKey), [presetKey]);
  const n = preset !== undefined ? preset.n : Number.parseInt(customN, 10);
  const nValid = Number.isInteger(n) && n >= 1;

  const label = preset !== undefined ? preset.label : t.harmonicLabel(String(n));
  // Memoised: a new array each render (a change of view re-renders this screen) would redraw the wheel and drop a selection.
  const metaLines = useMemo(() => [label], [label]);

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  const customPoints = useStableBy(person?.customPoints, (points) => JSON.stringify(points ?? []));
  // The aspects use the device's orbs (#590), as the natal chart does.
  const { settings: extendedSettings, unreadable: settingsUnreadable } = usePersonCalculationSettings(personId);
  const orbs = useStableBy(orbsOf(extendedSettings), (config) => JSON.stringify(config));

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable || !nValid) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const data: HarmonicData = await computeHarmonic(moment, n, provider, {
          ...orbs,
          ...(customPoints === undefined ? {} : { customPoints }),
        });
        if (!effect.cancelled)
          setLoad({ kind: 'ready', data: data.harmonic, provenance: harmonicPositionProvenance(data) });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, provider, n, nValid, customPoints, orbs]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <h1>{t.harmonicChartsFallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName = person.displayName ? `${person.displayName} — ${label}` : label;

  return (
    <main className="shell shell--wide">
      <BackLink fallback={personHref(personId)} />
      <h1>{person.displayName ? t.heading(person.displayName) : t.headingFallback}</h1>
      <GlossaryTerms terms={['harmonic', 'aspect', 'orb']} />
      <ChartTypeSelector personId={personId} type="harmonic" view={view} />
      <p className="hint">{t.hint}</p>

      <div className="field-grid">
        <Select
          label={t.divisionalChartLabel}
          value={presetKey}
          options={[
            ...VARGA_PRESETS.map((candidate) => ({ value: candidate.key, label: candidate.label })),
            { value: CUSTOM, label: t.customHarmonicOption },
          ]}
          onChange={setPresetKey}
        />
        {presetKey === CUSTOM && (
          <NumberField label={t.harmonicNumberLabel} min={1} value={customN} onChange={setCustomN} />
        )}
      </div>

      {preset !== undefined && <p className="hint">{t.presetDescriptions[preset.key] ?? preset.description}</p>}
      {presetKey === CUSTOM && !nValid && <StatusMessage kind="error">{t.invalidHarmonicNumber}</StatusMessage>}

      {nValid && load.kind !== 'idle' && (
        <>
          {load.kind === 'ready' && (
            <>
              <p className="hint">{t.provenanceHint(String(n))}</p>
              <SortableTable
                caption={t.provenanceCaption}
                columns={provenanceColumns(t, n)}
                rows={load.provenance}
                getRowKey={(row) => row.bodyKey}
                downloadFilename={deriveExportFilename(displayName, 'harmonic-provenance', 'csv')}
              />
            </>
          )}
          <ChartDataView
            personId={personId}
            chartType="harmonic"
            load={load}
            displayName={displayName}
            showHouses
            metaLines={metaLines}
            view={view ?? 'wheel'}
            onViewChange={(next) => {
              changeChartView(personId, 'harmonic', next);
            }}
            buildViewHref={(next) => chartHref(personId, next, 'harmonic')}
            overlayContext={
              provider === undefined
                ? undefined
                : {
                    moment: person.moment,
                    provider,
                    baseLabel: label,
                    ...(person.customPoints === undefined ? {} : { options: { customPoints: person.customPoints } }),
                  }
            }
          />
        </>
      )}

      {nValid && load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">{t.housesUndefined}</StatusMessage>
      )}
      {nValid && load.kind === 'ready' && housesAreDefined(load.data.houses) && (
        <ReportView personId={personId} chart={load.data} />
      )}
    </main>
  );
}
