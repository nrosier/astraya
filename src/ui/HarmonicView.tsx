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
import { GlossaryText } from './GlossaryText.js';
import { NumberField } from './primitives/NumberField.js';
import { DateField } from './primitives/DateField.js';
import { Select } from './primitives/Select.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { VARGA_PRESETS } from '../astrology/harmonics.js';
import { BODIES, bodyById } from '../astrology/bodies.js';
import {
  computeArcTransform,
  computeHarmonic,
  computeHarmonicAge,
  harmonicPositionProvenance,
  type HarmonicData,
  type HarmonicPositionProvenanceRow,
} from '../domain/harmonic.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { ChartDataView, PdfCreatorLink, pdfCreatorHref, type ChartOverlayContext } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { harmonicViewMessages } from './HarmonicView.messages.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import type { ChartData } from '../domain/chart-compute.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { formatDecimalExact, formatFixed, todayInputValue } from './format.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { useLocale } from './locale.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { useEngineBasisLine, withBasisItems } from './calculation-basis.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { orbsOf } from '../chart/extended-settings.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { ChartHelpTooltip } from './ChartHelpTooltip.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly data: ChartData;
      readonly provenance: readonly HarmonicPositionProvenanceRow[];
      /** The multiplier the chart was cast with: a whole number for a harmonic, the real number for an age or arc transform. */
      readonly harmonicNumber: number;
      /** The exact age in tropical years, for the age modes (#1407). */
      readonly ageInYears?: number;
    }
  | { readonly kind: 'error'; readonly message: string };

const CUSTOM = 'custom';
/**
 * The three modes beside the presets (#1407): Harmonic Age and Age+1 at a date, and the arc transform of two points. They
 * sit in the same picker as the Varga presets, so one screen serves every harmonic.
 */
const AGE = 'age';
const AGE_PLUS_ONE = 'age-plus-one';
const ARC_TRANSFORM = 'arc-transform';
/**
 * Above this harmonic the arc transform's other points are unreliable: a pair closer than 1° gives a harmonic over 360,
 * and every other point is off by that harmonic times the ephemeris error. The owner's choice (#1407, 2026-11-24), not a
 * sourced value; no source gives a limit.
 */
const ARC_TRANSFORM_WARNING_HARMONIC = 360;
/** The bodies the arc transform can pair: the luminaries and the planets, which every chart carries. */
const PAIRABLE_BODIES = BODIES.filter((body) => body.category === 'luminary' || body.category === 'planet');
const SUN_ID = PAIRABLE_BODIES.find((body) => body.key === 'sun')?.id ?? 0;
const MOON_ID = PAIRABLE_BODIES.find((body) => body.key === 'moon')?.id ?? 1;

function provenanceColumns(
  t: typeof harmonicViewMessages.en,
  nText: string,
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
      label: t.harmonicLongitudeLabel(nText),
      valueOf: (row) => row.harmonicLongitude,
      render: (row) => `${formatFixed(row.harmonicLongitude, 4)}°`,
    },
  ];
}

