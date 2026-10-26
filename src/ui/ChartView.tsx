/**
 * The chart wheel (#39/#40/#41/#42, wired into the UI here) plus data tables
 * for every quantity a chart computes (#44).
 *
 * Every number here is recalculated on the fly from the person's stored birth
 * moment — nothing is read from a saved `Chart`, because `Chart` holds no
 * computed positions by design (see `chart.ts`'s own doc comment) and no
 * screen yet exists to create one. `chart-compute.ts` does the one pass over
 * the ephemeris; `chart-tables.ts` shapes the result into the wheel ring and
 * the table rows below.
 *
 * The wheel and the houses/angles/derived-points tables are all built on the
 * Ascendant, so all of them are hidden when `person.timeAccuracy === 'unknown'`
 * — not merely approximated — matching the warning `PersonForm.tsx` already
 * gives about the same person: an unknown birth time makes them meaningless
 * rather than imprecise. Positions, aspects and dignities don't depend on the
 * Ascendant and stay available; the Positions table's own Ascendant/Midheaven
 * rows (folded in from what used to be a separate Angles table, matching
 * Astro-Seek's combined layout) are the one exception, gated by the same
 * `showHouses` flag rather than by the tab itself.
 *
 * The tables are grouped into tabs — one page per concern — rather than
 * stacked, since a chart's full data easily runs to six tables' worth of rows
 * and reading it top-to-bottom on every visit gets in the way of jumping
 * straight to, say, aspects. The WAI-ARIA APG's "manual activation" tabs
 * pattern is small enough to inline here rather than factor into its own
 * component for a single caller.
 */
/**
 * @module ChartView
 * @purpose Renders the natal chart screen: the chart wheel plus every data table a chart computes (positions, houses, aspects, dignities, dispositors, declinations, antiscia, fixed stars, chart shape, derived points), and the SVG/PNG/PDF export + share-link controls.
 * @conventions Exports `ChartDataView`, the shared tabbed chart+tables UI reused by CompositeView/SharedChartView; every value is recomputed from the stored birth moment via `domain/chart-compute.js`/`domain/chart-tables.js` rather than read from a saved Chart record; houses/angles/derived-points tables are hidden when `timeAccuracy === 'unknown'`. Text comes from co-located `ChartView.messages.ts` via `useMessages()`.
 * @exports ChartView, ChartDataView, emphasisColumns, positionColumns, houseCuspColumns, angleColumns, aspectColumns, dignityColumns, almutenCandidateColumns, conditionColumns, receptionColumns, dispositorColumns, declinationColumns, antisciaColumns, midpointTreeColumns, allMidpointsColumns, fixedStarColumns, fixedStarsScopeNoteOf, derivedPointColumns, houseSystemLabel, zodiacLabel, rulershipLabel
 */
import { formatFixed, formatOrb, formatTimestamp } from './format.js';
import { PrintProvenance } from './PrintProvenance.js';
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import type { Zodiac } from '../ephemeris/types.js';
import { ASPECTS, aspectHarmonicFamily, DEFAULT_ORB_CONFIG, type Aspect } from '../astrology/aspects.js';
import { Tooltip } from './primitives/Tooltip.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import { Select } from './primitives/Select.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allMidpointsRows,
  almutenOfAscendant,
  angleRows,
  antisciaRows,
  aspectRows,
  chartShapeOf,
  chartSheetInput,
  chartSheetMetaLines,
  chartWheelRing,
  conditionRows,
  declinationContactRows,
  derivedPointRows,
  EMPHASIS_MODALITIES,
  emphasisRows,
  dignityRows,
  dispositorRows,
  fixedStarRows,
  filterAspectRowsByHarmonicFamily,
  houseCuspRows,
  midpointTreeRows,
  positionRows,
  receptionRows,
  visiblePositions,
  type AllMidpointsRow,
  type AlmutenCandidateRow,
  type AngleRow,
  type AntisciaRow,
  type AspectRow,
  type ConditionRow,
  type DeclinationContactRow,
  type DerivedPointRow,
  type DignityRow,
  type DispositorRow,
  type EmphasisRow,
  type FixedStarRow,
  type HouseCuspRow,
  type MidpointTreeRow,
  type PointVisibilityOptions,
  type ReceptionRow,
  type PositionRow,
} from '../domain/chart-tables.js';
import { derivedPointPlacementFacts } from '../domain/derived-point-position.js';
import {
  computeChartData,
  housesAreDefined,
  NATAL_FIXED_STARS,
  type ChartCalculationOptions,
  type ChartData,
} from '../domain/chart-compute.js';
import { computeDraconic } from '../domain/draconic.js';
import { computeRelocatedChart } from '../domain/relocated-chart.js';
import { computeSecondaryProgression, type SecondaryProgressionData } from '../domain/secondary-progression.js';
import { computeTransit } from '../domain/transit.js';
import { computeLunarReturnChart, computeSolarReturnChart } from '../domain/return-chart.js';
import { directedChartAt, generatePrimaryDirections, type DirectedChart } from '../domain/primary-directions.js';
import { ageInYears } from '../astrology/progressions.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { buildCalculationSnapshot, calculationSnapshotIdentity } from '../domain/calculation-snapshot.js';
import { calculationArtifactIdentity, type CalculationArtifact } from '../domain/calculation-artifact.js';
import { buildChartArtifact } from './chart-artifact.js';
import { momentKey } from '../time/encode.js';
import { renderChartDialSvg, renderChartSheetSvg } from '../chart/chart-sheet.js';
import { renderMultiWheelSvg, type CrossRingAspects, type WheelRingInput } from '../chart/multi-wheel.js';
import { renderJonesShapeDiagramSvg } from '../chart/jones-shape-diagram.js';
import { lunarPhaseOf } from '../astrology/lunar-phase.js';
import { lotFormulaByKey } from '../astrology/arabic-parts.js';
import type { DignityType } from '../astrology/reception.js';
import { jonesBodyPositions } from '../astrology/jones-shapes.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  toSignWedgeStyle,
  type ExtendedSettings,
  settingsForContext,
} from '../chart/extended-settings.js';
import { standaloneSvg } from '../chart/standalone-svg.js';
import { resolveWheelDisplayOptions } from '../chart/wheel-options.js';
import { interpretationExclusions } from '../chart/object-policy.js';
import { AstroChartWheel } from './AstroChartWheel.js';
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { SIGNS } from '../astrology/signs.js';
import { besiegementRescueList } from './besiegement-rescue-label.js';
import { aspectDisplayName, bodyDisplayName, bodyShortName, signDisplayName } from './astro-names.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { svgToPngBlob } from './chart-raster.js';
import { downloadBlob, downloadText } from './download.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { ExtendedSettingsPanel } from './ExtendedSettingsPanel.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { useWheelIsolation } from './wheel-interaction.js';
import { bodyGlyph, renderGlyph } from '../chart/glyphs.js';
import type { SymbolClass } from '../chart/symbol-class.js';
import { unicodeSymbol, textSymbol } from '../chart/symbol-text.js';
import { findAspectPatterns, PATTERN_BODY_KEYS } from '../astrology/aspect-patterns.js';
import { useSymbolClass } from './symbol-setting.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useRegisterExports } from './export-registry.js';
import {
  CHART_VIEWS,
  chartViewLabels,
  isDerivedChartType,
  type ChartViewKind,
  type ChartType,
} from './chart-sections.js';
import { chartTypesMessages } from './ChartTypes.messages.js';
import { chartHref, personHref } from './route.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { ChartViewNav } from './ChartViewNav.js';
import { parseSelectionKey } from '../interpretation/selection.js';
import { buildFocusObjectContext } from '../interpretation/focus-context.js';
import { AspectMatrix } from './AspectMatrix.js';
import { orbSourceName, useCalculationBasisLine } from './calculation-basis.js';
import { EmphasisGrid } from './EmphasisGrid.js';
import {
  aspectSelectionKey,
  bodySelectionKey,
  derivedSelectionKey,
  houseSelectionKey,
  selectColumn,
  signSelectionKey,
  type TableSelection,
} from './table-selection.js';
import { SelectionInspector, type WheelIsolationFacts } from './SelectionInspector.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { BoundsScheme } from '../astrology/bounds.js';
import { PageHeader } from './PageHeader.js';
import { PersonNotFound } from './PersonNotFound.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import type { EphemerisProvider } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import type { BirthMomentInput } from '../time/types.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import {
  ChartOverlaySettingsPanel,
  DEFAULT_CHART_OVERLAY_SETTINGS,
  hasChartOverlays,
  orderedChartOverlaySources,
  type ChartOverlaySettings,
  type ChartOverlaySource,
} from './ChartOverlaySettingsPanel.js';
import { chartOverlaySettingsPanelMessages } from './ChartOverlaySettingsPanel.messages.js';
import { CustomPointEditor } from './CustomPointEditor.js';
import { parseCoordinate } from './map-settings.js';
import { orbConfigForContext } from '../astrology/orb-profiles.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { BackLink } from './BackLink.js';

type Load =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly data: ChartData;
      /** The completed calculation's artifact (#582), when its builder had one to give. */
      readonly artifact?: CalculationArtifact | undefined;
    }
  | { readonly kind: 'error'; readonly message: string };

/** The fingerprint printed with a chart: the artifact's when there is one, else the snapshot's own tag. */
function provenanceIdentity(load: Load, settings: ExtendedSettings, rulership: RulershipChoice): string {
  return load.kind === 'ready' && load.artifact !== undefined
    ? calculationArtifactIdentity(load.artifact)
    : calculationSnapshotIdentity(buildCalculationSnapshot(settings, rulership));
}

export interface ChartOverlayContext {
  readonly moment: BirthMomentInput;
  readonly provider: EphemerisProvider;
  readonly baseLabel: string;
  readonly baseSource?: ChartOverlaySource | undefined;
  /** The active calculation basis shared by every computed overlay ring. */
  readonly options?: ChartCalculationOptions | undefined;
}

interface OverlayRingData {
  readonly label: string;
  readonly data?: ChartData | undefined;
  readonly provenance: string;
}

type OverlayLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly markup: string; readonly ringData: readonly OverlayRingData[] }
  | { readonly kind: 'error'; readonly message: string };

function progressedOverlayRing(data: SecondaryProgressionData, label: string): WheelRingInput {
  return {
    label,
    houses: data.houses,
    bodies: data.positions.map((position) => ({
      body: position.body,
      key: bodyById(position.body)?.key ?? String(position.body),
      longitude: position.longitude,
      retrograde: position.retrograde,
    })),
  };
}

function directedOverlayRing(data: DirectedChart, label: string): WheelRingInput {
  return {
    label,
    houses: data.houses,
    bodies: data.positions.map((position) => ({
      body: position.body,
      key: position.key,
      longitude: position.longitude,
    })),
  };
}

function dateParts(value: string): readonly [number, number, number] | undefined {
  const [year, month, day] = value.split('-').map(Number);
  return year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
    ? undefined
    : [year, month, day];
}

/**
 * Plain, synchronous labels for the print-provenance footer (#564) — deliberately not the same
 * localized/async-fetched names `ExtendedSettingsPanel.tsx`'s own `useNameLookup` resolves via
 * `provider.houseSystemName`/`ayanamsaName`: a footer repeated on every printed page should
 * never depend on an ephemeris-provider round trip succeeding, and `HouseSystemDefinition.key`
 * is already a readable (if English-only) identifier with no further lookup needed. Exported so
 * the bi-wheel screens that don't route through `ChartDataView` (`SynastryView.tsx`,
 * `TransitView.tsx`, `PrimaryDirectionsView.tsx`) can build their own footer with the same labels.
 */
