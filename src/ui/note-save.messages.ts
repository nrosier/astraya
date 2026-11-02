/**
 * Message catalogue for the note autosave save-state line (#919).
 */
/**
 * @module note-save.messages
 * @purpose English/Dutch i18n strings for the note autosave state line and its over-limit message.
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`; the limit is passed in so the store's constant stays the one source.
 * @exports noteSaveMessages
 */
const en = {
  saving: 'Saving…',
  autosaved: 'Autosaved',
  savedLocal: 'Saved on this device',
  saveFailed: 'Could not save',
  tooLong: (limit: number): string =>
    `Could not save: a note can hold up to ${limit.toLocaleString('en-GB')} characters. Your text is kept on this device.`,
  otherVersion: 'Other version',
  otherVersionSaved: (when: string): string => `Saved ${when}`,
  otherVersionHint:
    'Two edits were made at the same time. Both are kept. Your next change to the note above replaces this version.',
};

const nl: typeof en = {
  saving: 'Opslaan…',
  autosaved: 'Automatisch opgeslagen',
  savedLocal: 'Opgeslagen op dit apparaat',
  saveFailed: 'Opslaan is niet gelukt',
  tooLong: (limit: number): string =>
    `Opslaan is niet gelukt: een notitie mag maximaal ${limit.toLocaleString('nl-NL')} tekens bevatten. Je tekst blijft op dit apparaat bewaard.`,
  otherVersion: 'Andere versie',
  otherVersionSaved: (when: string): string => `Opgeslagen ${when}`,
  otherVersionHint:
    'Er zijn twee bewerkingen tegelijk gedaan. Beide blijven bewaard. Je volgende wijziging aan de notitie hierboven vervangt deze versie.',
};

export const noteSaveMessages = { en, nl };
