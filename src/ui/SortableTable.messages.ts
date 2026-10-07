/**
 * Message catalogue for `SortableTable.tsx` (#158).
 */
/**
 * @module SortableTable.messages
 * @purpose English/Dutch message catalogue for the generic sortable data table's Copy/Download controls.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SortableTable.tsx`.
 * @exports sortableTableMessages
 */
const en = {
  copied: 'Copied',
  copy: 'Copy',
  downloadCsv: 'Download CSV',
};

const nl: typeof en = {
  copied: 'Gekopieerd',
  copy: 'Kopiëren',
  downloadCsv: 'CSV downloaden',
};

export const sortableTableMessages = { en, nl };