export function houseSystemLabel(code: string): string {
  const key = HOUSE_SYSTEMS.find((system) => system.code === code)?.key ?? code;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function zodiacLabel(zodiac: Zodiac): string {
  return zodiac.kind === 'tropical' ? 'Tropical' : `Sidereal (ayanamsa ${String(zodiac.ayanamsa)})`;
}

export function rulershipLabel(rulership: string): string {
  return rulership.charAt(0).toUpperCase() + rulership.slice(1);
}

const degreeColumns = <
  T extends { readonly sign: string; readonly degree: number; readonly minute: number; readonly second: number },
>(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<T>[] => [
  {
    key: 'sign',
    label: t.signLabel,
    valueOf: (row) => row.sign,
    render: (row) => signDisplayName(row.sign, locale),
  },
  { key: 'degree', label: t.degLabel, valueOf: (row) => row.degree },
  { key: 'minute', label: t.minLabel, valueOf: (row) => row.minute },
  { key: 'second', label: t.secLabel, valueOf: (row) => row.second },
];

/**
 * A body's symbol in a table cell, in the class the reader chose (#419): a small drawn glyph, the Unicode
 * character, or the three-letter code. The accessible name comes from the body's own name column, so the
 * cell is hidden from assistive technology rather than read as "SUN" or a stray character.
 */
function symbolCell(bodyKey: string, fallback: string, symbolClass: SymbolClass): React.ReactNode {
  const definition = bodyGlyph(bodyKey);
  if (definition === undefined) return fallback;
  if (symbolClass === 'text') {
    return (
      <span className="table-symbol-text" aria-hidden="true">
        {textSymbol('body', bodyKey) ?? fallback}
      </span>
    );
  }
  if (symbolClass === 'unicode') {
    return <span aria-hidden="true">{unicodeSymbol('body', bodyKey) ?? fallback}</span>;
  }
  return (
    <svg
      className="table-symbol"
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      // Generated by this app from its own glyph registry, never user-supplied markup.
      dangerouslySetInnerHTML={{ __html: renderGlyph(definition, 50, 50, 100, 'chart-glyph') }}
    />
  );
}

export function positionColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
  symbolClass: SymbolClass,
  selection?: TableSelection,
): readonly TableColumn<PositionRow>[] {
  return [
    ...(selection === undefined
      ? []
      : [
          selectColumn<PositionRow>(
            t,
            selection,
            (row) => (selection.selectableBodies.has(row.bodyKey) ? bodySelectionKey(row.bodyKey) : undefined),
            (row) => bodyDisplayName(row.bodyKey, locale),
          ),
        ]),
    {
      key: 'glyph',
      label: t.symbolLabel,
      valueOf: (row) => row.glyph,
      renderCell: (row) => symbolCell(row.bodyKey, row.glyph, symbolClass),
    },
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    ...degreeColumns<PositionRow>(t, locale),
    // A sign has no table of its own, so its keyboard route to the wheel's sign selection is here, beside the sign it names (#511).
    ...(selection === undefined
      ? []
      : [
          selectColumn<PositionRow>(
            t,
            selection,
            (row) => signSelectionKey(row.sign),
            (row) => signDisplayName(row.sign, locale),
            { key: 'selectSign', column: t.showSignColumn, button: t.showSignButton },
          ),
        ]),
    {
      key: 'house',
      label: t.houseLabel,
      align: 'end',
      valueOf: (row) => row.house ?? '',
      render: (row) => (row.house === undefined ? '—' : String(row.house)),
    },
    {
      key: 'speed',
      label: t.speedLabel,
      labelTooltip: t.speedTooltip,
      align: 'end',
      valueOf: (row) => row.speed ?? '',
      render: (row) => (row.speed === undefined ? '—' : formatFixed(row.speed, 4)),
    },
    {
      key: 'retrograde',
      label: t.rxLabel,
      labelTooltip: t.retrogradeTooltip,
      valueOf: (row) => row.retrograde ?? false,
      // Inside the station window (#724) the station marker replaces ℞; with the window off, `stationary` is never set.
      render: (row) =>
        row.stationary === true
          ? row.stationType === 'first'
            ? t.stationFirstMarker
            : row.stationType === 'second'
              ? t.stationSecondMarker
              : t.stationMarker
          : row.retrograde
            ? '℞'
            : '',
    },
    {
      key: 'anaretic',
      label: t.anareticLabel,
      valueOf: (row) => row.anaretic,
      align: 'center',
      render: (row) => (row.anaretic ? '✓' : ''),
    },
    {
      key: 'outOfBounds',
      label: t.outOfBoundsLabel,
      valueOf: (row) => row.outOfBounds ?? false,
      align: 'center',
      render: (row) => (row.outOfBounds === true ? '✓' : ''),
    },
  ];
}

export function houseCuspColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
  selection?: TableSelection,
): readonly TableColumn<HouseCuspRow>[] {
  return [
    ...(selection === undefined
      ? []
      : [
          selectColumn<HouseCuspRow>(
            t,
            selection,
            (row) => houseSelectionKey(row.house),
            (row) => `${t.houseLabel} ${String(row.house)}`,
          ),
        ]),
    { key: 'house', label: t.houseLabel, valueOf: (row) => row.house },
    ...degreeColumns<HouseCuspRow>(t, locale),
  ];
}

export function angleColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<AngleRow>[] {
  return [{ key: 'label', label: t.angleLabel, valueOf: (row) => row.label }, ...degreeColumns<AngleRow>(t, locale)];
}

export function aspectColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
  selection?: TableSelection,
): readonly TableColumn<AspectRow>[] {
  return [
    ...(selection === undefined
      ? []
      : [
          selectColumn<AspectRow>(
            t,
            selection,
            (row) =>
              selection.selectableBodies.has(row.bodyAKey) && selection.selectableBodies.has(row.bodyBKey)
                ? aspectSelectionKey(row)
                : undefined,
            (row) =>
              `${bodyDisplayName(row.bodyAKey, locale)} ${aspectDisplayName(row.aspectKey, locale)} ${bodyDisplayName(row.bodyBKey, locale)}`,
          ),
        ]),
    {
      key: 'bodyAName',
      label: t.bodyALabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'aspect',
      label: t.aspectLabel,
      labelTooltip: t.aspectTooltip,
      valueOf: (row) => row.aspect,
      render: (row) => aspectDisplayName(row.aspectKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.bodyBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
    {
      key: 'applying',
      label: t.applyingLabel,
      labelTooltip: t.applyingTooltip,
      valueOf: (row) => row.applying,
      render: (row) => (row.applying ? t.applying : t.separating),
    },
    {
      key: 'harmonicFamily',
      label: t.harmonicFamilyLabel,
      labelTooltip: t.harmonicFamilyTooltip,
      valueOf: (row) => aspectHarmonicFamily(row.aspectKey) ?? 0,
      render: (row) => {
        const family = aspectHarmonicFamily(row.aspectKey);
        return family === undefined ? '' : `H${String(family)}`;
      },
    },
  ];
}

/** The Houses table's selected row: the house whose cusp the wheel has selected, if any. */
function selectedHouseRowKey(data: ChartData, selection: TableSelection | undefined): string | undefined {
  const row = houseCuspRows(data).find((candidate) => houseSelectionKey(candidate.house) === selection?.selectedKey);
  return row === undefined ? undefined : String(row.house);
}

export function dignityColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<DignityRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'ruler',
      label: t.rulerLabel,
      labelTooltip: t.rulerTooltip,
      valueOf: (row) => row.ruler,
      align: 'center',
      render: (row) => (row.ruler ? '✓' : ''),
    },
    {
      key: 'exalted',
      label: t.exaltedLabel,
      labelTooltip: t.exaltedTooltip,
      valueOf: (row) => row.exalted,
      align: 'center',
      render: (row) => (row.exalted ? '✓' : ''),
    },
    {
      key: 'detriment',
      label: t.detrimentLabel,
      labelTooltip: t.detrimentTooltip,
      valueOf: (row) => row.detriment,
      align: 'center',
      render: (row) => (row.detriment ? '✓' : ''),
    },
    {
      key: 'fall',
      label: t.fallLabel,
      labelTooltip: t.fallTooltip,
      valueOf: (row) => row.fall,
      align: 'center',
      render: (row) => (row.fall ? '✓' : ''),
    },
    {
      key: 'triplicity',
      label: t.triplicityLabel,
      labelTooltip: t.triplicityTooltip,
      valueOf: (row) => row.triplicity,
      align: 'center',
      render: (row) => (row.triplicity ? '✓' : ''),
    },
    {
      key: 'bound',
      label: t.boundLabel,
      labelTooltip: t.boundTooltip,
      valueOf: (row) => row.bound,
      align: 'center',
      render: (row) => (row.bound ? '✓' : ''),
    },
    {
      key: 'face',
      label: t.faceLabel,
      labelTooltip: t.faceTooltip,
      valueOf: (row) => row.face,
      align: 'center',
      render: (row) => (row.face ? '✓' : ''),
    },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
    {
      key: 'peregrine',
      label: t.peregrineLabel,
      labelTooltip: t.peregrineTooltip,
      valueOf: (row) => row.peregrine,
      align: 'center',
      render: (row) => (row.peregrine ? '✓' : ''),
    },
  ];
}

/** Every Almuten-of-the-Ascendant candidate's own score breakdown (#551) — not only the winner's name. */
export function almutenCandidateColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<AlmutenCandidateRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'ruler',
      label: t.rulerLabel,
      valueOf: (row) => row.ruler,
      align: 'center',
      render: (row) => (row.ruler ? '✓' : ''),
    },
    {
      key: 'exalted',
      label: t.exaltedLabel,
      valueOf: (row) => row.exalted,
      align: 'center',
      render: (row) => (row.exalted ? '✓' : ''),
    },
    {
      key: 'triplicity',
      label: t.triplicityLabel,
      valueOf: (row) => row.triplicity,
      align: 'center',
      render: (row) => (row.triplicity ? '✓' : ''),
    },
    {
      key: 'bound',
      label: t.boundLabel,
      valueOf: (row) => row.bound,
      align: 'center',
      render: (row) => (row.bound ? '✓' : ''),
    },
    {
      key: 'face',
      label: t.faceLabel,
      valueOf: (row) => row.face,
      align: 'center',
      render: (row) => (row.face ? '✓' : ''),
    },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
  ];
}

