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
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  almutenOfAscendant,
  angleRows,
  antisciaRows,
  aspectRows,
  chartShapeOf,
  chartSheetInput,
  chartSheetMetaLines,
  declinationContactRows,
  derivedPointRows,
  dignityRows,
  dispositorRows,
  fixedStarRows,
  houseCuspRows,
  positionRows,
  visiblePositions,
  type AngleRow,
  type AntisciaRow,
  type AspectRow,
  type DeclinationContactRow,
  type DerivedPointRow,
  type DignityRow,
  type DispositorRow,
  type FixedStarRow,
  type HouseCuspRow,
  type PointVisibilityOptions,
  type PositionRow,
} from '../domain/chart-tables.js';
import { computeChartData, housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { encodeChartShareLink } from '../domain/chart-share.js';
import { momentKey } from '../time/encode.js';
import { renderChartSheetSvg } from '../chart/chart-sheet.js';
import { renderJonesShapeDiagramSvg } from '../chart/jones-shape-diagram.js';
import { lunarPhaseOf } from '../astrology/lunar-phase.js';
import { jonesBodyPositions } from '../astrology/jones-shapes.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  toSignWedgeStyle,
  type ExtendedSettings,
} from '../chart/extended-settings.js';
import { standaloneSvg } from '../chart/standalone-svg.js';
import { resolveWheelDisplayOptions } from '../chart/wheel-options.js';
import { AstroChartWheel } from './AstroChartWheel.js';
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { SIGNS } from '../astrology/signs.js';
import { aspectDisplayName, bodyDisplayName, bodyShortName, signDisplayName } from './astro-names.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { svgToPngBlob } from './chart-raster.js';
import { downloadBlob, downloadText } from './download.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { ExtendedSettingsPanel } from './ExtendedSettingsPanel.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { aspectKeyFor, useWheelIsolation } from './wheel-interaction.js';
import { bodyGlyph, renderGlyph } from '../chart/glyphs.js';
import type { SymbolClass } from '../chart/symbol-class.js';
import { unicodeSymbol, textSymbol } from '../chart/symbol-text.js';
import { useSymbolClass } from './symbol-setting.js';
import { useRegisterExports } from './export-registry.js';
import { CHART_SECTIONS, chartSectionLabels, type ChartSection } from './chart-sections.js';
import { ChartTypeSelector, changeChartSection } from './ChartTypeSelector.js';
import { bodyId } from '../chart/body-id.js';
import { WheelSelectionText } from './WheelSelectionText.js';
import { parseSelectionKey } from '../interpretation/selection.js';
import { buildFocusObjectContext } from '../interpretation/focus-context.js';
import { FocusInterpretation } from './FocusInterpretation.js';
import { useRulershipChoice } from './rulership-setting.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import { PersonNotFound } from './PersonNotFound.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import type { EphemerisProvider } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import type { BirthMomentInput } from '../time/types.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData }
  | { readonly kind: 'error'; readonly message: string };

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
 * What a table needs to be linked to the wheel (#418): the wheel's current selection, how to toggle one, and
 * which bodies the wheel actually draws (an Ascendant row has no body symbol to select). Absent when the
 * table stands alone, as in the PDF export.
 */
interface TableSelection {
  readonly selectedKey: string | undefined;
  readonly onToggle: (key: string) => void;
  readonly selectableBodies: ReadonlySet<string>;
}

/** The wheel's selection key for a body, or an aspect between two. */
const bodySelectionKey = (bodyKey: string): string => `body:${bodyId(bodyKey, 0)}`;
const aspectSelectionKey = (row: AspectRow): string => aspectKeyFor(bodyId(row.bodyAKey, 0), bodyId(row.bodyBKey, 0));

/** The column of "show on the chart" buttons: a real button per row, so the keyboard reaches the wheel's selection too. */
function selectColumn<T>(
  t: typeof chartViewMessages.en,
  selection: TableSelection,
  keyOf: (row: T) => string | undefined,
  nameOf: (row: T) => string,
): TableColumn<T> {
  return {
    key: 'select',
    label: t.showOnChartColumn,
    valueOf: (row) => (keyOf(row) !== undefined && keyOf(row) === selection.selectedKey ? 0 : 1),
    renderCell: (row) => {
      const key = keyOf(row);
      if (key === undefined) return null;
      return (
        <button
          type="button"
          className="quiet"
          aria-pressed={selection.selectedKey === key}
          aria-label={t.showOnChart(nameOf(row))}
          onClick={() => {
            selection.onToggle(key);
          }}
        >
          {t.showOnChartButton}
        </button>
      );
    },
  };
}

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

function positionColumns(
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
    {
      key: 'house',
      label: t.houseLabel,
      valueOf: (row) => row.house ?? '',
      render: (row) => (row.house === undefined ? '—' : String(row.house)),
    },
    {
      key: 'speed',
      label: t.speedLabel,
      valueOf: (row) => row.speed ?? '',
      render: (row) => (row.speed === undefined ? '—' : row.speed.toFixed(4)),
    },
    {
      key: 'retrograde',
      label: t.rxLabel,
      valueOf: (row) => row.retrograde ?? false,
      render: (row) => (row.retrograde ? '℞' : ''),
    },
    {
      key: 'anaretic',
      label: t.anareticLabel,
      valueOf: (row) => row.anaretic,
      render: (row) => (row.anaretic ? '✓' : ''),
    },
    {
      key: 'outOfBounds',
      label: t.outOfBoundsLabel,
      valueOf: (row) => row.outOfBounds ?? false,
      render: (row) => (row.outOfBounds === true ? '✓' : ''),
    },
  ];
}

function houseCuspColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<HouseCuspRow>[] {
  return [
    { key: 'house', label: t.houseLabel, valueOf: (row) => row.house },
    ...degreeColumns<HouseCuspRow>(t, locale),
  ];
}

function angleColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<AngleRow>[] {
  return [{ key: 'label', label: t.angleLabel, valueOf: (row) => row.label }, ...degreeColumns<AngleRow>(t, locale)];
}

function aspectColumns(
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
      valueOf: (row) => row.aspect,
      render: (row) => aspectDisplayName(row.aspectKey, locale),
    },
    {
      key: 'bodyBName',
      label: t.bodyBLabel,
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

function dignityColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<DignityRow>[] {
  return [
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    { key: 'ruler', label: t.rulerLabel, valueOf: (row) => row.ruler, render: (row) => (row.ruler ? '✓' : '') },
    {
      key: 'exalted',
      label: t.exaltedLabel,
      valueOf: (row) => row.exalted,
      render: (row) => (row.exalted ? '✓' : ''),
    },
    {
      key: 'detriment',
      label: t.detrimentLabel,
      valueOf: (row) => row.detriment,
      render: (row) => (row.detriment ? '✓' : ''),
    },
    { key: 'fall', label: t.fallLabel, valueOf: (row) => row.fall, render: (row) => (row.fall ? '✓' : '') },
    {
      key: 'triplicity',
      label: t.triplicityLabel,
      valueOf: (row) => row.triplicity,
      render: (row) => (row.triplicity ? '✓' : ''),
    },
    { key: 'bound', label: t.boundLabel, valueOf: (row) => row.bound, render: (row) => (row.bound ? '✓' : '') },
    { key: 'face', label: t.faceLabel, valueOf: (row) => row.face, render: (row) => (row.face ? '✓' : '') },
    { key: 'points', label: t.dignityPointsLabel, valueOf: (row) => row.points },
    {
      key: 'peregrine',
      label: t.peregrineLabel,
      valueOf: (row) => row.peregrine,
      render: (row) => (row.peregrine ? '✓' : ''),
    },
  ];
}

function dispositorColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<DispositorRow>[] {
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
      valueOf: (row) => row.chain.join(' '),
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
      render: (row) => (row.mutualReception ? '✓' : ''),
    },
  ];
}

