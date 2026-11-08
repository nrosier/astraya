/**
 * Message catalogue for `CorpusCorrectionEditor.tsx` (#1338).
 */
/**
 * @module CorpusCorrectionEditor.messages
 * @purpose English/Dutch message catalogue for the editor in which a reader corrects the text of an interpretation entry.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by `CorpusCorrectionEditor.tsx` and `ReportView.tsx`; refusal codes from `store/corpus-corrections` are worded here.
 * @exports corpusCorrectionMessages
 */
const en = {
  editAction: 'Edit',
  editActionLabel: (what: string) => `Edit this text: ${what}`,
  editedBadge: 'Edited by you',
  heading: 'Correct this text',
  closeLabel: 'Close without saving',
  textLabel: 'Your version of this text',
  help: 'Only you see your version. It is saved on this device and, when you are signed in, on your other devices. It does not change the text for anyone else.',
  defaultTextLabel: 'Original text',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  reset: 'Reset to original',
  empty: 'Write some text, or use Reset to go back to the original.',
  tooShort: 'This text is too short. Write at least 40 characters.',
  tooLong: 'This text is too long. Use at most 1600 characters.',
  markup: 'Remove the HTML tags. Plain text only.',
  link: 'Remove the web address. Links are not allowed.',
  invalid: 'This text cannot be saved.',
  saveFailed: (message: string) => `Could not save your version: ${message}`,
  changedDefault: 'The original text has changed since you wrote your version. Yours is still shown.',
};

const nl: typeof en = {
  editAction: 'Bewerken',
  editActionLabel: (what: string) => `Deze tekst bewerken: ${what}`,
  editedBadge: 'Door jou aangepast',
  heading: 'Deze tekst verbeteren',
  closeLabel: 'Sluiten zonder opslaan',
  textLabel: 'Jouw versie van deze tekst',
  help: 'Alleen jij ziet jouw versie. Die wordt op dit apparaat bewaard en, als je bent aangemeld, ook op je andere apparaten. De tekst verandert niet voor anderen.',
  defaultTextLabel: 'Oorspronkelijke tekst',
  save: 'Opslaan',
  saving: 'Opslaan…',
  cancel: 'Annuleren',
  reset: 'Terug naar het origineel',
  empty: 'Schrijf een tekst, of kies Terug naar het origineel.',
  tooShort: 'Deze tekst is te kort. Schrijf minstens 40 tekens.',
  tooLong: 'Deze tekst is te lang. Gebruik hoogstens 1600 tekens.',
  markup: 'Haal de HTML-tags weg. Alleen gewone tekst.',
  link: 'Haal het webadres weg. Links zijn niet toegestaan.',
  invalid: 'Deze tekst kan niet worden opgeslagen.',
  saveFailed: (message: string) => `Je versie kon niet worden opgeslagen: ${message}`,
  changedDefault: 'De oorspronkelijke tekst is veranderd sinds je jouw versie schreef. Jouw versie blijft zichtbaar.',
};

export const corpusCorrectionMessages = { en, nl };