/** The traditional planetary-condition table (#547) — sect alignment, angularity, hayz, motion, besiegement, solar phase/proximity. */
export function conditionColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
  motionScoreVisible = false,
): readonly TableColumn<ConditionRow>[] {
  const sectAlignmentLabel = (row: ConditionRow): string =>
    row.sectAlignment === 'ofSect' ? t.ofSect : row.sectAlignment === 'contraSect' ? t.contraSect : t.sectNeutral;
  const angularityLabel = (row: ConditionRow): string =>
    row.angularity === 'angular'
      ? t.angular
      : row.angularity === 'succedent'
        ? t.succedent
        : row.angularity === 'cadent'
          ? t.cadent
          : '—';
  const motionLabel = (row: ConditionRow): string =>
    row.motion === 'retrograde'
      ? t.retrogradeLabel
      : row.motion === 'stationary'
        ? row.stationType === 'first'
          ? t.stationaryFirstLabel
          : row.stationType === 'second'
            ? t.stationarySecondLabel
            : t.stationaryLabel
        : t.directLabel;
  const solarPhaseLabel = (row: ConditionRow): string =>
    row.solarPhase === 'oriental' ? t.oriental : row.solarPhase === 'occidental' ? t.occidental : '—';
  const solarConditionLabel = (row: ConditionRow): string =>
    row.solarCondition === 'cazimi'
      ? t.cazimi
      : row.solarCondition === 'combust'
        ? t.combust
        : row.solarCondition === 'underTheBeams'
          ? t.underTheBeams
          : row.solarCondition === 'free'
            ? t.solarConditionFree
            : '—';
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
    {
      key: 'peregrine',
      label: t.peregrineLabel,
      labelTooltip: t.peregrineTooltip,
      valueOf: (row) => row.peregrine,
      align: 'center',
      render: (row) => (row.peregrine ? '✓' : ''),
    },
    {
      key: 'sectAlignment',
      label: t.sectAlignmentLabel,
      labelTooltip: t.sectAlignmentTooltip,
      valueOf: (row) => row.sectAlignment,
      render: sectAlignmentLabel,
    },
    {
      key: 'angularity',
      label: t.angularityLabel,
      labelTooltip: t.angularityTooltip,
      valueOf: (row) => row.angularity ?? '',
      render: angularityLabel,
    },
    { key: 'motion', label: t.motionLabel, valueOf: (row) => row.motion, render: motionLabel },
    // Only with the motion score on (#724), so the table is unchanged while it is off.
    ...(motionScoreVisible
      ? [
          {
            key: 'motionScore',
            label: t.motionScoreLabel,
            labelTooltip: t.motionScoreTooltip,
            valueOf: (row: ConditionRow) => row.motionScore ?? '',
            align: 'center' as const,
            render: (row: ConditionRow) =>
              row.motionScore === undefined
                ? '—'
                : row.motionScore > 0
                  ? `+${String(row.motionScore)}`
                  : String(row.motionScore),
          },
        ]
      : []),
    {
      key: 'inHayz',
      label: t.hayzLabel,
      labelTooltip: t.hayzTooltip,
      valueOf: (row) => row.inHayz ?? false,
      align: 'center',
      render: (row) => (row.inHayz === true ? '✓' : row.inHayz === false ? '' : '—'),
    },
    {
      key: 'besieged',
      label: t.besiegedLabel,
      labelTooltip: t.besiegedTooltip,
      valueOf: (row) => row.besieged,
      align: 'center',
      render: (row) =>
        !row.besieged
          ? ''
          : row.besiegementRescuedBy === undefined
            ? '✓'
            : `✓ (${t.besiegedEased(besiegementRescueList(row.besiegementRescuedBy, locale))})`,
    },
    {
      key: 'solarPhase',
      label: t.solarPhaseLabel,
      labelTooltip: t.solarPhaseTooltip,
      valueOf: (row) => row.solarPhase ?? '',
      render: solarPhaseLabel,
    },
    {
      key: 'solarCondition',
      label: t.solarConditionLabel,
      labelTooltip: t.solarConditionTooltip,
      valueOf: (row) => row.solarCondition ?? '',
      render: solarConditionLabel,
    },
  ];
}

export function dispositorColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<DispositorRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'chain',
      label: t.chainLabel,
      valueOf: (row) =>
        row.chain.map((key) => bodyByKey(key)?.name ?? key).join(' → ') +
        (row.coDispositorKey === undefined
          ? ''
          : ` (+ ${bodyByKey(row.coDispositorKey)?.name ?? row.coDispositorKey})`),
      render: (row) =>
        row.chain.map((key) => bodyDisplayName(key, locale)).join(' → ') +
        (row.coDispositorKey === undefined ? '' : ` (+ ${bodyDisplayName(row.coDispositorKey, locale)})`),
    },
    {
      key: 'finalDispositorName',
      label: t.finalDispositorLabel,
      valueOf: (row) => row.finalDispositorName ?? '',
      render: (row) => (row.finalDispositorKey === undefined ? '—' : bodyDisplayName(row.finalDispositorKey, locale)),
    },
    { key: 'cycle', label: t.cycleLabel, valueOf: (row) => row.cycle, render: (row) => (row.cycle ? '✓' : '') },
    {
      key: 'mutualReception',
      label: t.mutualReceptionLabel,
      valueOf: (row) => row.mutualReception,
      align: 'center',
      render: (row) => (row.mutualReception ? '✓' : ''),
    },
  ];
}

/** Short, translated dignity-type name, reusing the exact labels `dignityColumns`' own headers already use. */
function dignityTypeLabel(t: typeof chartViewMessages.en, dignityType: DignityType): string {
  switch (dignityType) {
    case 'domicile':
      return t.rulerLabel;
    case 'exaltation':
      return t.exaltedLabel;
    case 'triplicity':
      return t.triplicityLabel;
    case 'bound':
      return t.boundLabel;
    case 'face':
      return t.faceLabel;
    default:
      return dignityType;
  }
}

/** Every receiving pair among the traditional planets (#548) — mutual/one-way reception, by which dignity, and whether the pair is also in aspect. */
export function receptionColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<ReceptionRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.bodyALabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.bodyBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    {
      key: 'kind',
      label: t.receptionKindLabel,
      valueOf: (row) => row.kind,
      render: (row) => (row.kind === 'mutual' ? t.mutualReceptionKind : t.oneWayReceptionKind),
    },
    {
      key: 'aFromBTypes',
      label: t.receptionAFromBLabel,
      valueOf: (row) => row.aFromBTypes.join(','),
      render: (row) => row.aFromBTypes.map((type) => dignityTypeLabel(t, type)).join(', '),
    },
    {
      key: 'bFromATypes',
      label: t.receptionBFromALabel,
      valueOf: (row) => row.bFromATypes.join(','),
      render: (row) => row.bFromATypes.map((type) => dignityTypeLabel(t, type)).join(', '),
    },
    {
      key: 'sameDignityType',
      label: t.receptionSameTypeLabel,
      labelTooltip: t.receptionSameTypeTooltip,
      valueOf: (row) => row.sameDignityType,
      align: 'center',
      render: (row) => (row.sameDignityType ? '✓' : ''),
    },
    {
      key: 'aspectLinked',
      label: t.aspectLinkedLabel,
      labelTooltip: t.aspectLinkedTooltip,
      valueOf: (row) => row.aspectLinked,
      align: 'center',
      render: (row) => (row.aspectLinked ? '✓' : ''),
    },
  ];
}

export function declinationColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<DeclinationContactRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.bodyALabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.bodyBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    {
      key: 'kind',
      label: t.kindLabel,
      labelTooltip: t.declinationKindTooltip,
      valueOf: (row) => row.kind,
      render: (row) => t[row.kind],
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
  ];
}

export function antisciaColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<AntisciaRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'contactName',
      label: t.contactLabel,
      valueOf: (row) => row.contactName,
      render: (row) => bodyDisplayName(row.contactKey, locale),
    },
    {
      key: 'kind',
      label: t.kindLabel,
      labelTooltip: t.antisciaKindTooltip,
      valueOf: (row) => row.kind,
      render: (row) => (row.kind === 'antiscion' ? t.antiscion : t.contraAntiscion),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
  ];
}

/**
 * The 90°-dial midpoint-tree table's columns (#556): which body sits on which pair's dial
 * point, the midpoint longitude itself (sign/degree/minute/second, reusing `degreeColumns`),
 * and the orb of the hit.
 */
export function midpointTreeColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<MidpointTreeRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    {
      key: 'pair',
      label: t.pairLabel,
      valueOf: (row) => `${row.pairAName}/${row.pairBName}`,
      render: (row) => `${bodyDisplayName(row.pairAKey, locale)}/${bodyDisplayName(row.pairBKey, locale)}`,
    },
    ...degreeColumns<MidpointTreeRow>(t, locale),
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
  ];
}

/** The all-pairs midpoint table's columns (#555): every body pair's near ("direct") and far ("indirect") midpoint. */
export function allMidpointsColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
): readonly TableColumn<AllMidpointsRow>[] {
  return [
    {
      key: 'bodyAName',
      label: t.bodyALabel,
      valueOf: (row) => row.bodyAName,
      render: (row) => bodyDisplayName(row.bodyAKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.bodyBLabel,
      valueOf: (row) => row.bodyBName,
      render: (row) => bodyDisplayName(row.bodyBKey, locale),
    },
    {
      key: 'kind',
      label: t.kindLabel,
      labelTooltip: t.midpointKindTooltip,
      valueOf: (row) => row.kind,
      render: (row) => (row.kind === 'direct' ? t.directMidpoint : t.indirectMidpoint),
    },
    ...degreeColumns<AllMidpointsRow>(t, locale),
  ];
}

/** The sentence that says the fixed-star table covers only `NATAL_FIXED_STARS` (#725), for the screen and the PDF alike. */
export function fixedStarsScopeNoteOf(t: typeof chartViewMessages.en): string {
  return t.fixedStarsScopeNote(NATAL_FIXED_STARS.length, NATAL_FIXED_STARS.join(', '));
}

export function fixedStarColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<FixedStarRow>[] {
  return [
    // Star names (Regulus, Spica, ...) are proper nouns, the same in both locales — no glossary
    // lookup needed, unlike body/aspect names.
    { key: 'star', label: t.starLabel, labelTooltip: t.starTooltip, valueOf: (row) => row.star },
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => formatOrb(row.orb) },
  ];
}

export function derivedPointColumns(
  t: typeof chartViewMessages.en,
  locale: Locale,
  selection?: TableSelection,
): readonly TableColumn<DerivedPointRow>[] {
  return [
    ...(selection === undefined
      ? []
      : [
          selectColumn<DerivedPointRow>(
            t,
            selection,
            (row) => derivedSelectionKey(row.pointKey),
            (row) => row.label,
          ),
        ]),
    { key: 'label', label: t.pointLabel, labelTooltip: t.derivedPointTooltip, valueOf: (row) => row.label },
    ...degreeColumns<DerivedPointRow>(t, locale),
    {
      key: 'formula',
      label: t.lotFormulaLabel,
      labelTooltip: t.lotFormulaTooltip,
      valueOf: (row) => {
        const formula = row.pointKey === undefined ? undefined : lotFormulaByKey(row.pointKey);
        return formula === undefined ? '' : `${formula.dayFormula} / ${formula.nightFormula}`;
      },
    },
  ];
}

/** The element x modality table's columns: the element, the bodies in each modality, and the totals. */
export function emphasisColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<EmphasisRow>[] {
  const rowName = (row: EmphasisRow): string =>
    row.rowKey === 'total' ? t.emphasisTotalLabel : t.elementNames[row.rowKey];
  return [
    { key: 'element', label: t.emphasisElementLabel, valueOf: rowName },
    ...EMPHASIS_MODALITIES.map((modality): TableColumn<EmphasisRow> => ({
      key: modality,
      label: t.modalityNames[modality],
      valueOf: (row) => row.counts[modality],
      render: (row) =>
        row.rowKey === 'total'
          ? String(row.counts[modality])
          : row.bodies[modality].length === 0
            ? t.emphasisNone
            : row.bodies[modality].map((bodyKey) => bodyShortName(bodyKey, locale)).join(', '),
    })),
    { key: 'total', label: t.emphasisTotalLabel, valueOf: (row) => row.total },
  ];
}

/** The Elements & modalities view (#511): the exported sheet's grid, and the same twelve cells as a table. */
function renderElementsView(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  t: typeof chartViewMessages.en,
  locale: Locale,
): React.ReactNode {
  const input = chartSheetInput(data, [], displayName, pointVisibility, (bodyKey) => bodyShortName(bodyKey, locale));
  return (
    <>
      <p className="hint">{t.emphasisHint}</p>
      <EmphasisGrid input={input.emphasis} />
      <SortableTable
        caption={t.emphasisCaption}
        columns={emphasisColumns(t, locale)}
        rows={emphasisRows(data, pointVisibility)}
        getRowKey={(row) => row.rowKey}
        downloadFilename={deriveExportFilename(displayName, 'elements-modalities', 'csv')}
      />
    </>
  );
}