function declinationColumns(
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
    { key: 'kind', label: t.kindLabel, valueOf: (row) => row.kind, render: (row) => t[row.kind] },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => `${row.orb.toFixed(2)}°` },
  ];
}

function antisciaColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<AntisciaRow>[] {
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
      valueOf: (row) => row.kind,
      render: (row) => (row.kind === 'antiscion' ? t.antiscion : t.contraAntiscion),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => `${row.orb.toFixed(2)}°` },
  ];
}

function fixedStarColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<FixedStarRow>[] {
  return [
    // Star names (Regulus, Spica, ...) are proper nouns, the same in both locales — no glossary
    // lookup needed, unlike body/aspect names.
    { key: 'star', label: t.starLabel, valueOf: (row) => row.star },
    {
      key: 'bodyName',
      label: t.bodyLabel,
      valueOf: (row) => row.bodyName,
      render: (row) => bodyDisplayName(row.bodyKey, locale),
    },
    { key: 'orb', label: t.orbLabel, valueOf: (row) => row.orb, render: (row) => `${row.orb.toFixed(2)}°` },
  ];
}

function derivedPointColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<DerivedPointRow>[] {
  return [
    { key: 'label', label: t.pointLabel, valueOf: (row) => row.label },
    ...degreeColumns<DerivedPointRow>(t, locale),
  ];
}

/** The sections of the chart screen (#430), in reading order: the wheel, the overall pattern, then the detail. */
type TabKey = ChartSection;
/** The sections that are tables, as opposed to the wheel and the chart-shape panel. */
type TableTabKey = Exclude<TabKey, 'chart' | 'shape'>;

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
  selection?: TableSelection,
): React.ReactNode {
  switch (tab) {
    case 'positions':
      return (
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
      );
    case 'houses':
      return (
        <>
          <SortableTable
            caption={t.housesCaption}
            columns={houseCuspColumns(t, locale)}
            rows={houseCuspRows(data)}
            getRowKey={(row) => String(row.house)}
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
      const declinationRows = declinationContactRows(data);
      const antiscionRows = antisciaRows(data);
      const starRows = fixedStarRows(data, pointVisibility);
      return (
        <>
          <SortableTable
            caption={t.aspectsCaption}
            columns={aspectColumns(t, locale, selection)}
            rows={aspectRows(data)}
            getRowKey={(row) => `${row.bodyAKey}-${row.aspect}-${row.bodyBKey}`}
            selectedRowKey={(() => {
              const chosen =
                selection?.selectedKey === undefined
                  ? undefined
                  : aspectRows(data).find((row) => aspectSelectionKey(row) === selection.selectedKey);
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
              columns={declinationColumns(t, locale)}
              rows={declinationRows}
              getRowKey={(row) => `${row.bodyAKey}-${row.kind}-${row.bodyBKey}`}
              downloadFilename={deriveExportFilename(displayName, 'declinations', 'csv')}
            />
          )}
          {starRows.length > 0 && (
            <SortableTable
              caption={t.fixedStarsCaption}
              columns={fixedStarColumns(t, locale)}
              rows={starRows}
              getRowKey={(row) => `${row.star}-${row.bodyKey}`}
              downloadFilename={deriveExportFilename(displayName, 'fixed-stars', 'csv')}
            />
          )}
        </>
      );
    }
    case 'dignities': {
      const almuten = almutenOfAscendant(data, rulership);
      return (
        <>
          {almuten !== undefined && (
            <p className="hint">
              {t.almutenOfAscendantSentence(almuten.almutens.map((key) => bodyDisplayName(key, locale)).join(', '))}
            </p>
          )}
          <SortableTable
            caption={t.dignitiesCaption}
            columns={dignityColumns(t, locale)}
            rows={dignityRows(data, pointVisibility, rulership)}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'dignities', 'csv')}
          />
          <SortableTable
            caption={t.dispositorsCaption}
            columns={dispositorColumns(t, locale)}
            rows={dispositorRows(data, pointVisibility, rulership)}
            getRowKey={(row) => row.bodyKey}
            downloadFilename={deriveExportFilename(displayName, 'dispositors', 'csv')}
          />
        </>
      );
    }
    case 'derived':
      return (
        <SortableTable
          caption={t.derivedPointsCaption}
          columns={derivedPointColumns(t, locale)}
          rows={derivedPointRows(data, pointVisibility)}
          getRowKey={(row) => row.label}
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
    </>
  );
}

