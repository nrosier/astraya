/**
 * @module ChartViewAspects
 * @purpose Renders the Aspects chart view tables (aspects, antiscia, declinations, fixed stars, midpoints) and their columns.
 * @conventions Pure move out of ChartView.tsx (#817): same markup and strings, no behaviour change; takes the chart data and message bundle as arguments and never imports ChartView.
 * @exports aspectColumns, declinationColumns, antisciaColumns, midpointTreeColumns, allMidpointsColumns, fixedStarsScopeNoteOf, checkedStarsOf, fixedStarColumns, renderAspectsTable
 */
import { formatOrb } from './format.js';
import { aspectHarmonicFamily } from '../astrology/aspects.js';
import {
  allMidpointsRows,
  antisciaRows,
  aspectRows,
  declinationContactRows,
  fixedStarRows,
  filterAspectRowsByHarmonicFamily,
  midpointTreeRows,
  type AllMidpointsRow,
  type AntisciaRow,
  type AspectRow,
  type DeclinationContactRow,
  type FixedStarRow,
  type MidpointTreeRow,
  type PointVisibilityOptions,
} from '../domain/chart-tables.js';
import { NATAL_FIXED_STARS, type ChartData } from '../domain/chart-compute.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { degreeColumns } from './ChartViewPlacements.js';
import type { chartViewMessages } from './ChartView.messages.js';
import { aspectSelectionKey, selectColumn, type TableSelection } from './table-selection.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';

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

/**
 * The sentence that says which stars the fixed-star table covers (#725), for the screen and the PDF alike:
 * `NATAL_FIXED_STARS` by default, or the stars the chart actually checked (the person's chosen ones, #803).
 */
export function fixedStarsScopeNoteOf(
  t: typeof chartViewMessages.en,
  stars: readonly string[] = NATAL_FIXED_STARS,
): string {
  return t.fixedStarsScopeNote(stars.length, stars.join(', '));
}

/** The star names a computed chart checked (#803), in the order it looked them up; the preset when it has none. */
export function checkedStarsOf(data: ChartData): readonly string[] {
  return data.fixedStars === undefined ? NATAL_FIXED_STARS : [...data.fixedStars.keys()];
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

/** The Aspects view's tables (#511), one case of the old `renderTableTab`. */
export function renderAspectsTable(
  data: ChartData,
  displayName: string,
  pointVisibility: PointVisibilityOptions,
  t: typeof chartViewMessages.en,
  locale: Locale,
  selection?: TableSelection,
  aspectHarmonicFamilyFilter?: number,
): React.ReactNode {
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
          <p className="hint">{fixedStarsScopeNoteOf(t, checkedStarsOf(data))}</p>
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
