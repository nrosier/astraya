/**
 * Message catalogue for `SavedInterpretationsPanel.tsx` (#761): the Past interpretations tab's list, viewer and delete.
 */
/**
 * @module SavedInterpretationsPanel.messages
 * @purpose English/Dutch message catalogue for the Past interpretations tab: the list states, the Not linked to a person section (#768), the viewer modal and the in-app delete confirmation.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SavedInterpretationsPanel.tsx`. The tab's own label lives in `ReportView.messages.ts`.
 * @exports savedInterpretationsPanelMessages
 */
const en = {
  pastEmpty: 'You have no past interpretations yet.',
  pastLoading: 'Loading past interpretations…',
  pastError: 'Could not load past interpretations.',
  pastClose: 'Close',
  pastDelete: 'Delete',
  pastDeleteConfirmMessage: 'This permanently deletes this interpretation. It cannot be undone.',
  pastDeleteConfirm: 'Delete permanently',
  pastDeleteCancel: 'Cancel',
  pastDeleteFailed: 'Could not delete the interpretation. Try again.',
  pastNoSections: 'This interpretation has no text.',
  pastTypeNeutral: 'Saved interpretation',
  notLinkedHeading: 'Not linked to a person',
  notLinkedIntro:
    'Saved before results were linked to a person. Open or delete them here; they do not appear in the PDF picker.',
};

const nl: typeof en = {
  pastEmpty: 'Je hebt nog geen eerdere interpretaties.',
  pastLoading: 'Eerdere interpretaties laden…',
  pastError: 'Eerdere interpretaties konden niet worden geladen.',
  pastClose: 'Sluiten',
  pastDelete: 'Verwijderen',
  pastDeleteConfirmMessage: 'Deze interpretatie wordt definitief verwijderd. Dat kan niet ongedaan worden gemaakt.',
  pastDeleteConfirm: 'Definitief verwijderen',
  pastDeleteCancel: 'Annuleren',
  pastDeleteFailed: 'De interpretatie kon niet worden verwijderd. Probeer het opnieuw.',
  pastNoSections: 'Deze interpretatie bevat geen tekst.',
  pastTypeNeutral: 'Opgeslagen interpretatie',
  notLinkedHeading: 'Niet gekoppeld aan een persoon',
  notLinkedIntro:
    'Opgeslagen voordat resultaten aan een persoon werden gekoppeld. Je kunt ze hier openen of verwijderen; ze verschijnen niet in de pdf-keuze.',
};

export const savedInterpretationsPanelMessages = { en, nl };