const tabLabels = chartSectionLabels;

/** Every tab in display order; the caller drops `chart` (no wheel), `houses` and `derived` when the chart has no houses. */
const TAB_ORDER: readonly TabKey[] = CHART_SECTIONS;

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

/**
 * Click-to-isolate (#400, #412): what's currently clicked on the wheel, and everything derived
 * from it — which body, sign and aspect-pair keys stay at full strength, plus the focused-info
 * content. A mouse/touch-only enhancement layered on an already-`aria-hidden` wheel (see the
 * wheel div's own doc comment) — not a keyboard-accessible widget, since the data tables already
 * are the accessible path to every value this exposes.
 */
interface WheelIsolationFacts {
  readonly heading: string;
  readonly positionRow?: PositionRow | undefined;
  readonly relatedAspects: readonly AspectRow[];
  readonly aspectRow?: AspectRow | undefined;
  /** For a clicked sign: the bodies drawn in it. */
  readonly bodiesInSign?: readonly PositionRow[] | undefined;
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
): WheelIsolationFacts | undefined {
  const selection = parseSelectionKey(isolatedKey);
  if (selection === undefined) return undefined;
  const allPositions = positionRows(data, pointVisibility, housesRenderable);
  const allAspects = aspectRows(data);

  if (selection.kind === 'body') {
    const value = selection.key;
    const positionRow = allPositions.find((row) => row.bodyKey === value);
    return {
      heading: positionRow !== undefined ? bodyDisplayName(positionRow.bodyKey, locale) : value,
      positionRow,
      relatedAspects: allAspects.filter((row) => row.bodyAKey === value || row.bodyBKey === value),
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
 * Copies a #65 share link for one birth moment to the clipboard — the chart itself is
 * always recomputed from `moment` on the recipient's end, so this is the entire payload;
 * nothing is sent anywhere to produce it.
 */
function ShareLink({
  moment,
  housesKnown,
}: {
  readonly moment: BirthMomentInput;
  readonly housesKnown: boolean;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    const query = encodeChartShareLink({ moment, settings: {}, housesKnown }).toString();
    const url = `${window.location.origin}${window.location.pathname}#/shared?${query}`;
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      // A denied clipboard permission leaves the screen exactly as it was; there is
      // nothing else to recover from, so this is deliberately silent.
      () => undefined,
    );
  };

  return (
    <>
      <p>
        <button type="button" className="quiet" onClick={copy}>
          {copied ? t.linkCopied : t.copyShareLink}
        </button>{' '}
        <span className="hint">{t.shareLinkHint}</span>
      </p>
      {/* `.warning`, not the `.hint` above it (#341). There is no server-side state behind
          a share link, so there is nothing to revoke — the only place that can be said is
          before the link exists, and grey small print is how it would be missed. */}
      <p className="warning share-warning">{t.shareLinkWarning}</p>
    </>
  );
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
  extendedSettings = DEFAULT_EXTENDED_SETTINGS,
  onExtendedSettingsChange,
  settingsProvider,
  section,
  onSectionChange,
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
   * The confirmed (post-Redraw) extended settings (#52): house system, zodiac,
   * orb rules, minor aspects, point visibility, and the wheel's sign-wedge
   * style. Defaults to `DEFAULT_EXTENDED_SETTINGS` so `SharedChartView` — which
   * has no panel and doesn't pass any of these three props — renders exactly as
   * it did before this feature existed.
   */
  readonly extendedSettings?: ExtendedSettings;
  /**
   * Set together with `settingsProvider`: when both are given, the "Extended
   * settings" panel is rendered and this is wired as its `onRedraw`. Omitted by
   * `SharedChartView`, which has no panel.
   */
  readonly onExtendedSettingsChange?: (next: ExtendedSettings) => void;
  /** A long-lived provider for the panel's own house-system/ayanamsa name lookups. */
  readonly settingsProvider?: EphemerisProvider | undefined;
  /** The open section, when the URL decides it (the natal chart); see `chart-sections.ts`. */
  readonly section?: ChartSection | undefined;
  readonly onSectionChange?: ((section: ChartSection) => void) | undefined;
}): React.JSX.Element {
  const t = useMessages(chartViewMessages);
  const [locale] = useLocale();
  const [rulership] = useRulershipChoice();
  // Controlled by the URL where a screen supplies `section` (the natal chart: the header's menu and these tabs
  // name the same sections); otherwise the tab is this component's own state.
  const [ownTab, setOwnTab] = useState<TabKey>('chart');
  const activeTab: TabKey = section ?? ownTab;
  const setActiveTab = (next: TabKey): void => {
    setOwnTab(next);
    onSectionChange?.(next);
  };
  const [symbolClass] = useSymbolClass();
  // True only for the moment between clicking "Export PDF" and the print dialog closing
  // (see `exportPdf` below): while true, every table renders at once instead of just the
  // active tab, so the PDF the browser's own "Save as PDF" produces has all of them (#67).
  const [printAll, setPrintAll] = useState(false);

  const pointVisibility = toPointVisibilityOptions(extendedSettings);

  // #378: `showHouses` alone (passed in from `person.timeAccuracy`) isn't enough — a *known*
  // birth time at a latitude where the chosen house system has no solution still produces
  // `HousePositions`, just one whose cusps/angles are `NaN` (see `housesAreDefined`'s own doc
  // comment). `housesComputed` stays `true` before `load` is ready so it never itself suppresses
  // anything ahead of data actually arriving; `housesRenderable` is what every house-dependent
  // render below should gate on instead of the raw `showHouses` prop.
  const housesComputed = load.kind !== 'ready' || housesAreDefined(load.data.houses);
  const housesRenderable = showHouses && housesComputed;

  const sheet = useMemo(() => {
    if (load.kind !== 'ready' || !housesRenderable) return undefined;
    return renderChartSheetSvg(
      chartSheetInput(
        load.data,
        metaLines ?? [displayName || t.chartFallback],
        displayName || t.natalFallback,
        toPointVisibilityOptions(extendedSettings),
        (bodyKey) => bodyShortName(bodyKey, locale),
      ),
      {
        ...resolveWheelDisplayOptions({}),
        signWedgeStyle: toSignWedgeStyle(extendedSettings),
      },
    );
  }, [load, housesRenderable, displayName, metaLines, extendedSettings, t, locale, symbolClass]);

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
  } = useWheelIsolation(sheet);

  // The Positions and Aspects tables share the wheel's selection (#418): a button on a row selects it on the
  // wheel, and the row the wheel has selected is marked. Only where there is a wheel, and never in the PDF.
  const tableSelection = useMemo((): TableSelection | undefined => {
    if (sheet === undefined || load.kind !== 'ready') return undefined;
    return {
      selectedKey: isolatedKey,
      onToggle: toggleIsolation,
      selectableBodies: new Set(
        visiblePositions(load.data.positions, pointVisibility).map((position) => bodyById(position.body)?.key ?? ''),
      ),
    };
  }, [sheet, load, isolatedKey, toggleIsolation, pointVisibility]);

  const isolation = useMemo(() => {
    if (isolatedKey === undefined || load.kind !== 'ready') return undefined;
    return resolveWheelIsolation(isolatedKey, load.data, pointVisibility, housesRenderable, locale);
  }, [isolatedKey, load, pointVisibility, housesRenderable, locale]);

  // What the "interpret the tensions of this placement" button would send: only for a selected planet (#424).
  const focusContext = useMemo(() => {
    if (isolatedKey === undefined || load.kind !== 'ready') return undefined;
    const selection = parseSelectionKey(isolatedKey);
    return selection?.kind === 'body'
      ? buildFocusObjectContext(load.data, selection.key, undefined, rulership)
      : undefined;
  }, [isolatedKey, load, rulership]);

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
    downloadText(deriveExportFilename(displayName, 'chart', 'svg'), standaloneSvg(sheet.markup), 'image/svg+xml');
  };

  /** Rejects with the rasterizer's own message, which the header's export status shows. */
  const downloadPng = async (size: number): Promise<void> => {
    if (sheet === undefined) return;
    // The sheet is taller than it is wide, so the chosen size is its width and
    // the height follows its own aspect ratio — rasterizing it square would
    // squash the wheel into an ellipse.
    const pngHeight = Math.round((size * sheet.height) / sheet.width);
    const blob = await svgToPngBlob(standaloneSvg(sheet.markup), size, pngHeight);
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

  // The sections this chart can show (#430): the wheel (and the Houses and Derived points tables) are built
  // on the Ascendant, so a chart without houses has none of them and opens on the next section instead.
  const tabs: readonly TabKey[] = TAB_ORDER.filter((tab) =>
    tab === 'chart' ? sheet !== undefined : tab === 'houses' || tab === 'derived' ? housesRenderable : true,
  );
  // A chosen tab that has since gone (a setting made the houses undefined) falls back to the first one shown.
  const currentTab: TabKey = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? 'shape');

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = tabs.indexOf(currentTab);
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (next === undefined) return;
    setActiveTab(next);
    document.getElementById(`chart-tab-${next}`)?.focus();
  };

  /** The wheel, what a click isolates, the interpret button and the exports: everything the Chart section holds. */
  const renderChartPanel = (data: ChartData): React.ReactNode =>
    sheet === undefined ? null : (
      <>
        <h2>{t.chartTabLabel}</h2>
        <p className="hint chart-wheel-hint">{t.wheelClickHint}</p>
        <div
          ref={wheelRef}
          className="chart-wheel chart-wheel-interactive"
          // Hidden from assistive tech rather than given an aria-label (#69): a chart
          // wheel packs dozens of positions/aspects into overlapping glyphs, and no short
          // label does that justice. The data tables right below are the actual accessible
          // equivalent — they carry every value the wheel draws, as text a screen reader
          // can read directly. Click-to-isolate (#400) stays a mouse/touch-only
          // enhancement layered on top of that decision, not a reason to revisit it: the
          // tables remain the one accessible path to every value the wheel draws, clicked
          // or not.
          aria-hidden="true"
          // The wheel is generated entirely by this app from data it just computed — never
          // user-supplied markup — so injecting it is the same trust boundary as any other
          // value this component renders, just carried as a string instead of JSX.
          dangerouslySetInnerHTML={{ __html: sheet.markup }}
          onClick={handleWheelClick}
        />

        {isolation !== undefined && (
          <div className="chart-isolation-panel">
            <div className="chart-isolation-head">
              <strong>{isolation.heading}</strong>
              <button type="button" className="quiet" onClick={clearIsolation}>
                {t.isolationClear}
              </button>
            </div>
            {isolation.bodiesInSign !== undefined &&
              (isolation.bodiesInSign.length === 0 ? (
                <p className="hint">{t.isolationSignEmpty}</p>
              ) : (
                <p>
                  {isolation.bodiesInSign
                    .map(
                      (row) =>
                        `${bodyDisplayName(row.bodyKey, locale)} ${String(row.degree)}°${String(row.minute).padStart(2, '0')}'`,
                    )
                    .join(', ')}
                </p>
              ))}
            {isolation.positionRow !== undefined && (
              <p>
                {signDisplayName(isolation.positionRow.sign, locale)} {isolation.positionRow.degree}°
                {String(isolation.positionRow.minute).padStart(2, '0')}'
                {isolation.positionRow.house !== undefined && ` — ${t.houseLabel} ${isolation.positionRow.house}`}
              </p>
            )}
            {isolation.relatedAspects.length > 0 && (
              <ul>
                {isolation.relatedAspects.map((row) => {
                  const otherKey = row.bodyAKey === isolation.positionRow?.bodyKey ? row.bodyBKey : row.bodyAKey;
                  const otherName = bodyDisplayName(otherKey, locale);
                  return (
                    <li key={`${row.bodyAKey}-${row.aspectKey}-${row.bodyBKey}`}>
                      {aspectDisplayName(row.aspectKey, locale)} {otherName} ({row.orb.toFixed(2)}°,{' '}
                      {row.applying ? t.applying : t.separating})
                    </li>
                  );
                })}
              </ul>
            )}
            {isolation.aspectRow !== undefined && (
              <p>
                {aspectDisplayName(isolation.aspectRow.aspectKey, locale)} — {t.orbLabel}{' '}
                {isolation.aspectRow.orb.toFixed(2)}°, {isolation.aspectRow.applying ? t.applying : t.separating}
              </p>
            )}
            {isolatedKey !== undefined && (
              <WheelSelectionText chart={data} selectionKey={isolatedKey} locale={locale} />
            )}
          </div>
        )}

        {isolatedKey !== undefined && focusContext !== undefined && (
          <FocusInterpretation context={focusContext} locale={locale} resetKey={isolatedKey} />
        )}

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

  return (
    <>
      {!showHouses && <p className="hint">{t.housesUnknownHint(displayName || t.thisPerson)}</p>}
      {showHouses && !housesComputed && <p className="hint">{t.housesUndefinedHint(displayName || t.thisPerson)}</p>}

      {load.kind === 'loading' && <p className="status">{t.calculating}</p>}

      {load.kind === 'error' && (
        <p className="warning" role="alert">
          {t.chartError(load.message)}
        </p>
      )}

      {load.kind === 'ready' && (
        <>
          {load.data.houses.warning !== undefined && (
            <p className="warning" role="alert">
              {load.data.houses.warning}
            </p>
          )}

          {onExtendedSettingsChange !== undefined && settingsProvider !== undefined && (
            <ExtendedSettingsPanel
              value={extendedSettings}
              onRedraw={onExtendedSettingsChange}
              provider={settingsProvider}
            />
          )}

          {printAll ? (
            <div className="chart-print-all">
              {tabs.map((tab) => (
                <section key={tab}>
                  {tab === 'chart' ? (
                    renderChartPanel(load.data)
                  ) : (
                    <>
                      <h2>{tabLabels(t)[tab]}</h2>
                      {tab === 'shape'
                        ? renderShapeSection(load.data, housesRenderable, t, locale)
                        : renderTableTab(
                            tab,
                            load.data,
                            displayName,
                            pointVisibility,
                            housesRenderable,
                            t,
                            locale,
                            rulership,
                            symbolClass,
                          )}
                    </>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <>
              <div className="tabs" role="tablist" aria-label={t.chartDataTablist} onKeyDown={onTabKeyDown}>
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    id={`chart-tab-${tab}`}
                    role="tab"
                    aria-selected={currentTab === tab}
                    aria-controls={`chart-tabpanel-${tab}`}
                    tabIndex={currentTab === tab ? 0 : -1}
                    className={currentTab === tab ? 'tab active' : 'tab'}
                    onClick={() => {
                      setActiveTab(tab);
                    }}
                  >
                    {tabLabels(t)[tab]}
                  </button>
                ))}
              </div>

              {/* The wheel stays mounted while another section is open, so a selection on it survives a
                  visit to the tables; every other section is only in the page while it is shown. */}
              {tabs.includes('chart') && (
                <div
                  role="tabpanel"
                  id="chart-tabpanel-chart"
                  aria-labelledby="chart-tab-chart"
                  tabIndex={0}
                  hidden={currentTab !== 'chart'}
                >
                  {renderChartPanel(load.data)}
                </div>
              )}
              {currentTab !== 'chart' && (
                <div
                  role="tabpanel"
                  id={`chart-tabpanel-${currentTab}`}
                  aria-labelledby={`chart-tab-${currentTab}`}
                  tabIndex={0}
                >
                  <h2>{tabLabels(t)[currentTab]}</h2>
                  {tableSelection !== undefined && isolation !== undefined && (
                    <p className="chart-selection-bar" role="status">
                      {t.selectedOnChart(isolation.heading)}{' '}
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => {
                          setActiveTab('chart');
                        }}
                      >
                        {t.goToChart}
                      </button>{' '}
                      <button type="button" className="quiet" onClick={clearIsolation}>
                        {t.isolationClear}
                      </button>
                    </p>
                  )}
                  {currentTab === 'shape'
                    ? renderShapeSection(load.data, housesRenderable, t, locale)
                    : renderTableTab(
                        currentTab,
                        load.data,
                        displayName,
                        pointVisibility,
                        housesRenderable,
                        t,
                        locale,
                        rulership,
                        symbolClass,
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
  section,
}: {
  personId: string;
  section?: ChartSection | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(chartViewMessages);
  const [locale] = useLocale();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [settings, setSettings] = useState<ExtendedSettings>(DEFAULT_EXTENDED_SETTINGS);
  const [rulership] = useRulershipChoice();
  const lastChartKey = useRef('');
  // Memoised: it is a dependency of the wheel's markup, and a new array on every render of this screen (which a
  // change of section now causes) would redraw the wheel and drop what was selected on it.
  const personMoment = person?.moment;
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
    if (person?.moment === undefined || provider === undefined) return undefined;
    const moment = person.moment;
    // A mutable holder rather than a `let`, matching `App.tsx`'s own effect below.
    const effect = { cancelled: false };
    // Only the planetary rulers changed (#426): keep the chart on screen while it is recalculated
    // rather than going back to "loading", so the settings panel the choice was made in stays open.
    const sameChart = lastChartKey.current === `${personId}|${momentKey(moment)}|${JSON.stringify(settings)}`;
    lastChartKey.current = `${personId}|${momentKey(moment)}|${JSON.stringify(settings)}`;
    setLoad((current) => (sameChart && current.kind === 'ready' ? current : { kind: 'loading' }));

    void (async () => {
      try {
        const data = await computeChartData(moment, provider, { ...toChartCalculationOptions(settings), rulership });
        if (!effect.cancelled) setLoad({ kind: 'ready', data });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [personId, momentKey(person?.moment), settings, rulership, provider]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <p className="back">
          <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.chartFallback}</h1>
        <p>
          {t.notCompleteChart(person.displayName || t.thisPersonCapitalized)}{' '}
          <a href={`#/person/${personId}`}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const showHouses = person.timeAccuracy !== 'unknown';

  return (
    <main className="shell">
      <p className="back">
        <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{person.displayName || t.chartFallback}</h1>
      <ChartTypeSelector personId={personId} type="natal" section={section} />
      <ShareLink moment={person.moment} housesKnown={showHouses} />
      <ChartDataView
        load={load}
        displayName={person.displayName}
        showHouses={showHouses}
        metaLines={metaLines}
        extendedSettings={settings}
        onExtendedSettingsChange={setSettings}
        settingsProvider={provider}
        section={section ?? 'chart'}
        onSectionChange={(next) => {
          changeChartSection(personId, 'natal', next);
        }}
      />
    </main>
  );
}
