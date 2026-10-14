/**
 * Message catalogue for `DocumentsView.tsx` (#563).
 */
/**
 * @module ui/DocumentsView.messages
 * @purpose English/Dutch i18n strings for the Documents workspace.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports documentsViewMessages
 */

const en = {
  heading: 'Documents',
  intro: 'Build PDF exports from your charts and manage saved documents.',
  pdfExportHeading: 'PDF Export Builder',
};

const nl: typeof en = {
  heading: 'Documenten',
  intro: 'Bouw PDF-exports van uw horoscopen en beheer opgeslagen documenten.',
  pdfExportHeading: 'PDF-exportbuilder',
};

export const documentsViewMessages = { en, nl };
