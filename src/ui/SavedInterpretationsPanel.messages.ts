/**
 * Message catalogue for `SavedInterpretationsPanel.tsx` (#761): the Past interpretations tab's list, viewer and delete.
 */
/**
 * @module SavedInterpretationsPanel.messages
 * @purpose English/Dutch message catalogue for the Past interpretations tab: the list states, the viewer modal and the in-app delete confirmation.
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
};

const nl: typeof en = {
  pastEmpty: 'Je hebt nog geen eerdere duidingen.',
  pastLoading: 'Eerdere duidingen laden…',
  pastError: 'Eerdere duidingen konden niet worden geladen.',
  pastClose: 'Sluiten',
  pastDelete: 'Verwijderen',
  pastDeleteConfirmMessage: 'Deze duiding wordt definitief verwijderd. Dat kan niet ongedaan worden gemaakt.',
  pastDeleteConfirm: 'Definitief verwijderen',
  pastDeleteCancel: 'Annuleren',
  pastDeleteFailed: 'De duiding kon niet worden verwijderd. Probeer het opnieuw.',
  pastNoSections: 'Deze duiding bevat geen tekst.',
  pastTypeNeutral: 'Opgeslagen duiding',
};

export const savedInterpretationsPanelMessages = { en, nl };
