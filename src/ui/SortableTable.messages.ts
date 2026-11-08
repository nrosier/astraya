/**
 * Message catalogue for `SortableTable.tsx` (#158).
 */
/**
 * @module SortableTable.messages
 * @purpose English/Dutch message catalogue for the generic sortable data table's Copy/Download/Reset controls and its column-resize handle (#1301).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SortableTable.tsx`.
 * @exports sortableTableMessages
 */
const en = {
  copied: 'Copied',
  copy: 'Copy',
  downloadCsv: 'Download CSV',
  aboutColumn: (column: string) => `About ${column}`,
  csvLabel: (table: string) => `${table} (CSV)`,
  resizeColumn: (column: string) => `Resize ${column} column`,
  columnWidth: (pixels: number) => `${String(pixels)} pixels wide`,
  resetWidths: 'Reset widths',
};

const nl: typeof en = {
  copied: 'Gekopieerd',
  copy: 'Kopiëren',
  downloadCsv: 'CSV downloaden',
  aboutColumn: (column: string) => `Over ${column}`,
  csvLabel: (table: string) => `${table} (CSV)`,
  resizeColumn: (column: string) => `Kolom ${column} verbreden of versmallen`,
  columnWidth: (pixels: number) => `${String(pixels)} pixels breed`,
  resetWidths: 'Breedtes herstellen',
};

export const sortableTableMessages = { en, nl };
