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
 * @exports ChartView, ChartDataView, emphasisColumns, positionColumns, houseCuspColumns, angleColumns, aspectColumns, dignityColumns, almutenCandidateColumns, conditionColumns, receptionColumns, dispositorColumns, declinationColumns, antisciaColumns, midpointTreeColumns, allMidpointsColumns, fixedStarColumns, fixedStarsScopeNoteOf, checkedStarsOf, derivedPointColumns, houseSystemLabel, zodiacLabel, rulershipLabel
 */
import { formatTimestamp } from './format.js';
import { PrintProvenance } from './PrintProvenance.js';
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import type { Zodiac } from '../ephemeris/types.js';
import { ASPECTS, aspectHarmonicFamily, DEFAULT_ORB_CONFIG, type Aspect } from '../astrology/aspects.js';
import { Select } from './primitives/Select.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aspectRows,
  chartSheetInput,
  chartSheetMetaLines,
  chartWheelRing,
  derivedPointRows,
  positionRows,
  visiblePositions,
  type PointVisibilityOptions,
  type PositionRow,
} from '../domain/chart-tables.js';
import { derivedPointPlacementFacts } from '../domain/derived-point-position.js';
import {
  computeChartData,
  housesAreDefined,
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
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  toSignWedgeStyle,
  type ExtendedSettings,
  settingsForContext,
} from '../chart/extended-settings.js';
import { resolveWheelDisplayOptions } from '../chart/wheel-options.js';
import { standaloneSvg } from '../chart/standalone-svg.js';
import { interpretationExclusions } from '../chart/object-policy.js';
import { AstroChartWheel } from './AstroChartWheel.js';
import { bodyById } from '../astrology/bodies.js';
import { SIGNS } from '../astrology/signs.js';
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
import type { SymbolClass } from '../chart/symbol-class.js';
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
import { AspectMatrixGrid } from './AspectMatrixGrid.js';
import { orbSourceName, useCalculationBasisLine } from './calculation-basis.js';
import { type TableSelection } from './table-selection.js';
import { SelectionInspector, type WheelIsolationFacts } from './SelectionInspector.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { BoundsScheme } from '../astrology/bounds.js';
import { PageHeader } from './PageHeader.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStore, useStoreState } from './store-context.js';
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
import { Button } from './primitives/Button.js';
import type { FormulaProblem } from './custom-point-problem.js';
import type { ChosenFixedStar, CustomPointDefinition } from '../domain/person.js';
import { serializeFixedStars } from './fixed-star-draft.js';
import { FormulaError, redundantBuiltInPoint } from '../domain/custom-point.js';
import { parseFormula } from '../astrology/formula-parser.js';
import {
  aspectColumns,
  declinationColumns,
  antisciaColumns,
  midpointTreeColumns,
  allMidpointsColumns,
  renderAspectsTable,
} from './ChartViewAspects.js';
import { emphasisColumns, renderElementsView } from './ChartViewElements.js';
import {
  positionColumns,
  houseCuspColumns,
  angleColumns,
  derivedPointColumns,
  fixedStarsScopeNoteOf,
  checkedStarsOf,
  fixedStarColumns,
  renderPositionsTable,
  renderHousesTable,
  renderDerivedTable,
  renderPlacementsView,
} from './ChartViewPlacements.js';
import {
  dignityColumns,
  almutenCandidateColumns,
  conditionColumns,
  dispositorColumns,
  receptionColumns,
  renderDignitiesTable,
  renderPatternsView,
} from './ChartViewPatterns.js';

export {
  aspectColumns,
  declinationColumns,
  antisciaColumns,
  midpointTreeColumns,
  allMidpointsColumns,
  fixedStarsScopeNoteOf,
  checkedStarsOf,
  fixedStarColumns,
  emphasisColumns,
  positionColumns,
  houseCuspColumns,
  angleColumns,
  derivedPointColumns,
  dignityColumns,
  almutenCandidateColumns,
  conditionColumns,
  dispositorColumns,
  receptionColumns,
};

/** The saved shape of the formula list: `enabled` only when off (#824). */
function serializeCustomPoints(points: readonly CustomPointDefinition[]): readonly {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly enabled?: boolean;
}[] {
  return points.map((point) => ({
    id: point.id,
    name: point.name,
    formula: point.formula,
    ...(point.enabled === false ? { enabled: false } : {}),
  }));
}
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