/** The Aspect matrix view (#511): the sheet's own grid, its aspect cells selecting that pair on the wheel. */
function renderMatrixView(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  t: typeof chartViewMessages.en,
  locale: Locale,
  selection?: TableSelection,
): React.ReactNode {
  const input = chartSheetInput(data, [], displayName, pointVisibility, (bodyKey) => bodyShortName(bodyKey, locale));
  return (
    <>
      <p className="hint">{t.matrixHint}</p>
      <AspectMatrix
        input={input.matrix}
        label={t.matrixLabel}
        selection={
          selection === undefined
            ? undefined
            : {
                selectedKey: selection.selectedKey,
                onToggle: selection.onToggle,
                canSelect: (aKey, bKey) => selection.selectableBodies.has(aKey) && selection.selectableBodies.has(bKey),
                describe: (aKey, bKey, aspectKey) =>
                  `${bodyDisplayName(aKey, locale)} ${aspectDisplayName(aspectKey, locale)} ${bodyDisplayName(bKey, locale)}`,
              }
        }
      />
    </>
  );
}

/** The granular table kinds `renderTableTab` knows how to build (#511: these are grouped into the Aspects/Placements/Patterns views, not shown as separate tabs). */
type TableTabKey = 'positions' | 'houses' | 'aspects' | 'dignities' | 'derived';

const HARMONIC_FAMILY_FILTERS = Array.from(
  new Set(
    ASPECTS.map((aspect) => aspectHarmonicFamily(aspect.key)).filter(
      (family): family is number => family !== undefined,
    ),
  ),
).sort((a, b) => a - b);

/**
 * The table(s) for one tab, factored out of the tab panel below so the same markup can also
 * be stacked for every tab at once in the PDF export (#67) without being duplicated.
 */
function renderTableTab(
  tab: TableTabKey,
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  showHouses: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
  rulership: RulershipChoice,
  symbolClass: SymbolClass,
  boundsScheme: BoundsScheme,
  selection?: TableSelection,
  aspectHarmonicFamilyFilter?: number,
): React.ReactNode {
  switch (tab) {
    case 'positions':
      return (
        <>
          <SortableTable
            caption={t.positionsCaption}
            columns={positionColumns(t, locale, symbolClass, selection)}
            rows={positionRows(data, pointVisibility, showHouses)}
            getRowKey={(row) => row.bodyKey}
            selectedRowKey={
              selection?.selectedKey === undefined
                ? undefined
                : positionRows(data, pointVisibility, showHouses).find(
                    (row) => bodySelectionKey(row.bodyKey) === selection.selectedKey,
                  )?.bodyKey
            }
            downloadFilename={deriveExportFilename(displayName, 'positions', 'csv')}
          />
          {/* With the station window on (#724), say what the St. markers are: the window is an Astraya convention. */}
          {data.stationStates !== undefined && <p className="hint">{t.stationWindowNote}</p>}
        </>
      );
    case 'houses':
      return (
        <>
          <SortableTable
            caption={t.housesCaption}
            captionTerm="houses"
            columns={houseCuspColumns(t, locale, selection)}
            rows={houseCuspRows(data)}
            getRowKey={(row) => String(row.house)}
            selectedRowKey={selectedHouseRowKey(data, selection)}
            downloadFilename={deriveExportFilename(displayName, 'houses', 'csv')}
          />
          <SortableTable
            caption={t.anglesCaption}
            columns={angleColumns(t, locale)}
            rows={angleRows(data, pointVisibility)}
            getRowKey={(row) => row.label}
            downloadFilename={deriveExportFilename(displayName, 'angles', 'csv')}
          />
        </>
      );
    case 'aspects': {
      const rows = filterAspectRowsByHarmonicFamily(aspectRows(data, pointVisibility), aspectHarmonicFamilyFilter);
      const declinationRows = declinationContactRows(data);
      const antiscionRows = antisciaRows(data);
      const starRows = fixedStarRows(data, pointVisibility);
      const midpointTreeHitRows =
        pointVisibility.dial90Visible === true ? midpointTreeRows(data, pointVisibility.midpointTreeOrb) : [];
      const allMidpointRows = pointVisibility.midpointsVisible === true ? allMidpointsRows(data) : [];
      return (
        <>
          <SortableTable
            caption={t.aspectsCaption}
            captionTerm="aspect"
            columns={aspectColumns(t, locale, selection)}
            rows={rows}
            getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
            selectedRowKey={(() => {
              const chosen =
                selection?.selectedKey === undefined
                  ? undefined
                  : rows.find((row) => aspectSelectionKey(row) === selection.selectedKey);
              return chosen === undefined ? undefined : `${chosen.bodyAKey}-${chosen.aspect}-${chosen.bodyBKey}`;
            })()}
            downloadFilename={deriveExportFilename(displayName, 'aspects', 'csv')}
          />
          {antiscionRows.length > 0 && (
            <SortableTable
              caption={t.antisciaCaption}
              columns={antisciaColumns(t, locale)}
              rows={antiscionRows}
              getRowKey={(row) => `${row.bodyKey}-${row.kind}-${row.contactKey}`}
              downloadFilename={deriveExportFilename(displayName, 'antiscia', 'csv')}
            />
          )}
          {declinationRows.length > 0 && (
            <SortableTable
              caption={t.declinationsCaption}
              captionTerm="declination"
              columns={declinationColumns(t, locale)}
              rows={declinationRows}
              getRowKey={(row) => `${row.bodyAKey}-${row.kind}-${row.bodyBKey}`}
              downloadFilename={deriveExportFilename(displayName, 'declinations', 'csv')}
            />
          )}
          {starRows.length > 0 && (
            <>
              <SortableTable
                caption={t.fixedStarsCaption}
                columns={fixedStarColumns(t, locale)}
                rows={starRows}
                getRowKey={(row) => `${row.star}-${row.bodyKey}`}
                downloadFilename={deriveExportFilename(displayName, 'fixed-stars', 'csv')}
              />
              <p className="hint">{fixedStarsScopeNoteOf(t)}</p>
            </>
          )}
          {midpointTreeHitRows.length > 0 && (
            <SortableTable
              caption={t.midpointTreeCaption}
              columns={midpointTreeColumns(t, locale)}
              rows={midpointTreeHitRows}
              getRowKey={(row) => `${row.bodyKey}-${row.pairAKey}-${row.pairBKey}`}
              downloadFilename={deriveExportFilename(displayName, 'midpoint-tree', 'csv')}
            />
          )}
          {allMidpointRows.length > 0 && (
            <SortableTable
              caption={t.allMidpointsCaption}
              columns={allMidpointsColumns(t, locale)}
              rows={allMidpointRows}
              getRowKey={(row) => `${row.bodyAKey}-${row.bodyBKey}-${row.kind}`}
              downloadFilename={deriveExportFilename(displayName, 'midpoints', 'csv')}
            />
          )}
        </>
      );
    }
    case 'dignities': {
      // Always traditional (#545) — almutenOfAscendant no longer takes a rulership/display-choice parameter.
      const almuten = almutenOfAscendant(data, boundsScheme);
      return (
        <>
          {almuten !== undefined && (
            <>
              <p className="hint">
                {t.almutenOfAscendantSentence(almuten.almutens.map((key) => bodyDisplayName(key, locale)).join(', '))}{' '}
                <Tooltip text={t.almutenTooltip} label={t.almutenTooltipLabel}>
                  ?
                </Tooltip>
              </p>
              <p className="hint">{t.almutenScopeNote}</p>
              {/* Every candidate's own breakdown, not only the winner's name (#551). */}
              <SortableTable
                caption={t.almutenBreakdownCaption}
                columns={almutenCandidateColumns(t, locale)}
                rows={almuten.candidates}
                getRowKey={(row) => row.bodyKey}
                downloadFilename={deriveExportFilename(displayName, 'almuten', 'csv')}
              />
            </>
          )}
          <SortableTable
            caption={t.dignitiesCaption}
            captionTerm="dignity"
            columns={dignityColumns(t, locale)}
            rows={dignityRows(data, pointVisibility, boundsScheme)}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'dignities', 'csv')}
          />
          <h4 className="condition-section-header" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            {t.conditionCaption}{' '}
            <Tooltip text={t.conditionTooltip} label={t.conditionTooltipLabel}>
              ?
            </Tooltip>
          </h4>
          <p className="hint">{t.conditionHint}</p>
          <SortableTable
            caption={t.conditionCaption}
            columns={conditionColumns(t, locale, pointVisibility.motionScoreVisible === true)}
            rows={conditionRows(data, undefined, boundsScheme, {
              motionScore: pointVisibility.motionScoreVisible === true,
            })}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'condition', 'csv')}
          />
          <h4 className="dispositors-section-header" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            <GlossaryTerm id="dispositor">{t.dispositorsCaption}</GlossaryTerm>{' '}
            {/* The shared Tooltip (#456, #508) shows the same visible popup on hover, click and
                keyboard focus — a bare <span title> or an unwired aria-label button only ever
                reached a mouse-hover user, and never anyone who clicked expecting something to
                open. */}
            <Tooltip text={t.dispositorsTooltip} label={t.dispositorsTooltipLabel}>
              ?
            </Tooltip>
          </h4>
          <p className="hint">{t.dispositorsHint}</p>
          <SortableTable
            caption={t.dispositorsCaption}
            captionTerm="dispositor"
            columns={dispositorColumns(t, locale)}
            rows={dispositorRows(data, pointVisibility, rulership)}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'dispositors', 'csv')}
          />
          <h4 className="reception-section-header" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            {t.receptionCaption}{' '}
            <Tooltip text={t.receptionTooltip} label={t.receptionTooltipLabel}>
              ?
            </Tooltip>
          </h4>
          <p className="hint">{t.receptionHint}</p>
          <SortableTable
            caption={t.receptionCaption}
            columns={receptionColumns(t, locale)}
            rows={receptionRows(data, boundsScheme)}
            getRowKey={(row) => `${row.bodyAKey}-${row.bodyBKey}`}
            downloadFilename={deriveExportFilename(displayName, 'reception', 'csv')}
          />
        </>
      );
    }
    case 'derived':
      return (
        <SortableTable
          caption={t.derivedPointsCaption}
          captionTerm="derivedPoint"
          columns={derivedPointColumns(t, locale, selection)}
          rows={derivedPointRows(data, pointVisibility)}
          getRowKey={(row) => row.label}
          selectedRowKey={
            derivedPointRows(data, pointVisibility).find(
              (row) => row.pointKey !== undefined && derivedSelectionKey(row.pointKey) === selection?.selectedKey,
            )?.label
          }
          downloadFilename={deriveExportFilename(displayName, 'derived-points', 'csv')}
        />
      );
  }
}

/**
 * The chart-shape section (#430): the Jones shape with its diagram and an explanation worded as a
 * convention, then what else describes the chart's overall character rather than a position — the
 * Moon's phase and, when the chart has houses, its sect. The shape comes from the ten planets only
 * (`chartShapeOf`).
 */
function renderShapeSection(
  data: ChartData,
  hasHouses: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
): React.ReactNode {
  const shape = chartShapeOf(data);
  const shapePositions = jonesBodyPositions(data.positions);
  const sunBody = bodyByKey('sun');
  const moonBody = bodyByKey('moon');
  const sunLongitude = data.positions.find((position) => position.body === sunBody?.id)?.longitude;
  const moonLongitude = data.positions.find((position) => position.body === moonBody?.id)?.longitude;
  const lunarPhase =
    sunLongitude === undefined || moonLongitude === undefined ? undefined : lunarPhaseOf(moonLongitude, sunLongitude);
  return (
    <>
      {shape === undefined ? (
        <p className="hint">{t.shapeCannotBeWorkedOut}</p>
      ) : (
        <div className="chart-shape-summary">
          <div>
            <p>
              <strong>
                {t.chartShapeSentence(
                  t.jonesShapeLabels[shape.shape],
                  shape.handle === undefined ? undefined : bodyDisplayName(bodyById(shape.handle)?.key ?? '', locale),
                )}
              </strong>
            </p>
            <p>{t.jonesShapeExplanations[shape.shape]}</p>
            <p className="hint">{t.shapeSourceNote}</p>
          </div>
          <div
            className="chart-shape-diagram-wrap"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: renderJonesShapeDiagramSvg(shape, shapePositions, 140) }}
          />
        </div>
      )}
      {lunarPhase !== undefined && (
        <p className="lunar-phase-summary">
          {t.lunarPhaseSentence(
            t.lunarPhaseLabels[lunarPhase.phase],
            formatElongation(lunarPhase.elongation),
            lunarPhase.waxing,
            Math.round(lunarPhase.illumination * 100),
          )}
        </p>
      )}
      {hasHouses && (
        <p>
          {t.sectPrefix} {data.sect === 'day' ? t.dayChart : t.nightChart}
        </p>
      )}
      {renderAspectPatterns(data, t, locale)}
    </>
  );
}

