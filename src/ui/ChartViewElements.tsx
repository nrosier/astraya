/**
 * @module ChartViewElements
 * @purpose Renders the Elements & modalities chart view: the exported sheet grid and the element x modality table.
 * @conventions Pure move out of ChartView.tsx (#817): same markup and strings, no behaviour change; takes the chart data and message bundle as arguments and never imports ChartView.
 * @exports emphasisColumns, renderElementsView
 */
import {
  chartSheetInput,
  emphasisRows,
  type EmphasisRow,
  type PointVisibilityOptions,
} from '../domain/chart-tables.js';
import { type ChartData } from '../domain/chart-compute.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { bodyShortName } from './astro-names.messages.js';
import { EMPHASIS_MODALITIES } from '../domain/chart-tables.js';
import type { chartViewMessages } from './ChartView.messages.js';
import { EmphasisGrid } from './EmphasisGrid.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';

/** The element x modality table's columns: the element, the bodies in each modality, and the totals. */
export function emphasisColumns(t: typeof chartViewMessages.en, locale: Locale): readonly TableColumn<EmphasisRow>[] {
  const rowName = (row: EmphasisRow): string =>
    row.rowKey === 'total' ? t.emphasisTotalLabel : t.elementNames[row.rowKey];
  return [
    { key: 'element', label: t.emphasisElementLabel, valueOf: rowName },
    ...EMPHASIS_MODALITIES.map((modality): TableColumn<EmphasisRow> => ({
      key: modality,
      label: t.modalityNames[modality],
      // The cells list body names (the counts only sort and copy), so they read from the start, not as numbers (#821).
      align: 'start',
      valueOf: (row) => row.counts[modality],
      render: (row) =>
        row.rowKey === 'total'
          ? String(row.counts[modality])
          : row.bodies[modality].length === 0
            ? t.emphasisNone
            : row.bodies[modality].map((bodyKey) => bodyShortName(bodyKey, locale)).join(', '),
    })),
    { key: 'total', label: t.emphasisTotalLabel, align: 'end', valueOf: (row) => row.total },
  ];
}

/** The Elements & modalities view (#511): the exported sheet's grid, and the same twelve cells as a table. */
export function renderElementsView(
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
      <EmphasisGrid input={input.emphasis} labels={{ elements: t.elementNames, modalities: t.modalityNames }} />
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
