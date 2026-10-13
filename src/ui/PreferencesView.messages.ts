/**
 * Message catalogue for `PreferencesView.tsx` (#506/#510).
 */
/**
 * @module ui/PreferencesView.messages
 * @purpose English/Dutch i18n strings for the Preferences workspace.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports preferencesViewMessages
 */
const en = {
  heading: 'Preferences',
  intro: 'Durable settings for this account and this device, in one place.',
  generalHeading: 'General',
  languageLabel: 'Interface and interpretation-report language.',
  astrologyHeading: 'Astrology defaults',
  rulersSubtitle: 'Which planets rule which signs, wherever a ruler, dignity, or dispositor is shown.',
  chartSetupSubtitle:
    'House system, zodiac, orbs, and which points show — every calculation-affecting setting in one place, before you compute a chart. The same control every chart screen’s own "Extended settings" opens.',
  chartSetupNeedsEngine: 'Chart setup needs the calculation engine, which is still loading.',
  appearanceHeading: 'Appearance & accessibility',
  themeLabel: 'Light, dark, or follow the system.',
  motionLabel: 'Motion',
  motionHint:
    'Reduce motion switches off transitions and smooth scrolling. Your system’s own setting is always respected as well.',
  motionOptions: { system: 'Follow the system', reduced: 'Reduce motion' },
  densityLabel: 'Density',
  densityHint: 'Compact tightens the spacing of forms and tables. Touch screens keep full-size controls either way.',
  densityOptions: { standard: 'Standard', compact: 'Compact' },
  dataHeading: 'Data & privacy',
  exportEverythingHint:
    'Every person on this device with their birth record and natal chart data, as one JSON file, or just the people list as a spreadsheet.',
  exportEverything: 'Export everything (one file)',
  exportPeopleCsv: 'Export people (CSV)',
  exportPreparing: (what: string) => `Preparing ${what}…`,
  exportDone: (what: string) => `${what} exported.`,
  exportFailed: (message: string) => `The export failed: ${message}`,
  exportNeedsEngine: 'The calculation engine is still loading.',
  exportNeedsStore: 'The local data store is not open yet.',
  exportEverythingName: 'everything',
  exportPeopleName: 'the people list',
};

const nl: typeof en = {
  heading: 'Voorkeuren',
  intro: 'Blijvende instellingen voor dit account en dit apparaat, op één plek.',
  generalHeading: 'Algemeen',
  languageLabel: 'Taal van de interface en het interpretatierapport.',
  astrologyHeading: 'Astrologische standaardinstellingen',
  rulersSubtitle:
    'Welke planeten welke tekens heersen, overal waar een heerser, waardigheid of dispositor wordt getoond.',
  chartSetupSubtitle:
    'Huizensysteem, dierenriem, orbs en welke punten worden getoond — elke berekeningsinstelling op één plek, voordat je een horoscoop berekent. Dezelfde bediening die "Uitgebreide instellingen" op elk horoscoopscherm opent.',
  chartSetupNeedsEngine: 'Horoscoopinstellingen hebben de rekenmachine nodig, die nog wordt geladen.',
  appearanceHeading: 'Weergave & toegankelijkheid',
  themeLabel: 'Licht, donker, of het systeem volgen.',
  motionLabel: 'Beweging',
  motionHint:
    'Minder beweging zet overgangen en vloeiend scrollen uit. De instelling van je systeem wordt altijd ook gerespecteerd.',
  motionOptions: { system: 'Het systeem volgen', reduced: 'Minder beweging' },
  densityLabel: 'Dichtheid',
  densityHint:
    'Compact maakt formulieren en tabellen krapper. Aanraakschermen houden in beide gevallen volledige bedieningselementen.',
  densityOptions: { standard: 'Standaard', compact: 'Compact' },
  dataHeading: 'Gegevens & privacy',
  exportEverythingHint:
    'Elke persoon op dit apparaat met zijn of haar geboortegegevens en de gegevens van het geboortehoroscoop, als één JSON-bestand, of alleen de personenlijst als spreadsheet.',
  exportEverything: 'Alles exporteren (één bestand)',
  exportPeopleCsv: 'Personen exporteren (CSV)',
  exportPreparing: (what: string) => `${what} voorbereiden…`,
  exportDone: (what: string) => `${what} geëxporteerd.`,
  exportFailed: (message: string) => `De export is mislukt: ${message}`,
  exportNeedsEngine: 'De rekenmotor wordt nog geladen.',
  exportNeedsStore: 'De lokale gegevensopslag is nog niet geopend.',
  exportEverythingName: 'alles',
  exportPeopleName: 'de personenlijst',
};

export const preferencesViewMessages = { en, nl };
