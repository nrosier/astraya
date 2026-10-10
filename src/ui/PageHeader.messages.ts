/**
 * Message catalogue for `PageHeader.tsx` (#506/#509).
 */
/**
 * @module ui/PageHeader.messages
 * @purpose English/Dutch i18n strings for the content header's export dropdown and status text.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports pageHeaderMessages
 */
const en = {
  exportLabel: 'Export',
  exportPreparing: (what: string) => `Preparing ${what}…`,
  exportDone: (what: string) => `${what} exported.`,
  exportFailed: (message: string) => `The export failed: ${message}`,
};

const nl: typeof en = {
  exportLabel: 'Exporteren',
  exportPreparing: (what: string) => `${what} voorbereiden…`,
  exportDone: (what: string) => `${what} geëxporteerd.`,
  exportFailed: (message: string) => `De export is mislukt: ${message}`,
};

export const pageHeaderMessages = { en, nl };
