/**
 * Message catalogue for the saved event-search queries panel (#1061).
 */
/**
 * @module SavedQueries.messages
 * @purpose English/Dutch UI text for saving, listing, reopening, deleting, undoing and erasing saved event-search queries.
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages()`; `nl` is typed as `typeof en`; refusal codes from the store are mapped to wording here, never shown raw.
 * @exports savedQueriesMessages
 */
const en = {
  heading: 'Saved queries',
  scopeNote: 'Saved in your account. They sync when you are signed in and stay on this device when you are not.',
  nameLabel: 'Query name',
  nameHelp: (max: string) => `Up to ${max} characters. The name can hold personal data, so keep it generic.`,
  saveButton: 'Save query',
  saved: (name: string) => `Saved “${name}”.`,
  nameTooLong: (max: string) => `The name is longer than ${max} characters.`,
  invalidQuery: 'This query cannot be saved: check the dates and the chosen bodies.',
  saveFailed: 'That did not save.',
  unavailable: 'Saved queries are not available yet. The store is still opening.',
  empty: 'No saved queries yet. Name the current search and save it to reopen it later.',
  unnamed: 'Unnamed query',
  summary: (from: string, to: string, kinds: string) => `${from} to ${to} (UTC) · ${kinds}`,
  open: 'Open',
  openLabel: (name: string) => `Open ${name}`,
  opened: (name: string) => `Opened “${name}” into the form. Search to run it.`,
  delete: 'Delete',
  deleteLabel: (name: string) => `Delete ${name}`,
  deleted: (name: string) => `Deleted “${name}”.`,
  undo: 'Undo',
  deletedHeading: 'Deleted queries',
  restore: 'Undo delete',
  restoreLabel: (name: string) => `Undo delete of ${name}`,
  erase: 'Erase permanently',
  eraseLabel: (name: string) => `Erase ${name} permanently`,
  confirmErase: (name: string) => `Permanently erase “${name}”? This cannot be undone.`,
  unreadable: {
    'future-version': 'Saved by a newer version of Astraya, so this version cannot open it. It is kept.',
    'unknown-tool': 'Saved for a tool this version does not know. It is kept.',
    invalid: 'Its saved settings are not valid here, so it cannot be opened. It is kept.',
    incomplete: 'Part of this query has not arrived yet. It is kept and opens once it is complete.',
  },
};

const nl: typeof en = {
  heading: 'Opgeslagen zoekopdrachten',
  scopeNote:
    'Opgeslagen in je account. Ze synchroniseren als je bent ingelogd en blijven op dit apparaat als je dat niet bent.',
  nameLabel: 'Naam van de zoekopdracht',
  nameHelp: (max: string) => `Maximaal ${max} tekens. De naam kan persoonsgegevens bevatten, houd hem dus algemeen.`,
  saveButton: 'Zoekopdracht opslaan',
  saved: (name: string) => `“${name}” opgeslagen.`,
  nameTooLong: (max: string) => `De naam is langer dan ${max} tekens.`,
  invalidQuery: 'Deze zoekopdracht kan niet worden opgeslagen: controleer de data en de gekozen lichamen.',
  saveFailed: 'Dat is niet opgeslagen.',
  unavailable: 'Opgeslagen zoekopdrachten zijn nog niet beschikbaar. De opslag wordt nog geopend.',
  empty:
    'Nog geen opgeslagen zoekopdrachten. Geef de huidige zoekopdracht een naam en sla hem op om hem later te heropenen.',
  unnamed: 'Naamloze zoekopdracht',
  summary: (from: string, to: string, kinds: string) => `${from} tot ${to} (UTC) · ${kinds}`,
  open: 'Openen',
  openLabel: (name: string) => `${name} openen`,
  opened: (name: string) => `“${name}” in het formulier geopend. Zoek om hem uit te voeren.`,
  delete: 'Verwijderen',
  deleteLabel: (name: string) => `${name} verwijderen`,
  deleted: (name: string) => `“${name}” verwijderd.`,
  undo: 'Ongedaan maken',
  deletedHeading: 'Verwijderde zoekopdrachten',
  restore: 'Verwijderen ongedaan maken',
  restoreLabel: (name: string) => `Verwijderen van ${name} ongedaan maken`,
  erase: 'Definitief wissen',
  eraseLabel: (name: string) => `${name} definitief wissen`,
  confirmErase: (name: string) => `“${name}” definitief wissen? Dit kan niet ongedaan worden gemaakt.`,
  unreadable: {
    'future-version':
      'Opgeslagen door een nieuwere versie van Astraya, dus deze versie kan hem niet openen. Hij blijft bewaard.',
    'unknown-tool': 'Opgeslagen voor een hulpmiddel dat deze versie niet kent. Hij blijft bewaard.',
    invalid: 'De opgeslagen instellingen zijn hier niet geldig, dus hij kan niet worden geopend. Hij blijft bewaard.',
    incomplete: 'Een deel van deze zoekopdracht is nog niet binnen. Hij blijft bewaard en opent zodra hij compleet is.',
  },
};

export const savedQueriesMessages = { en, nl };