export function HarmonicView({
  personId,
  view,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(harmonicViewMessages);

  const [presetKey, setPresetKey] = useState<string>(VARGA_PRESETS[0]?.key ?? CUSTOM);
  const [customN, setCustomN] = useState<string>('5');
  const [locale] = useLocale();
  const [ageDate, setAgeDate] = useState<string>(todayInputValue);
  const [pointA, setPointA] = useState<number>(SUN_ID);
  const [pointB, setPointB] = useState<number>(MOON_ID);
  const preset = useMemo(() => VARGA_PRESETS.find((candidate) => candidate.key === presetKey), [presetKey]);
  const isAge = presetKey === AGE || presetKey === AGE_PLUS_ONE;
  const isArcTransform = presetKey === ARC_TRANSFORM;
  const isPlainHarmonic = !isAge && !isArcTransform;
  const n = preset !== undefined ? preset.n : Number.parseInt(customN, 10);
  // A whole harmonic must be a positive integer; the age modes need a date, and the arc transform two different points.
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(ageDate);
  const nValid = isAge ? dateValid : isArcTransform ? pointA !== pointB : Number.isInteger(n) && n >= 1;
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  // The multiplier on screen: the chosen whole harmonic, or, for the age and arc modes, the one the chart was cast with.
  const harmonicNumber = isPlainHarmonic ? n : load.kind === 'ready' ? load.harmonicNumber : undefined;
  const nText =
    harmonicNumber === undefined
      ? ''
      : isPlainHarmonic
        ? String(harmonicNumber)
        : formatDecimalExact(harmonicNumber, 2, locale);
  const pointName = (id: number): string => bodyDisplayName(bodyById(id)?.key ?? '', locale);
  const label = isAge
    ? harmonicNumber === undefined
      ? presetKey === AGE
        ? t.modeAge
        : t.modeAgePlusOne
      : (presetKey === AGE ? t.ageHarmonicLabel : t.agePlusOneHarmonicLabel)(nText, ageDate)
    : isArcTransform
      ? harmonicNumber === undefined
        ? t.modeArcTransform
        : t.arcTransformLabel(pointName(pointA), pointName(pointB), nText)
      : preset !== undefined
        ? preset.label
        : t.harmonicLabel(String(n));
  // Memoised: a new array each render (a change of view re-renders this screen) would redraw the wheel and drop a selection.
  const metaLines = useMemo(() => [label], [label]);

  const { provider } = useEphemerisProvider();
  const customPoints = useStableBy(person?.customPoints, (points) => JSON.stringify(points ?? []));
  // The aspects use the device's orbs (#590), as the natal chart does.
  const {
    settings: extendedSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const orbs = useStableBy(orbsOf(extendedSettings), (config) => JSON.stringify(config));
  // The harmonic chart calculates with the engine defaults, the person's orbs and rulers, at the harmonic on screen.
  const baseBasis = useEngineBasisLine(rulership, extendedSettings);
  // The arc transform's formula is Astraya's reading of Solar Fire §12.6, which gives none; the line says so (#1407).
  const basisLine = nValid
    ? withBasisItems(
        baseBasis,
        isArcTransform && harmonicNumber !== undefined ? `${label} (${t.arcTransformBasisNote})` : label,
      )
    : baseBasis;

  // Memoised (#1333): a new object each render reruns the overlay effect and drops the wheel selection, as on the natal chart.
  const overlayContext = useMemo(
    (): ChartOverlayContext | undefined =>
      provider === undefined || personMoment === undefined
        ? undefined
        : {
            moment: personMoment,
            provider,
            baseLabel: label,
            ...(customPoints === undefined ? {} : { options: { customPoints } }),
          },
    [provider, personMoment, label, customPoints],
  );

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
        const options = { ...orbs, ...(customPoints === undefined ? {} : { customPoints }) };
        if (isAge) {
          const [year, month, day] = ageDate.split('-').map(Number);
          if (year === undefined || month === undefined || day === undefined)
            throw new Error(`Invalid date: ${ageDate}`);
          const targetJd = await provider.julianDayFromUtc(year, month, day, 12, 0, 0);
          const result = await computeHarmonicAge(moment, targetJd, provider, {
            ...options,
            plusOne: presetKey === AGE_PLUS_ONE,
          });
          if (!effect.cancelled)
            setLoad({
              kind: 'ready',
              data: result.harmonic,
              provenance: harmonicPositionProvenance(result),
              harmonicNumber: result.harmonicNumber,
              ageInYears: result.ageInYears,
            });
          return;
        }
        if (isArcTransform) {
          const result = await computeArcTransform(moment, pointA, pointB, provider, options);
          if (!effect.cancelled)
            setLoad({
              kind: 'ready',
              data: result.harmonic,
              provenance: harmonicPositionProvenance(result),
              harmonicNumber: result.harmonicNumber,
            });
          return;
        }
        const data: HarmonicData = await computeHarmonic(moment, n, provider, options);
        if (!effect.cancelled)
          setLoad({
            kind: 'ready',
            data: data.harmonic,
            provenance: harmonicPositionProvenance(data),
            harmonicNumber: n,
          });
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
    n,
    nValid,
    customPoints,
    orbs,
    isAge,
    isArcTransform,
    presetKey,
    ageDate,
    pointA,
    pointB,
  ]);

  // The provenance table's CSV, offered in the page header (#887).
  useCsvExports(
    load.kind === 'ready' && person !== undefined && nValid
      ? [
          csvExportTable(
            'provenance',
            t.provenanceCaption,
            deriveExportFilename(
              person.displayName ? `${person.displayName} — ${label}` : label,
              'harmonic-provenance',
              'csv',
            ),
            provenanceColumns(t, nText),
            load.provenance,
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
        <PageHeader title={t.harmonicChartsFallback} titleTerm="harmonic" />
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName = person.displayName ? `${person.displayName} — ${label}` : label;

  // The page's one export (#915): the PDF creator, opened on this person, the harmonic chart and the view on screen.
  const creatorHref = pdfCreatorHref(personId, 'harmonic', view ?? 'wheel');

  return (
    <main className="shell shell--wide">
      <PageHeader
        title={person.displayName ? t.heading(person.displayName) : t.headingFallback}
        titleTerm="harmonic"
        titleAside={<ChartHelpTooltip explanation={t.hint} />}
        basis={basisLine}
      >
        <PdfCreatorLink href={creatorHref} />
      </PageHeader>
      <ChartTypeSelector personId={personId} type="harmonic" view={view} />
      {nValid && load.kind !== 'idle' && (
        <>
          <ChartDataView
            wheelHint={false}
            personId={personId}
            chartType="harmonic"
            load={load}
            displayName={displayName}
            showHouses
            metaLines={metaLines}
            rulership={rulership}
            view={view ?? 'wheel'}
            onViewChange={(next) => {
              changeChartView(personId, 'harmonic', next);
            }}
            buildViewHref={(next) => chartHref(personId, next, 'harmonic')}
            overlayContext={overlayContext}
          />
        </>
      )}

      {/* One control bar under the wheel (#1407): the chart select, the date and the computed readout side by side,
          clear of the Selection card, which only inspects chart elements. */}
      <div className="harmonic-control-bar">
        <Select
          label={t.divisionalChartLabel}
          value={presetKey}
          options={[
            ...VARGA_PRESETS.map((candidate) => ({ value: candidate.key, label: candidate.label })),
            { value: CUSTOM, label: t.customHarmonicOption },
            { value: AGE, label: t.modeAge },
            { value: AGE_PLUS_ONE, label: t.modeAgePlusOne },
            { value: ARC_TRANSFORM, label: t.modeArcTransform },
          ]}
          onChange={setPresetKey}
        />
        {presetKey === CUSTOM && (
          <NumberField label={t.harmonicNumberLabel} min={1} value={customN} onChange={setCustomN} />
        )}
        {isAge && <DateField label={t.ageDateLabel} value={ageDate} onChange={setAgeDate} />}
        {isAge && nValid && harmonicNumber !== undefined && (
          <output className="harmonic-control-bar-readout" data-testid="harmonic-age-readout">
            {label}
          </output>
        )}
        {isArcTransform && (
          <>
            <Select
              label={t.firstPointLabel}
              value={String(pointA)}
              options={PAIRABLE_BODIES.map((body) => ({
                value: String(body.id),
                label: bodyDisplayName(body.key, locale),
              }))}
              onChange={(value) => {
                setPointA(Number(value));
              }}
            />
            <Select
              label={t.secondPointLabel}
              value={String(pointB)}
              options={PAIRABLE_BODIES.map((body) => ({
                value: String(body.id),
                label: bodyDisplayName(body.key, locale),
              }))}
              onChange={(value) => {
                setPointB(Number(value));
              }}
            />
          </>
        )}
      </div>

      {preset !== undefined && <p className="hint">{t.presetDescriptions[preset.key] ?? preset.description}</p>}
      {presetKey === CUSTOM && !nValid && <StatusMessage kind="error">{t.invalidHarmonicNumber}</StatusMessage>}
      {isAge && <p className="hint">{presetKey === AGE ? t.ageDescription : t.agePlusOneDescription}</p>}
      {isAge && !dateValid && <StatusMessage kind="error">{t.invalidDate}</StatusMessage>}
      {isArcTransform && <p className="hint">{t.arcTransformDescription}</p>}
      {isArcTransform && !nValid && <StatusMessage kind="error">{t.arcTransformSamePoint}</StatusMessage>}
      {isArcTransform && load.kind === 'ready' && load.harmonicNumber > ARC_TRANSFORM_WARNING_HARMONIC && (
        <StatusMessage kind="partial">{t.arcTransformLargeHarmonic}</StatusMessage>
      )}

      {nValid && load.kind === 'ready' && (
        <>
          <p className="hint">{t.provenanceHint(nText)}</p>
          <SortableTable
            caption={t.provenanceCaption}
            columns={provenanceColumns(t, nText)}
            rows={load.provenance}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'harmonic-provenance', 'csv')}
          />
        </>
      )}

      {nValid && load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">
          <GlossaryText text={t.housesUndefined} />
        </StatusMessage>
      )}
    </main>
  );
}
