/**
 * @module FixedStarPicker.messages
 * @purpose English/Dutch strings for the fixed-star picker in the Extended settings drawer's Special points tab (#803): search, results with magnitude, the chosen-stars table, the read-only uncited orb, the preset button and the source-file line.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by FixedStarPicker.tsx via `useMessages(fixedStarPickerMessages)`; `nl` is typed as `typeof en`. Star names and designations are catalogue data, never translated.
 * @exports fixedStarPickerMessages
 */
const en = {
  heading: 'Fixed stars',
  staged:
    'Chosen stars are kept with the rest of this drawer and stored on this person by “Apply and redraw”. Cancel discards them.',
  chosenCount: (count: number) => (count === 1 ? '1 star chosen' : `${String(count)} stars chosen`),
  presetButton: 'Use the seven-star preset',
  noneChosen: (names: string) => `No stars chosen, so the chart checks the seven-star preset: ${names}.`,
  searchLabel: 'Search by name or designation',
  searchHelp: 'Names and designations from the shipped star file only; no interpretation.',
  matchCount: (shown: string, total: string, query: string) => `${shown} of ${total} catalogue stars match “${query}”.`,
  matchCapped: (limit: string) => `Only the first ${limit} are shown. Type more to narrow the list.`,
  noMatch: (query: string) => `No catalogue star matches “${query}”.`,
  resultsLabel: 'Search results',
  magnitude: (value: string) => `magnitude ${value}`,
  add: (name: string) => `Add ${name}`,
  alreadyChosen: (name: string) => `${name} is chosen`,
  chosenTag: 'Chosen',
  loading: 'Loading the star catalogue…',
  loadFailed: (message: string) => `The star catalogue could not be loaded: ${message}`,
  chosenCaption: 'Chosen stars',
  columnStar: 'Star',
  columnDesignation: 'Designation',
  columnOrb: 'Conjunction orb',
  columnAction: 'Action',
  orbTag: (degrees: string) => `${degrees}° uncited`,
  orbNote: (degrees: string) =>
    `The ${degrees}° orb is an Astraya convention and is not cited to a source. It is the same for every chosen star and cannot be changed.`,
  remove: (name: string) => `Remove ${name}`,
  draftTag: 'Draft, saved on Apply',
  sourceHeading: 'Source file',
  sourceLine: (file: string, hash: string) => `${file} · SHA-256 ${hash}`,
  sourceHelp: 'The version recorded with each chosen star when it was selected: the hash of the shipped file.',
};

const nl: typeof en = {
  heading: 'Vaste sterren',
  staged:
    'Gekozen sterren blijven bij de rest van dit paneel en worden bij deze persoon opgeslagen door “Toepassen en opnieuw tekenen”. Annuleren verwerpt ze.',
  chosenCount: (count: number) => (count === 1 ? '1 ster gekozen' : `${String(count)} sterren gekozen`),
  presetButton: 'De zeven standaardsterren gebruiken',
  noneChosen: (names: string) =>
    `Geen sterren gekozen, dus de horoscoop controleert de zeven standaardsterren: ${names}.`,
  searchLabel: 'Zoeken op naam of aanduiding',
  searchHelp: 'Alleen namen en aanduidingen uit het meegeleverde sterrenbestand; geen interpretatie.',
  matchCount: (shown: string, total: string, query: string) =>
    `${shown} van ${total} sterren in de catalogus passen bij “${query}”.`,
  matchCapped: (limit: string) => `Alleen de eerste ${limit} worden getoond. Typ meer om de lijst te verkleinen.`,
  noMatch: (query: string) => `Geen ster in de catalogus past bij “${query}”.`,
  resultsLabel: 'Zoekresultaten',
  magnitude: (value: string) => `magnitude ${value}`,
  add: (name: string) => `${name} toevoegen`,
  alreadyChosen: (name: string) => `${name} is gekozen`,
  chosenTag: 'Gekozen',
  loading: 'De sterrencatalogus wordt geladen…',
  loadFailed: (message: string) => `De sterrencatalogus kon niet worden geladen: ${message}`,
  chosenCaption: 'Gekozen sterren',
  columnStar: 'Ster',
  columnDesignation: 'Aanduiding',
  columnOrb: 'Orb van de conjunctie',
  columnAction: 'Actie',
  orbTag: (degrees: string) => `${degrees}° zonder bron`,
  orbNote: (degrees: string) =>
    `De orb van ${degrees}° is een Astraya-conventie en heeft geen bron. Hij is voor elke gekozen ster gelijk en kan niet worden gewijzigd.`,
  remove: (name: string) => `${name} verwijderen`,
  draftTag: 'Concept, opgeslagen bij Toepassen',
  sourceHeading: 'Bronbestand',
  sourceLine: (file: string, hash: string) => `${file} · SHA-256 ${hash}`,
  sourceHelp:
    'De versie die bij elke gekozen ster is vastgelegd toen die werd gekozen: de hash van het meegeleverde bestand.',
};

export const fixedStarPickerMessages = { en, nl };