/** The Aspect matrix view (#511): the sheet's own grid, its aspect cells selecting that pair on the wheel. */
function renderMatrixView(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  t: typeof chartViewMessages.en,
  locale: Locale,
  selection?: TableSelection,
  onOpenFormulas?: () => void,
): React.ReactNode {
  const input = chartSheetInput(data, [], displayName, pointVisibility, (bodyKey) => bodyShortName(bodyKey, locale));
  return (
    <>
      <p className="hint">{t.matrixHint}</p>
      <AspectMatrixGrid
        input={input.matrix}
        label={t.matrixLabel}
        locale={locale}
        labels={{
          symbol: t.symbolLabel,
          name: t.matrixNameLabel,
          degree: t.degLabel,
          sign: t.signLabel,
          minute: t.minLabel,
          house: t.houseLabel,
          retrograde: t.retrogradeLabel,
        }}
        describe={(aKey, bKey, aspectKey) =>
          `${bodyDisplayName(aKey, locale)} ${aspectDisplayName(aspectKey, locale)} ${bodyDisplayName(bKey, locale)}`
        }
        selection={
          selection === undefined
            ? undefined
            : {
                selectedKey: selection.selectedKey,
                onToggle: selection.onToggle,
                onShowOnWheel: selection.onShowOnWheel,
                canSelect: (aKey, bKey) => selection.selectableBodies.has(aKey) && selection.selectableBodies.has(bKey),
              }
        }
      />
      {onOpenFormulas !== undefined && (
        <p className="hint">
          <Button onClick={onOpenFormulas}>{t.matrixFormulaLink}</Button>
        </p>
      )}
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
      return renderPositionsTable(data, displayName, pointVisibility, showHouses, t, locale, symbolClass, selection);
    case 'houses':
      return renderHousesTable(data, displayName, pointVisibility, t, locale, selection);
    case 'aspects':
      return renderAspectsTable(data, displayName, pointVisibility, t, locale, selection, aspectHarmonicFamilyFilter);
    case 'dignities':
      return renderDignitiesTable(data, displayName, pointVisibility, t, locale, rulership, boundsScheme);
    case 'derived':
      return renderDerivedTable(data, displayName, pointVisibility, t, locale, selection);
  }
}

