/**
 * @module ui/PersonFileActions.messages
 * @purpose English/Dutch copy for exporting and importing one person on the birth-record page (#699).
 * @conventions Co-located `{ en, nl }` catalogue with exact key parity; file-format errors reuse PreferencesView.messages' restore wording.
 * @exports personFileActionsMessages
 */
const en = {
  heading: 'Export or import this person',
  exportHint:
    'Download this person’s birth record. AAF is what other astrology programs read; Astraya JSON keeps everything; CSV is for spreadsheets.',
  exportGroupLabel: 'Download this person’s birth record',
  exportAaf: 'AAF',
  exportJson: 'JSON',
  exportCsv: 'CSV',
  replaceHeading: 'Replace data',
  exportAafNeedsBirth: 'AAF needs a date and a place; this record has not got both yet.',
  exportNeedsEngine: 'The chart engine is still loading. Try again in a moment.',
  exported: (format: string) => `Downloaded ${format}.`,
  importHint:
    'Replace this person’s birth data from an AAF or Astraya JSON file. The name, notes, relocation places and custom points stay as they are. You see the changes before anything is saved.',
  importButton: 'Replace from a file…',
  reading: 'Reading the file…',
  noPeople: 'This file holds no person with a usable birth record.',
  choosePerson: 'Which person from the file',
  changesHeading: 'What changes',
  noChanges: 'The file holds the same birth data. Nothing to change.',
  fields: {
    date: 'Date',
    time: 'Time',
    placeLabel: 'Place',
    coordinates: 'Coordinates',
    calendar: 'Calendar',
    zone: 'Time zone',
    timeAccuracy: 'How the time is known',
  },
  empty: '(none)',
  change: (before: string, after: string) => `${before} → ${after}`,
  confirm: 'Replace birth data',
  cancel: 'Cancel',
  applying: 'Saving…',
  applied: 'Birth data replaced.',
  failed: (message: string) => `Could not save: ${message}`,
};

const nl: typeof en = {
  heading: 'Deze persoon exporteren of importeren',
  exportHint:
    'Download de geboortegegevens van deze persoon. AAF lezen andere astrologieprogramma’s; Astraya JSON bewaart alles; CSV is voor spreadsheets.',
  exportGroupLabel: 'Geboortegegevens van deze persoon downloaden',
  exportAaf: 'AAF',
  exportJson: 'JSON',
  exportCsv: 'CSV',
  replaceHeading: 'Gegevens vervangen',
  exportAafNeedsBirth: 'AAF heeft een datum en een plaats nodig; deze gegevens hebben die nog niet allebei.',
  exportNeedsEngine: 'De rekenmotor wordt nog geladen. Probeer het zo opnieuw.',
  exported: (format: string) => `${format} gedownload.`,
  importHint:
    'Vervang de geboortegegevens van deze persoon uit een AAF- of Astraya JSON-bestand. De naam, notities, verhuisplaatsen en eigen punten blijven zoals ze zijn. Je ziet de wijzigingen voordat er iets wordt opgeslagen.',
  importButton: 'Vervangen uit een bestand…',
  reading: 'Bestand wordt gelezen…',
  noPeople: 'Dit bestand bevat geen persoon met bruikbare geboortegegevens.',
  choosePerson: 'Welke persoon uit het bestand',
  changesHeading: 'Wat er verandert',
  noChanges: 'Het bestand bevat dezelfde geboortegegevens. Er is niets te wijzigen.',
  fields: {
    date: 'Datum',
    time: 'Tijd',
    placeLabel: 'Plaats',
    coordinates: 'Coördinaten',
    calendar: 'Kalender',
    zone: 'Tijdzone',
    timeAccuracy: 'Hoe de tijd bekend is',
  },
  empty: '(geen)',
  change: (before: string, after: string) => `${before} → ${after}`,
  confirm: 'Geboortegegevens vervangen',
  cancel: 'Annuleren',
  applying: 'Opslaan…',
  applied: 'Geboortegegevens vervangen.',
  failed: (message: string) => `Opslaan mislukt: ${message}`,
};

export const personFileActionsMessages = { en, nl };