/**
 * Aspect configurations (#640): the multi-body shapes among the ten planets, read off the chart's own aspects, so they
 * follow the orbs in force. Named only; no interpretation text exists for them yet.
 */
function renderAspectPatterns(data: ChartData, t: typeof chartViewMessages.en, locale: Locale): React.ReactNode {
  const planets = PATTERN_BODY_KEYS.flatMap((key) => {
    const body = bodyByKey(key);
    return body === undefined ? [] : [body.id];
  });
  const patterns = findAspectPatterns(data.aspects, planets);
  const name = (id: number): string => bodyDisplayName(bodyById(id)?.key ?? '', locale);
  return (
    <section aria-labelledby="aspect-patterns-heading">
      <h3 id="aspect-patterns-heading">{t.aspectPatternsHeading}</h3>
      {patterns.length === 0 ? (
        <p className="hint">{t.noAspectPatterns}</p>
      ) : (
        <ul>
          {patterns.map((pattern) => (
            <li key={`${pattern.kind}-${pattern.bodies.join('-')}`}>
              {t.aspectPatternLine(
                t.aspectPatternNames[pattern.kind],
                pattern.bodies.map(name).join(t.aspectPatternSeparator),
                pattern.kind === 't-square' || pattern.kind === 'yod' || pattern.kind === 'kite'
                  ? name(pattern.bodies[0] ?? -1)
                  : undefined,
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{t.aspectPatternsSourceNote}</p>
    </section>
  );
}

/**
 * The Placements view (#511): Positions, Houses & angles, and Derived points, stacked with visible
 * headings rather than as separate tabs — `docs/ui/UI-UX_GUIDELINES.md` §2's exact wording. Houses and
 * derived points are skipped (not the whole view) when the chart has no houses.
 */
function renderPlacementsView(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  housesRenderable: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
  rulership: RulershipChoice,
  symbolClass: SymbolClass,
  boundsScheme: BoundsScheme,
  selection?: TableSelection,
): React.ReactNode {
  return (
    <>
      {renderTableTab(
        'positions',
        data,
        displayName,
        pointVisibility,
        housesRenderable,
        t,
        locale,
        rulership,
        symbolClass,
        boundsScheme,
        selection,
      )}
      {housesRenderable && (
        <>
          {renderTableTab(
            'houses',
            data,
            displayName,
            pointVisibility,
            housesRenderable,
            t,
            locale,
            rulership,
            symbolClass,
            boundsScheme,
            selection,
          )}
          {renderTableTab(
            'derived',
            data,
            displayName,
            pointVisibility,
            housesRenderable,
            t,
            locale,
            rulership,
            symbolClass,
            boundsScheme,
            selection,
          )}
        </>
      )}
    </>
  );
}

/**
 * The Patterns & condition view (#511): the chart shape (with the Moon's phase and sect) next to its
 * own explanation, then dignities and dispositors — `docs/ui/UI-UX_GUIDELINES.md` §2's exact grouping.
 */
function renderPatternsView(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  housesRenderable: boolean,
  t: typeof chartViewMessages.en,
  locale: Locale,
  rulership: RulershipChoice,
  symbolClass: SymbolClass,
  boundsScheme: BoundsScheme,
  selection?: TableSelection,
): React.ReactNode {
  return (
    <>
      <h3>{t.shapeTabLabel}</h3>
      {renderShapeSection(data, housesRenderable, t, locale)}
      {renderTableTab(
        'dignities',
        data,
        displayName,
        pointVisibility,
        housesRenderable,
        t,
        locale,
        rulership,
        symbolClass,
        boundsScheme,
        selection,
      )}
    </>
  );
}

/** PNG export resolutions (#67): the wheel's own default pixel size, and 2x/4x of it. */
function pngSizes(t: typeof chartViewMessages.en): readonly { readonly label: string; readonly size: number }[] {
  return [
    { label: t.pngSmall, size: 600 },
    { label: t.pngMedium, size: 1200 },
    { label: t.pngLarge, size: 2400 },
  ];
}

/** `337°28'`: an elongation to the minute, the way Astro-Seek prints it beside the phase name. */
function formatElongation(elongation: number): string {
  const totalMinutes = Math.round(elongation * 60) % (360 * 60);
  return `${String(Math.floor(totalMinutes / 60))}°${String(totalMinutes % 60).padStart(2, '0')}'`;
}

/** `data-sign` on the wheel is the sign's name lowercased (`multi-wheel.ts`). */
function signKeyOf(row: PositionRow): string {
  return row.sign.toLowerCase();
}

/**
 * The facts for the selection panel: what was clicked, from the chart's own tables. Which parts of
 * the wheel to dim is not decided here — `wheel-interaction.ts` works that out from the wheel's markup.
 */
function resolveWheelIsolation(
  isolatedKey: string,
  data: ChartData,
  pointVisibility: PointVisibilityOptions,
  housesRenderable: boolean,
  locale: Locale,
  t: typeof chartViewMessages.en,
  ringData?: readonly OverlayRingData[],
): WheelIsolationFacts | undefined {
  if (isolatedKey.startsWith('ring:')) {
    const ring = Number(isolatedKey.slice('ring:'.length));
    const label = ringData?.[ring]?.label;
    return label === undefined ? undefined : { heading: label, relatedAspects: [] };
  }
  const selection = parseSelectionKey(isolatedKey);
  if (selection === undefined) return undefined;
  const selectedData =
    selection.kind === 'body'
      ? (ringData?.[selection.ring]?.data ?? data)
      : selection.kind === 'aspect' && selection.ringA === selection.ringB
        ? (ringData?.[selection.ringA]?.data ?? data)
        : data;
  const sourceLabel =
    selection.kind === 'body'
      ? ringData?.[selection.ring]?.label
      : selection.kind === 'aspect' && selection.ringA === selection.ringB
        ? ringData?.[selection.ringA]?.label
        : undefined;
  const allPositions = positionRows(selectedData, pointVisibility, housesRenderable);
  const allAspects = aspectRows(selectedData, pointVisibility);

  if (selection.kind === 'body') {
    const value = selection.key;
    const positionRow = allPositions.find((row) => row.bodyKey === value);
    return {
      heading:
        positionRow !== undefined
          ? `${bodyDisplayName(positionRow.bodyKey, locale)}${sourceLabel === undefined ? '' : ` — ${sourceLabel}`}`
          : value,
      positionRow,
      relatedAspects: allAspects.filter((row) => row.bodyAKey === value || row.bodyBKey === value),
    };
  }

  if (selection.kind === 'derived') {
    // The real visibility settings (#542) — the matrix (the only place a hidden derived point's
    // selection key could previously have come from) now also respects them, so there is no
    // longer a hidden-but-selectable case to work around with a hardcoded override here.
    const row = derivedPointRows(selectedData, pointVisibility).find(
      (candidate) => candidate.pointKey === selection.point,
    );
    const facts = derivedPointPlacementFacts(selectedData, selection.point);
    return {
      heading: row?.label ?? selection.point,
      relatedAspects: [],
      pointPosition:
        row === undefined
          ? undefined
          : {
              sign: row.sign,
              degree: row.degree,
              minute: row.minute,
              house: housesRenderable ? facts.house : undefined,
            },
    };
  }

  if (selection.kind === 'house') {
    const cusp = selectedData.houses.cusps[selection.house];
    const signName = cusp === undefined ? '' : (SIGNS[Math.floor((((cusp % 360) + 360) % 360) / 30)]?.name ?? '');
    return {
      heading: t.cuspHeading(signDisplayName(signName, locale), selection.house),
      relatedAspects: [],
      bodiesInHouse: allPositions.filter((row) => row.speed !== undefined && row.house === selection.house),
    };
  }

  if (selection.kind === 'sign') {
    const signKey = (SIGNS[selection.signIndex]?.name ?? '').toLowerCase();
    // Bodies only — the Ascendant/Midheaven rows have no daily motion (see `PositionRow.speed`).
    const inSign = allPositions.filter((row) => row.speed !== undefined && signKeyOf(row) === signKey);
    const bodyKeys = new Set(inSign.map((row) => row.bodyKey));
    return {
      heading: signDisplayName(SIGNS[selection.signIndex]?.name ?? '', locale),
      relatedAspects: allAspects.filter((row) => bodyKeys.has(row.bodyAKey) || bodyKeys.has(row.bodyBKey)),
      bodiesInSign: inSign,
    };
  }

  const { bodyA, bodyB } = selection;
  const aspectRow = allAspects.find(
    (row) => (row.bodyAKey === bodyA && row.bodyBKey === bodyB) || (row.bodyAKey === bodyB && row.bodyBKey === bodyA),
  );
  const bodyAName = aspectRow !== undefined ? bodyDisplayName(aspectRow.bodyAKey, locale) : bodyA;
  const bodyBName = aspectRow !== undefined ? bodyDisplayName(aspectRow.bodyBKey, locale) : bodyB;
  return { heading: `${bodyAName} – ${bodyBName}`, relatedAspects: [], aspectRow };
}

/**
 * The chart sheet and data tables for one computed chart, independent of where the data
 * came from — the local store (`ChartView`) or a decoded share link (`SharedChartView`,
 * #65). Kept separate so both callers get the same tabs, sheet, and loading/error states.
 */
export function ChartDataView({
  load,
  displayName,
  showHouses,
  metaLines,
  rulership,
  extendedSettings = DEFAULT_EXTENDED_SETTINGS,
  cardSettings,
  onExtendedSettingsChange,
  settingsProvider,
  view,
  onViewChange,
  buildViewHref,
  typeSelector,
  overlayContext,
  chartType,
  personId,
}: {
  readonly load: Load;
  readonly displayName: string;
  readonly showHouses: boolean;
  /**
   * Header lines for the sheet. Passed in rather than derived here because only
   * the caller holds the birth moment the date/place lines come from; omitted,
   * the sheet is headed by the display name alone.
   */
  readonly metaLines?: readonly string[] | undefined;
  /**
   * The planetary rulers the chart's labels, dignities and dispositors use (#806): the person's own choice, or
   * the snapshot's on a shared chart. Passed in so no chart screen reads a device value for another person's chart.
   */
  readonly rulership: RulershipChoice;
  /**
   * The confirmed (post-Redraw) extended settings (#52): house system, zodiac,
   * orb rules, minor aspects, point visibility, and the wheel's sign-wedge
   * style. Defaults to `DEFAULT_EXTENDED_SETTINGS` so `SharedChartView` — which
   * has no panel and doesn't pass any of these three props — renders exactly as
   * it did before this feature existed.
   */
  readonly extendedSettings?: ExtendedSettings;
  /**
   * The card's own settings, when the chart is drawn with other orbs because the device chose a named orb profile for
   * it (#590). The panel edits these, not the resolved ones, so Apply never saves a profile's orbs as the card's.
   */
  readonly cardSettings?: ExtendedSettings;
  /**
   * Set together with `settingsProvider`: when both are given, the "Extended
   * settings" panel is rendered and this is wired as its `onRedraw`. Omitted by
   * `SharedChartView`, which has no panel.
   */
  readonly onExtendedSettingsChange?: (next: ExtendedSettings, rulers: RulershipChoice) => void | Promise<void>;
  /** A long-lived provider for the panel's own house-system/ayanamsa name lookups. */
  readonly settingsProvider?: EphemerisProvider | undefined;
  /** The open view (#511: Wheel/Aspects/Placements/Patterns & condition), when a URL decides it (every real screen); otherwise this component's own state. */
  readonly view?: ChartViewKind | undefined;
  readonly onViewChange?: ((view: ChartViewKind) => void) | undefined;
  /** Builds this chart's own URL for a given view, for `ChartViewNav`'s real links — every real caller's hash shape differs, so there is no sane default. */
  readonly buildViewHref: (view: ChartViewKind) => string;
  /** The chart type select, shown on the same row as `ChartViewNav` (#801); on its own row when that nav is not shown (loading, error, print). */
  readonly typeSelector?: React.ReactNode;
  /** Optional person-bound sources for configuring extra rings in the Wheel workbench. */
  readonly overlayContext?: ChartOverlayContext | undefined;
  /**
   * What kind of chart this is, for the screens that show a chart derived from the natal one (#725). Anything but
   * natal makes the inspector say that natal-chart interpretations are being applied to a derived chart; left out,
   * no such note is shown (natal, shared, composite and horary charts).
   */
  readonly chartType?: ChartType | undefined;
  /** The person the chart belongs to (#768), for the inspector's AI reading; absent on screens with no person (shared, horary). */
  readonly personId?: string | undefined;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  const chartTypeT = useMessages(chartTypesMessages);
  const [locale] = useLocale();
  const [ownTab, setOwnTab] = useState<ChartViewKind>('wheel');
  const [aspectHarmonicFamilyFilter, setAspectHarmonicFamilyFilter] = useState('all');
  const activeTab: ChartViewKind = view ?? ownTab;
  const setActiveTab = (next: ChartViewKind): void => {
    setOwnTab(next);
    onViewChange?.(next);
  };
  const [symbolClass] = useSymbolClass();
  // The wheel's markup is cached on these, so a change of symbol form redraws it.
  const [variants] = useGlyphVariants();
  // True only for the moment between clicking "Export PDF" and the print dialog closing
  // (see `exportPdf` below): while true, every table renders at once instead of just the
  // active tab, so the PDF the browser's own "Save as PDF" produces has all of them (#67).
  const [printAll, setPrintAll] = useState(false);
  const overlayT = useMessages(chartOverlaySettingsPanelMessages);
  const [overlaySettings, setOverlaySettings] = useState<ChartOverlaySettings>(DEFAULT_CHART_OVERLAY_SETTINGS);
  const [overlayLoad, setOverlayLoad] = useState<OverlayLoad>({ kind: 'idle' });

  const pointVisibility = useMemo(() => toPointVisibilityOptions(extendedSettings), [extendedSettings]);
  // What the written reading leaves out (#721): the wheel's "What it means" text follows the same set as the report.
  const interpretationExcluded = useMemo(
    () => interpretationExclusions(extendedSettings.objectPolicies),
    [extendedSettings],
  );
  // Which bound table the dignity/condition/reception/almuten tables use (#549) — threaded
  // alongside `rulership` through the same render-tab functions, not through `pointVisibility`
  // (it isn't a visibility concern).
  const boundsScheme = extendedSettings.boundsScheme;

  // #378: `showHouses` alone (passed in from `person.timeAccuracy`) isn't enough — a *known*
  // birth time at a latitude where the chosen house system has no solution still produces
  // `HousePositions`, just one whose cusps/angles are `NaN` (see `housesAreDefined`'s own doc
  // comment). `housesComputed` stays `true` before `load` is ready so it never itself suppresses
  // anything ahead of data actually arriving; `housesRenderable` is what every house-dependent
  // render below should gate on instead of the raw `showHouses` prop.
  const housesComputed = load.kind !== 'ready' || housesAreDefined(load.data.houses);
  const housesRenderable = showHouses && housesComputed;

  useEffect(() => {
    if (overlayContext === undefined || load.kind !== 'ready' || !hasChartOverlays(overlaySettings)) {
      setOverlayLoad({ kind: 'idle' });
      return undefined;
    }
    const effect = { cancelled: false };
    setOverlayLoad({ kind: 'loading' });
    void (async () => {
      try {
        const rings: WheelRingInput[] = [chartWheelRing(load.data, overlayContext.baseLabel, pointVisibility)];
        const snapshotIdentity = provenanceIdentity(load, extendedSettings, rulership);
        const snapshot = overlayT.calculationSnapshot(snapshotIdentity);
        const ringData: OverlayRingData[] = [
          { label: overlayContext.baseLabel, data: load.data, provenance: snapshot },
        ];
        const crossAspects: CrossRingAspects[] = [];
        const calculationOptions = overlayContext.options ?? {};
        const overlays = new Map<
          ChartOverlaySource,
          {
            readonly ring: WheelRingInput;
            readonly data?: ChartData | undefined;
            readonly contacts?: readonly Aspect[] | undefined;
            readonly provenance: string;
          }
        >();
        const addChart = (
          source: ChartOverlaySource,
          label: string,
          data: ChartData,
          contacts?: readonly Aspect[],
        ): void => {
          overlays.set(source, {
            ring: chartWheelRing(data, label, pointVisibility),
            data,
            ...(contacts === undefined ? {} : { contacts }),
            provenance: snapshot,
          });
        };

        if (overlaySettings.natal && overlayContext.baseSource !== 'natal') {
          addChart(
            'natal',
            overlayT.natal,
            await computeChartData(overlayContext.moment, overlayContext.provider, calculationOptions),
          );
        }
        if (overlaySettings.draconic && overlayContext.baseSource !== 'draconic') {
          const draconic = await computeDraconic(overlayContext.moment, overlayContext.provider, calculationOptions);
          addChart('draconic', overlayT.draconic, draconic.draconic);
        }
        if (overlaySettings.transit) {
          const parts = dateParts(overlaySettings.transitDate);
          if (parts === undefined) throw new Error('Transit date is incomplete.');
          const [year, month, day] = parts;
          const targetJd = await overlayContext.provider.julianDayFromUtc(year, month, day, 12, 0, 0);
          const transit = await computeTransit(overlayContext.moment, targetJd, overlayContext.provider, {
            ...calculationOptions,
            orbConfig: orbConfigForContext('transit', calculationOptions.orbConfig ?? DEFAULT_ORB_CONFIG),
          });
          addChart('transit', overlayT.transit, transit.transit, transit.contacts);
        }
        if (overlaySettings.progressed) {
          const parts = dateParts(overlaySettings.progressedDate);
          if (parts === undefined) throw new Error('Progressed date is incomplete.');
          const [year, month, day] = parts;
          const targetJd = await overlayContext.provider.julianDayFromUtc(year, month, day, 12, 0, 0);
          const progressed = await computeSecondaryProgression(
            overlayContext.moment,
            targetJd,
            overlayContext.provider,
            calculationOptions,
          );
          overlays.set('progressed', {
            ring: progressedOverlayRing(progressed, overlayT.progressed),
            contacts: progressed.contacts,
            provenance: snapshot,
          });
        }
        if (overlaySettings.directed) {
          const parts = dateParts(overlaySettings.directedDate);
          if (parts === undefined) throw new Error('Directed date is incomplete.');
          const [year, month, day] = parts;
          const targetJd = await overlayContext.provider.julianDayFromUtc(year, month, day, 12, 0, 0);
          const directions = await generatePrimaryDirections(overlayContext.moment, overlayContext.provider);
          if (!directions.defined) throw new RangeError('Primary directions are undefined at this birth latitude.');
          const directed = await directedChartAt(
            directions,
            ageInYears(directions.natalJd, targetJd),
            overlayContext.provider,
          );
          overlays.set('directed', {
            ring: directedOverlayRing(directed, overlayT.directed),
            provenance: `${snapshot} · ${overlayT.primaryDirectionsProvenance}`,
          });
        }
        if (overlaySettings.return) {
          const parts = dateParts(overlaySettings.returnDate);
          if (parts === undefined) throw new Error('Return date is incomplete.');
          const [year, month, day] = parts;
          const targetJd = await overlayContext.provider.julianDayFromUtc(year, month, day, 12, 0, 0);
          const returned =
            overlaySettings.returnKind === 'solar'
              ? await computeSolarReturnChart(overlayContext.moment, year, overlayContext.provider, calculationOptions)
              : await computeLunarReturnChart(
                  overlayContext.moment,
                  targetJd,
                  overlayContext.provider,
                  calculationOptions,
                );
          addChart(
            'return',
            overlaySettings.returnKind === 'solar' ? overlayT.solarReturn : overlayT.lunarReturn,
            returned.chart,
            returned.contacts,
          );
        }
        if (overlaySettings.relocated) {
          const latitude = parseCoordinate(overlaySettings.latitude, -90, 90);
          const longitude = parseCoordinate(overlaySettings.longitude, -180, 180);
          if (latitude === undefined || longitude === undefined) {
            throw new Error('A relocated overlay needs valid latitude and longitude.');
          }
          const relocated = await computeRelocatedChart(
            overlayContext.moment,
            { latitude, longitude, altitude: 0 },
            overlayContext.provider,
            calculationOptions,
          );
          // A relocated chart has exactly the natal longitudes, so cross-aspecting it to natal would only draw self-conjunctions.
          addChart('relocated', overlayT.relocated, relocated.relocated);
        }
        for (const source of orderedChartOverlaySources(overlaySettings)) {
          const overlay = overlays.get(source);
          if (overlay === undefined) continue;
          const outerRingIndex = rings.length;
          rings.push(overlay.ring);
          ringData.push({
            label: overlay.ring.label,
            ...(overlay.data === undefined ? {} : { data: overlay.data }),
            provenance: overlay.provenance,
          });
          if (
            overlaySettings.interRingAspects &&
            overlayContext.baseSource === 'natal' &&
            overlay.contacts !== undefined
          ) {
            const [baseRing] = rings;
            if (baseRing === undefined) throw new Error('unreachable: overlay charts always have a base ring');
            const outerBodies = new Set(overlay.ring.bodies.map((body) => body.body));
            const innerBodies = new Set(baseRing.bodies.map((body) => body.body));
            const visibleContacts = overlay.contacts.filter(
              (contact) => outerBodies.has(contact.bodyA) && innerBodies.has(contact.bodyB),
            );
            crossAspects.push({ innerRingIndex: 0, outerRingIndex, aspects: visibleContacts });
          }
        }
        if (!effect.cancelled) {
          setOverlayLoad({ kind: 'ready', markup: renderMultiWheelSvg(rings, crossAspects), ringData });
        }
      } catch (error) {
        if (!effect.cancelled) {
          setOverlayLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [load, overlayContext, overlaySettings, overlayT, pointVisibility, extendedSettings, rulership]);

  // The export sheet (SVG/PNG/PDF) and the on-screen dial are two compositions of one computed chart (#511):
  // the dial is the sheet's own wheel, drawn alone; everything else the sheet holds is shown as tables.
  const { sheet, dial } = useMemo(() => {
    if (load.kind !== 'ready' || !housesRenderable) return { sheet: undefined, dial: undefined };
    const input = chartSheetInput(
      load.data,
      metaLines ?? [displayName || t.chartFallback],
      displayName || t.natalFallback,
      toPointVisibilityOptions(extendedSettings),
      (bodyKey) => bodyShortName(bodyKey, locale),
    );
    const options = {
      ...resolveWheelDisplayOptions({}),
      signWedgeStyle: toSignWedgeStyle(extendedSettings),
    };
    return { sheet: renderChartSheetSvg(input, options), dial: renderChartDialSvg(input, options) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the wheel renderers read the glyph settings from module state, so these are cache keys, not inputs the callback reads.
  }, [load, housesRenderable, displayName, metaLines, extendedSettings, t, locale, symbolClass, variants]);

  const wheelMarkup = overlayLoad.kind === 'ready' ? overlayLoad.markup : dial?.markup;
  const overlayRingData = overlayLoad.kind === 'ready' ? overlayLoad.ringData : undefined;

  // Click-to-isolate (#400, #412, #418): the selection, its dimming of the wheel and its click
  // handling are shared with every other wheel (`wheel-interaction.ts`); only the panel of facts
  // below is this screen's own. A new sheet (redraw, person change, settings change) clears the
  // selection, since the clicked symbol may no longer exist.
  const {
    wheelRef,
    selectionKey: isolatedKey,
    clear: clearIsolation,
    toggle: toggleIsolation,
    onClick: handleWheelClick,
    onKeyDown: handleWheelKeyDown,
  } = useWheelIsolation(wheelMarkup);

  // The Positions and Aspects tables share the wheel's selection (#418): a button on a row selects it on the
  // wheel, and the row the wheel has selected is marked. Only where there is a wheel, and never in the PDF.
  const tableSelection = useMemo((): TableSelection | undefined => {
    if (wheelMarkup === undefined || load.kind !== 'ready') return undefined;
    return {
      selectedKey: isolatedKey,
      onToggle: toggleIsolation,
      selectableBodies: new Set(
        visiblePositions(load.data.positions, pointVisibility).map((position) => bodyById(position.body)?.key ?? ''),
      ),
    };
  }, [wheelMarkup, load, isolatedKey, toggleIsolation, pointVisibility]);

  const isolation = useMemo(() => {
    if (isolatedKey === undefined || load.kind !== 'ready') return undefined;
    return resolveWheelIsolation(isolatedKey, load.data, pointVisibility, housesRenderable, locale, t, overlayRingData);
  }, [isolatedKey, load, pointVisibility, housesRenderable, locale, t, overlayRingData]);

  const inspectorData = useMemo(() => {
    if (load.kind !== 'ready' || isolatedKey === undefined || overlayRingData === undefined)
      return load.kind === 'ready' ? load.data : undefined;
    const selection = parseSelectionKey(isolatedKey);
    if (selection?.kind === 'body') return overlayRingData[selection.ring]?.data ?? load.data;
    if (selection?.kind === 'aspect' && selection.ringA === selection.ringB) {
      return overlayRingData[selection.ringA]?.data ?? load.data;
    }
    return load.data;
  }, [load, isolatedKey, overlayRingData]);

  // What the "interpret the tensions of this placement" button would send: only for a selected planet (#424).
  const focusContext = useMemo(() => {
    if (isolatedKey === undefined || load.kind !== 'ready') return undefined;
    const selection = parseSelectionKey(isolatedKey);
    const selectedData =
      selection?.kind === 'body' && overlayRingData !== undefined
        ? (overlayRingData[selection.ring]?.data ?? load.data)
        : load.data;
    return selection?.kind === 'body'
      ? buildFocusObjectContext(selectedData, selection.key, undefined, rulership)
      : undefined;
  }, [isolatedKey, load, rulership, overlayRingData]);

  useEffect(() => {
    if (!printAll) return undefined;
    // document.title seeds the filename most browsers' print-to-PDF dialogs suggest, so a
    // saved PDF gets the same person-and-chart-derived name as the SVG/CSV downloads do.
    const previousTitle = document.title;
    document.title = deriveExportFilename(displayName, 'chart', 'pdf');
    const restore = (): void => {
      document.title = previousTitle;
      setPrintAll(false);
    };
    window.addEventListener('afterprint', restore, { once: true });
    // Deferred a tick so the all-tables markup this triggers is committed to the DOM
    // before the browser captures the page to print.
    const timer = setTimeout(() => {
      window.print();
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', restore);
    };
  }, [printAll, displayName]);

  const exportPdf = (): void => {
    setPrintAll(true);
  };

  const downloadSvg = (): void => {
    if (sheet === undefined) return;
    const markup = overlayLoad.kind === 'ready' ? overlayLoad.markup : sheet.markup;
    downloadText(deriveExportFilename(displayName, 'chart', 'svg'), standaloneSvg(markup), 'image/svg+xml');
  };

  /** Rejects with the rasterizer's own message, which the header's export status shows. */
  const downloadPng = async (size: number): Promise<void> => {
    if (sheet === undefined) return;
    const markup = overlayLoad.kind === 'ready' ? overlayLoad.markup : sheet.markup;
    // The sheet is taller than it is wide, so the chosen size is its width and
    // the height follows its own aspect ratio — rasterizing it square would
    // squash the wheel into an ellipse.
    const pngHeight = overlayLoad.kind === 'ready' ? size : Math.round((size * sheet.height) / sheet.width);
    const blob = await svgToPngBlob(standaloneSvg(markup), size, pngHeight);
    downloadBlob(deriveExportFilename(displayName, 'chart', 'png'), blob);
  };

  // The chart's own exports live in the header's Export menu (#export), not under the wheel: registered while
  // this screen is mounted, so the menu offers them on every screen that shows a chart.
  useRegisterExports(
    sheet === undefined
      ? undefined
      : [
          { key: 'chart-svg', label: t.exportSvg, run: downloadSvg },
          ...pngSizes(t).map((option) => ({
            key: `chart-png-${String(option.size)}`,
            label: t.exportPng(option.label),
            run: () => downloadPng(option.size),
          })),
          { key: 'chart-pdf', label: t.exportPdf, run: exportPdf },
        ],
  );

  // The views this chart can show (#511): the Wheel is built on the Ascendant, so a chart without
  // houses has none of it and opens on the next view instead. Aspects/Placements/Patterns & condition
  // always have at least their Positions/Aspects/shape content, so they're never dropped outright —
  // Placements and Patterns just skip their houses-dependent sub-sections (see the view renderers).
  const tabs: readonly ChartViewKind[] = CHART_VIEWS.filter((view) => (view === 'wheel' ? sheet !== undefined : true));
  // A chosen view that has since gone (a setting made the wheel unavailable) falls back to the first one shown.
  const currentTab: ChartViewKind = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? 'aspects');

  /** The wheel, what a click isolates, the interpret button and the exports: everything the Wheel view holds. */
  const renderChartPanel = (data: ChartData): React.ReactNode =>
    wheelMarkup === undefined ? null : (
      <>
        {overlayLoad.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
        {overlayLoad.kind === 'error' && (
          <StatusMessage kind="error">{t.chartError(overlayLoad.message)}</StatusMessage>
        )}
        {overlayRingData !== undefined && (
          <section className="chart-overlay-provenance" aria-label={overlayT.ringProvenance}>
            <h3>{overlayT.ringProvenance}</h3>
            <ul>
              {overlayRingData.map((ring) => (
                <li key={ring.label}>
                  <strong>{ring.label}</strong>: {ring.provenance}
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* One workbench: the dial, then its inspector straight after it in DOM and focus order (#511).
            The outer element is the inline-size query container; see `.chart-workbench` in app.css. */}
        <div className="chart-workbench-shell">
          <div className="chart-workbench">
            <div className="chart-workbench-dial">
              <p className="hint chart-wheel-hint">{t.wheelClickHint}</p>
              <div
                ref={wheelRef}
                className="chart-wheel chart-wheel-interactive"
                // The wheel is generated entirely by this app from data it just computed — never
                // user-supplied markup — so injecting it is the same trust boundary as any other
                // value this component renders, just carried as a string instead of JSX.
                dangerouslySetInnerHTML={{ __html: wheelMarkup }}
                onClick={handleWheelClick}
                onKeyDown={handleWheelKeyDown}
              />
            </div>
            {!printAll && (
              <SelectionInspector
                facts={isolation}
                selectionKey={isolatedKey}
                data={inspectorData ?? data}
                focusContext={focusContext}
                locale={locale}
                exclude={interpretationExcluded}
                personId={personId}
                onClear={clearIsolation}
                derivedChartNote={
                  isDerivedChartType(chartType)
                    ? t.derivedChartInterpretationNote(chartTypeT.typeLabels[chartType].toLocaleLowerCase(locale))
                    : undefined
                }
              />
            )}
          </div>
        </div>

        {/* AstroChart is a reference rendering kept alongside Astraya's own wheel so the
                  two can be compared during development (#231) — production users only ever
                  see Astraya's, and it never participates in export (#67), so it's hidden
                  during the print-all pass "Export PDF" triggers. */}
        {!import.meta.env.PROD && !printAll && (
          <div className="chart-wheel-reference">
            <p className="hint">{t.astrochartReferenceHeading}</p>
            <div aria-hidden="true">
              <AstroChartWheel data={data} signWedgeStyle={toSignWedgeStyle(extendedSettings)} />
            </div>
            <p className="hint">{t.astrochartReferenceHint}</p>
          </div>
        )}
      </>
    );

  // The overlay rings belong to the wheel, so the Overlays row only exists where the wheel does. It opens in flow under
  // the tab row (#826), not in the pinned cluster; the Extended settings card needs the long-lived provider.
  const overlaysPanel =
    overlayContext !== undefined && wheelMarkup !== undefined ? (
      <ChartOverlaySettingsPanel
        value={overlaySettings}
        baseLabel={overlayContext.baseLabel}
        unavailableSources={overlayContext.baseSource === undefined ? [] : [overlayContext.baseSource]}
        onApply={setOverlaySettings}
      />
    ) : null;
  const settingsPanel =
    onExtendedSettingsChange !== undefined && settingsProvider !== undefined ? (
      <ExtendedSettingsPanel
        value={cardSettings ?? extendedSettings}
        rulership={rulership}
        onRedraw={onExtendedSettingsChange}
        provider={settingsProvider}
      />
    ) : null;

  return (
    <>
      {/* Invisible outside @media print (#564) — see app.css's own `.print-provenance` rule. */}
      <PrintProvenance
        houseSystem={houseSystemLabel(extendedSettings.houseSystem)}
        zodiac={zodiacLabel(extendedSettings.zodiac)}
        rulership={rulershipLabel(rulership)}
        snapshotIdentity={provenanceIdentity(load, extendedSettings, rulership)}
        generatedAt={formatTimestamp(new Date())}
      />
      {/* Directly under the title row (#801): the chart type, the chart's own views once there is a chart to view, and the
          Extended settings trigger pinned at the far right (#818); the Overlays row follows in flow (#826). The row stays in place while the chart
          loads or fails, so the Extended settings card (a setting that might fix a failed or slow calculation, #442)
          keeps its state and stays reachable; only the view links wait for the chart. */}
      {printAll ? (
        <>
          {typeSelector}
          {settingsPanel}
        </>
      ) : (
        <ChartViewNav
          leading={typeSelector}
          activeView={currentTab}
          buildHref={buildViewHref}
          onNavigate={setActiveTab}
          availableViews={load.kind === 'ready' ? tabs : []}
          actions={settingsPanel ?? undefined}
        />
      )}
      {!printAll && overlaysPanel}
      {!showHouses && <p className="hint">{t.housesUnknownHint(displayName || t.thisPerson)}</p>}
      {showHouses && !housesComputed && <p className="hint">{t.housesUndefinedHint(displayName || t.thisPerson)}</p>}

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

      {load.kind === 'error' && <StatusMessage kind="error">{t.chartError(load.message)}</StatusMessage>}

      {load.kind === 'ready' && (
        <>
          {load.data.houses.warning !== undefined && (
            <StatusMessage kind="error">{load.data.houses.warning}</StatusMessage>
          )}

          {printAll ? (
            <div className="chart-print-all">
              {tabs.map((tab) => (
                <section key={tab}>
                  {tab === 'wheel' ? (
                    renderChartPanel(load.data)
                  ) : (
                    <>
                      <h2>{chartViewLabels(t)[tab]}</h2>
                      {tab === 'aspects' &&
                        renderTableTab(
                          'aspects',
                          load.data,
                          displayName,
                          pointVisibility,
                          housesRenderable,
                          t,
                          locale,
                          rulership,
                          symbolClass,
                          boundsScheme,
                        )}
                      {tab === 'matrix' && renderMatrixView(load.data, displayName, pointVisibility, t, locale)}
                      {tab === 'elements' && renderElementsView(load.data, displayName, pointVisibility, t, locale)}
                      {tab === 'placements' &&
                        renderPlacementsView(
                          load.data,
                          displayName,
                          pointVisibility,
                          housesRenderable,
                          t,
                          locale,
                          rulership,
                          symbolClass,
                          boundsScheme,
                        )}
                      {tab === 'patterns' &&
                        renderPatternsView(
                          load.data,
                          displayName,
                          pointVisibility,
                          housesRenderable,
                          t,
                          locale,
                          rulership,
                          symbolClass,
                          boundsScheme,
                        )}
                    </>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <>
              {/* The wheel stays mounted while another view is open, so a selection on it survives a
                  visit to the tables; every other view is only in the page while it is shown. */}
              {tabs.includes('wheel') && (
                <div id="chart-view-wheel" hidden={currentTab !== 'wheel'}>
                  {renderChartPanel(load.data)}
                </div>
              )}
              {currentTab !== 'wheel' && (
                <div id={`chart-view-${currentTab}`}>
                  <h2>{chartViewLabels(t)[currentTab]}</h2>
                  {tableSelection !== undefined && isolation !== undefined && (
                    <p className="chart-selection-bar" role="status">
                      {t.selectedOnChart(isolation.heading)}{' '}
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => {
                          setActiveTab('wheel');
                        }}
                      >
                        {t.goToChart}
                      </button>{' '}
                      <button type="button" className="quiet" onClick={clearIsolation}>
                        {t.isolationClear}
                      </button>
                    </p>
                  )}
                  {currentTab === 'aspects' &&
                    (() => {
                      const harmonicFamily =
                        aspectHarmonicFamilyFilter === 'all' ? undefined : Number(aspectHarmonicFamilyFilter);
                      return (
                        <>
                          <div className="field-grid">
                            <Select
                              label={t.harmonicFamilyFilterLabel}
                              value={aspectHarmonicFamilyFilter}
                              options={[
                                { value: 'all', label: t.allHarmonicFamilies },
                                ...HARMONIC_FAMILY_FILTERS.map((family) => ({
                                  value: String(family),
                                  label: t.harmonicFamilyOption(String(family)),
                                })),
                              ]}
                              onChange={setAspectHarmonicFamilyFilter}
                            />
                          </div>
                          {renderTableTab(
                            'aspects',
                            load.data,
                            displayName,
                            pointVisibility,
                            housesRenderable,
                            t,
                            locale,
                            rulership,
                            symbolClass,
                            boundsScheme,
                            tableSelection,
                            harmonicFamily,
                          )}
                        </>
                      );
                    })()}
                  {currentTab === 'matrix' &&
                    renderMatrixView(load.data, displayName, pointVisibility, t, locale, tableSelection)}
                  {currentTab === 'elements' && renderElementsView(load.data, displayName, pointVisibility, t, locale)}
                  {currentTab === 'placements' &&
                    renderPlacementsView(
                      load.data,
                      displayName,
                      pointVisibility,
                      housesRenderable,
                      t,
                      locale,
                      rulership,
                      symbolClass,
                      boundsScheme,
                      tableSelection,
                    )}
                  {currentTab === 'patterns' &&
                    renderPatternsView(
                      load.data,
                      displayName,
                      pointVisibility,
                      housesRenderable,
                      t,
                      locale,
                      rulership,
                      symbolClass,
                      boundsScheme,
                      tableSelection,
                    )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

export function ChartView({
  personId,
  view,
  compareType,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
  compareType?: ChartType | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const customPoints = useStableBy(person?.customPoints, (points) => JSON.stringify(points ?? []));
  const t = useMessages(chartViewMessages);
  const [locale] = useLocale();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [compareLoad, setCompareLoad] = useState<Load>({ kind: 'loading' });
  const [lastReadyData, setLastReadyData] = useState<ChartData | undefined>();
  // Shared with the solar and lunar return charts, so a house system chosen here applies there too.
  const {
    settings: cardSettings,
    unreadable: settingsUnreadable,
    setSettings: setSettings,
    rulership,
  } = usePersonCalculationSettings(personId);
  // The natal chart uses the card's orbs unless the device chose a named orb profile for natal charts (#590); the
  // settings it resolves to are what the chart, its snapshot and its share link all record.
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  const settings = useMemo(
    () => settingsForContext(cardSettings, 'natal', orbLibrary, orbSources),
    [cardSettings, orbLibrary, orbSources],
  );
  // The basis names the card's settings and the device's natal orb profile, not the orb-overridden `settings` (#806).
  const basisLine = useCalculationBasisLine(cardSettings, rulership, orbSourceName(orbLibrary, orbSources, 'natal'));
  const lastChartKey = useRef('');
  // Memoised: it is a dependency of the wheel's markup, and a new array on every render of this screen (which a
  // change of section now causes) would redraw the wheel and drop what was selected on it.
  const personName = person?.displayName ?? '';
  const metaLines = useMemo(
    () =>
      personMoment === undefined ? undefined : chartSheetMetaLines(personName || t.chartFallback, personMoment, locale),
    [personMoment, personName, t.chartFallback, locale],
  );
  // The "Extended settings" panel's house-system/ayanamsa name lookups and the main
  // chart computation below used to hold two separate `WorkerEphemerisProvider`
  // instances — kept apart so that recreating the computation provider on a settings
  // tweak would never dispose the panel's provider out from under it. Both now come
  // from the app-wide shared instance (#315), which is never recreated mid-session, so
  // that concern no longer applies. Reuse is otherwise safe because every call already
  // carries its own zodiac/observer options rather than relying on state a prior call
  // left behind (`#applyZodiac`/`#flagsFor` in `engine.ts` set sidereal mode and the
  // topocentric observer fresh from each request's own options), and the worker
  // serializes requests through one promise chain, so out-of-order settings changes
  // still resolve in order.
  const { provider } = useEphemerisProvider();

  useEffect(() => {
    if (load.kind === 'ready') setLastReadyData(load.data);
  }, [load]);

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable) return undefined;
    const moment = personMoment;
    // A mutable holder rather than a `let`, matching `App.tsx`'s own effect below.
    const effect = { cancelled: false };
    // Only the planetary rulers changed (#426): keep the chart on screen while it is recalculated
    // rather than going back to "loading", so the settings panel the choice was made in stays open.
    const customPointsKey = JSON.stringify(customPoints ?? []);
    const chartKey = `${personId}|${momentKey(moment)}|${JSON.stringify(settings)}|${customPointsKey}`;
    const sameChart = lastChartKey.current === chartKey;
    lastChartKey.current = chartKey;
    setLoad((current) => (sameChart && current.kind === 'ready' ? current : { kind: 'loading' }));

    void (async () => {
      try {
        const data = await computeChartData(moment, provider, {
          ...toChartCalculationOptions(settings),
          rulership,
          ...(customPoints === undefined ? {} : { customPoints }),
        });
        const snapshot = buildCalculationSnapshot(settings, rulership, customPoints ?? []);
        const artifact = await buildChartArtifact(snapshot, moment, data, provider);
        if (!effect.cancelled) setLoad({ kind: 'ready', data, artifact });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personId, personMoment, customPoints, settings, rulership, provider]);

  // Compute comparison chart when compareType is provided (#439)
  useEffect(() => {
    if (compareType === undefined) {
      setCompareLoad({ kind: 'loading' });
      return;
    }
    if (personMoment === undefined || provider === undefined || settingsUnreadable) return undefined;

    const moment = personMoment;
    const effect = { cancelled: false };
    const options = {
      ...toChartCalculationOptions(settings),
      rulership,
      ...(customPoints === undefined ? {} : { customPoints }),
    };

    setCompareLoad({ kind: 'loading' });

    void (async () => {
      try {
        let data: ChartData;
        switch (compareType) {
          case 'draconic': {
            const draconicData = await computeDraconic(moment, provider, options);
            data = draconicData.draconic;
            break;
          }
          case 'natal':
          default:
            data = await computeChartData(moment, provider, options);
            break;
        }
        if (!effect.cancelled) setCompareLoad({ kind: 'ready', data });
      } catch (error) {
        if (!effect.cancelled)
          setCompareLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personId, personMoment, customPoints, settings, rulership, provider, compareType]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={t.chartFallback} />
        <p>
          {t.notCompleteChart(person.displayName || t.thisPersonCapitalized)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const showHouses = person.timeAccuracy !== 'unknown';

  // When comparing, show both charts side-by-side (#439)
  if (compareType !== undefined) {
    const compareDisplayName = person.displayName ? `${person.displayName} — ${t.comparisonLabel}` : t.comparisonLabel;

    return (
      <main className="shell shell--wide">
        <div className="chart-title-row">
          <BackLink fallback={personHref(personId)} />
          <PageHeader title={person.displayName || t.chartFallback} basis={basisLine} />
        </div>
        <div className="comparison-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h2>{t.natalLabel}</h2>
            <ChartDataView
              typeSelector={<ChartTypeSelector personId={personId} type="natal" view={view} />}
              personId={personId}
              load={load}
              displayName={person.displayName}
              showHouses={showHouses}
              metaLines={metaLines}
              rulership={rulership}
              extendedSettings={settings}
              cardSettings={cardSettings}
              onExtendedSettingsChange={setSettings}
              settingsProvider={provider}
              view={view ?? 'wheel'}
              onViewChange={(next) => {
                changeChartView(personId, 'natal', next, compareType);
              }}
              buildViewHref={(next) => chartHref(personId, next, 'natal', compareType)}
            />
          </div>
          <div>
            <h2>{compareType.charAt(0).toUpperCase() + compareType.slice(1).replace(/-/g, ' ')}</h2>
            <ChartDataView
              personId={personId}
              chartType={compareType}
              load={compareLoad}
              displayName={compareDisplayName}
              showHouses={showHouses}
              metaLines={metaLines}
              rulership={rulership}
              extendedSettings={settings}
              settingsProvider={provider}
              view={view ?? 'wheel'}
              buildViewHref={(next) => chartHref(personId, next, 'natal', compareType)}
            />
          </div>
        </div>
        {lastReadyData !== undefined && <CustomPointEditor person={person} data={lastReadyData} />}
      </main>
    );
  }

  return (
    <main className="shell shell--wide">
      <div className="chart-title-row">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={person.displayName || t.chartFallback} basis={basisLine} />
      </div>
      <ChartDataView
        typeSelector={<ChartTypeSelector personId={personId} type="natal" view={view} />}
        personId={personId}
        load={load}
        displayName={person.displayName}
        showHouses={showHouses}
        metaLines={metaLines}
        rulership={rulership}
        extendedSettings={settings}
        cardSettings={cardSettings}
        onExtendedSettingsChange={setSettings}
        settingsProvider={provider}
        view={view ?? 'wheel'}
        onViewChange={(next) => {
          changeChartView(personId, 'natal', next);
        }}
        buildViewHref={(next) => chartHref(personId, next, 'natal')}
        overlayContext={
          provider === undefined
            ? undefined
            : {
                moment: person.moment,
                provider,
                baseLabel: t.natalFallback,
                baseSource: 'natal',
                options: {
                  ...toChartCalculationOptions(settings),
                  rulership,
                  ...(person.customPoints === undefined ? {} : { customPoints: person.customPoints }),
                },
              }
        }
      />
      {lastReadyData !== undefined && <CustomPointEditor person={person} data={lastReadyData} />}
    </main>
  );
}