/** PNG export resolutions (#67): the wheel's own default pixel size, and 2x/4x of it. */
function pngSizes(t: typeof chartViewMessages.en): readonly { readonly label: string; readonly size: number }[] {
  return [
    { label: t.pngSmall, size: 600 },
    { label: t.pngMedium, size: 1200 },
    { label: t.pngLarge, size: 2400 },
  ];
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
  customPointsSaved,
  onCustomPointsChange,
  checkFormula,
  fixedStarsSaved,
  onFixedStarsChange,
  settingsProvider,
  openSettingsRequest = 0,
  view,
  onViewChange,
  buildViewHref,
  typeSelector,
  overlayContext,
  initialTransitDate,
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
  /** The person's saved custom formula points, edited in the drawer's draft (#824); saved as one list by Apply. */
  readonly customPointsSaved?: readonly CustomPointDefinition[] | undefined;
  /** Saves the whole formula-point list in one batch (#824); omitted on screens with no person behind them. */
  readonly onCustomPointsChange?: ((next: readonly CustomPointDefinition[]) => Promise<void>) | undefined;
  /** Checks one drawer formula against this chart's own identifiers (#824); undefined when it is usable. */
  readonly checkFormula?: ((formula: string) => FormulaProblem | undefined) | undefined;
  /** The person's chosen fixed stars (#803), edited in the drawer's draft; saved as one list by Apply. */
  readonly fixedStarsSaved?: readonly ChosenFixedStar[] | undefined;
  /** Saves the whole chosen-star list in one batch (#803); omitted on screens with no person behind them. */
  readonly onFixedStarsChange?: ((next: readonly ChosenFixedStar[]) => Promise<void>) | undefined;
  /** A long-lived provider for the panel's own house-system/ayanamsa name lookups. */
  readonly settingsProvider?: EphemerisProvider | undefined;
  /** Raised by the screen around this chart (the compare link, #815) to open the Extended settings drawer on Bodies and orbs. */
  readonly openSettingsRequest?: number | undefined;
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
   * A calendar day (`YYYY-MM-DD`) the wheel opens on (#800), from the route's `?date=`: the transit ring starts on,
   * set to that day, so the wheel shows the sky of the day the Consultation screen was reading. Absent: the wheel
   * opens with no ring, as before.
   */
  readonly initialTransitDate?: string | undefined;
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
  // The matrix view's formula link opens the drawer on Bodies and orbs (#815); the drawer counts the requests.
  const [ownFormulaRequests, setOwnFormulaRequests] = useState(0);
  const openFormulaDrawer = (): void => {
    setOwnFormulaRequests((count) => count + 1);
  };
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
  const [overlaySettings, setOverlaySettings] = useState<ChartOverlaySettings>(() =>
    initialTransitDate === undefined
      ? DEFAULT_CHART_OVERLAY_SETTINGS
      : { ...DEFAULT_CHART_OVERLAY_SETTINGS, transit: true, transitDate: initialTransitDate },
  );
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
    select: selectIsolation,
    onClick: handleWheelClick,
    onKeyDown: handleWheelKeyDown,
  } = useWheelIsolation(wheelMarkup);

  // The Positions and Aspects tables share the wheel's selection (#418): a button on a row selects it on the
  // wheel, and the row the wheel has selected is marked. Only where there is a wheel, and never in the PDF.
  // The Aspects table's Show button goes further (#815): it selects the aspect, opens the Wheel view on it and
  // moves focus there (`wheelPanelRef`, once the view is shown).
  const wheelPanelRef = useRef<HTMLDivElement>(null);
  const focusWheelPending = useRef(false);
  const showOnWheel = useCallback(
    (key: string): void => {
      selectIsolation(key);
      focusWheelPending.current = true;
      setOwnTab('wheel');
      onViewChange?.('wheel');
    },
    [selectIsolation, onViewChange],
  );
  const tableSelection = useMemo((): TableSelection | undefined => {
    if (wheelMarkup === undefined || load.kind !== 'ready') return undefined;
    return {
      selectedKey: isolatedKey,
      onToggle: toggleIsolation,
      onShowOnWheel: showOnWheel,
      selectableBodies: new Set(
        visiblePositions(load.data.positions, pointVisibility).map((position) => bodyById(position.body)?.key ?? ''),
      ),
    };
  }, [wheelMarkup, load, isolatedKey, toggleIsolation, showOnWheel, pointVisibility]);

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

  // After "Show" on a table row (#815) the Wheel view is visible: focus its named region and bring it into view.
  // Deferred a frame because the app moves focus to the screen's heading on every route change (`App.tsx`, #69),
  // and that effect runs after this one, in the same commit.
  useEffect(() => {
    if (currentTab !== 'wheel' || !focusWheelPending.current) return undefined;
    focusWheelPending.current = false;
    const frame = requestAnimationFrame(() => {
      const panel = wheelPanelRef.current;
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ block: 'start' });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [currentTab]);

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

  // The overlay rings belong to the wheel, so the Overlays trigger only exists where the wheel does. It opens a right
  // slide-over drawer beside the wheel (#817) and sits in the pinned cluster, and in the Chart actions sheet at 40rem
  // and below, with Extended settings; that card needs the long-lived provider.
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
        customPoints={customPointsSaved}
        onCustomPointsChange={onCustomPointsChange}
        checkFormula={checkFormula}
        fixedStars={fixedStarsSaved}
        onFixedStarsChange={onFixedStarsChange}
        openRequest={openSettingsRequest + ownFormulaRequests}
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
          Overlays and Extended settings triggers pinned at the far right (#818, #817). The row stays in place while the chart
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
          actions={
            overlaysPanel === null && settingsPanel === null ? undefined : (
              <>
                {overlaysPanel}
                {settingsPanel}
              </>
            )
          }
        />
      )}
      {!showHouses && <p className="hint">{t.housesUnknownHint(displayName || t.thisPerson)}</p>}
      {showHouses && !housesComputed && <p className="hint">{t.housesUndefinedHint(displayName || t.thisPerson)}</p>}

      {/* The result region: busy while the chart (re)calculates, as the Astrocartography map is. */}
      <div aria-busy={load.kind === 'loading'}>
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
                            symbolClass,
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
                  <div
                    id="chart-view-wheel"
                    ref={wheelPanelRef}
                    tabIndex={-1}
                    role="region"
                    aria-label={t.wheelViewLabel}
                    hidden={currentTab !== 'wheel'}
                  >
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
                            <div className="aspect-family-filter">
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
                      renderMatrixView(
                        load.data,
                        displayName,
                        pointVisibility,
                        t,
                        locale,
                        tableSelection,
                        settingsPanel === null ? undefined : openFormulaDrawer,
                      )}
                    {currentTab === 'elements' &&
                      renderElementsView(load.data, displayName, pointVisibility, t, locale)}
                    {currentTab === 'placements' &&
                      renderPlacementsView(
                        load.data,
                        displayName,
                        pointVisibility,
                        housesRenderable,
                        t,
                        locale,
                        symbolClass,
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
                        boundsScheme,
                      )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function ChartView({
  personId,
  view,
  compareType,
  date,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
  compareType?: ChartType | undefined;
  /** The day the wheel opens on (#800), from the route's `?date=`. */
  date?: string | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const customPoints = useStableBy(person?.customPoints, (points) => JSON.stringify(points ?? []));
  const fixedStars = useStableBy(person?.fixedStars, (stars) => JSON.stringify(stars ?? []));
  const t = useMessages(chartViewMessages);
  const chartTypeT = useMessages(chartTypesMessages);
  const [locale] = useLocale();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [compareLoad, setCompareLoad] = useState<Load>({ kind: 'loading' });
  const [lastReadyData, setLastReadyData] = useState<ChartData | undefined>();
  // Raised by the compare screen's formula link (#815) to open the drawer on Bodies and orbs.
  const [compareFormulaRequest, setCompareFormulaRequest] = useState(0);
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
  // The page title names the chart type as well as the person (#885): "Natal · Name", or "Natal and harmonic charts · Name" when comparing.
  const titleName = person === undefined || person.displayName === '' ? t.chartFallback : person.displayName;
  const pageTitle =
    compareType === undefined
      ? t.chartTitle(chartTypeT.typeLabels.natal, titleName)
      : t.comparisonChartTitle(titleName);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = pageTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);
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
  const store = useStore();

  /** Saves the drawer's whole formula list as the person's one register (#824), one batch. */
  const saveCustomPoints = useCallback(
    async (next: readonly CustomPointDefinition[]): Promise<void> => {
      await store.mutate([
        { entity: 'person', entityId: personId, field: 'customPoints', value: serializeCustomPoints(next) },
      ]);
    },
    [store, personId],
  );

  /** Saves the drawer's chosen fixed stars as the person's one `fixedStars` register (#803, D-803b). */
  const saveFixedStars = useCallback(
    async (next: readonly ChosenFixedStar[]): Promise<void> => {
      await store.mutate([
        { entity: 'person', entityId: personId, field: 'fixedStars', value: serializeFixedStars(next) },
      ]);
    },
    [store, personId],
  );

  /** Checks a drawer formula against this chart's own identifiers (#824). */
  const checkFormula = useCallback(
    (formula: string): FormulaProblem | undefined => {
      if (lastReadyData === undefined) {
        try {
          // No chart yet: only the grammar can be checked, through the same parser the chart uses.
          parseFormula(formula);
          return undefined;
        } catch (cause) {
          return { kind: 'invalid', message: cause instanceof FormulaError ? cause.message : String(cause) };
        }
      }
      try {
        const duplicate = redundantBuiltInPoint(lastReadyData, formula);
        return duplicate === undefined ? undefined : { kind: 'redundant', name: duplicate };
      } catch (cause) {
        return { kind: 'invalid', message: cause instanceof FormulaError ? cause.message : String(cause) };
      }
    },
    [lastReadyData],
  );

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
    const chartKey = `${personId}|${momentKey(moment)}|${JSON.stringify(settings)}|${customPointsKey}|${JSON.stringify(fixedStars ?? [])}`;
    const sameChart = lastChartKey.current === chartKey;
    lastChartKey.current = chartKey;
    setLoad((current) => (sameChart && current.kind === 'ready' ? current : { kind: 'loading' }));

    void (async () => {
      try {
        const data = await computeChartData(moment, provider, {
          ...toChartCalculationOptions(settings),
          rulership,
          ...(customPoints === undefined ? {} : { customPoints }),
          ...(fixedStars === undefined ? {} : { fixedStars }),
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
  }, [settingsUnreadable, personId, personMoment, customPoints, fixedStars, settings, rulership, provider]);

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
      ...(fixedStars === undefined ? {} : { fixedStars }),
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
  }, [
    settingsUnreadable,
    personId,
    personMoment,
    customPoints,
    fixedStars,
    settings,
    rulership,
    provider,
    compareType,
  ]);

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
        <PageHeader title={pageTitle} />
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
          <PageHeader title={pageTitle} basis={basisLine} />
        </div>
        <div className="comparison-container comparison-layout">
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
              customPointsSaved={person.customPoints}
              onCustomPointsChange={saveCustomPoints}
              checkFormula={checkFormula}
              fixedStarsSaved={person.fixedStars}
              onFixedStarsChange={saveFixedStars}
              settingsProvider={provider}
              openSettingsRequest={compareFormulaRequest}
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
        {provider !== undefined && (
          <p className="hint">
            <Button
              onClick={() => {
                setCompareFormulaRequest((count) => count + 1);
              }}
            >
              {t.compareFormulaLink}
            </Button>
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="shell shell--wide">
      <div className="chart-title-row">
        <BackLink fallback={personHref(personId)} />
        <PageHeader title={pageTitle} basis={basisLine} />
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
        customPointsSaved={person.customPoints}
        onCustomPointsChange={saveCustomPoints}
        checkFormula={checkFormula}
        fixedStarsSaved={person.fixedStars}
        onFixedStarsChange={saveFixedStars}
        settingsProvider={provider}
        view={view ?? 'wheel'}
        onViewChange={(next) => {
          changeChartView(personId, 'natal', next);
        }}
        buildViewHref={(next) => chartHref(personId, next, 'natal', undefined, date)}
        initialTransitDate={date}
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
    </main>
  );
}
