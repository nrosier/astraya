/**
 * Message catalogue for `PreferencesView.tsx` (#506/#510).
 */
/**
 * @module ui/PreferencesView.messages
 * @purpose English/Dutch i18n strings for the Preferences workspace.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`. `restoreInvalid` formats an `ImportError` from `domain/full-export-importer.js` per locale, rather than exposing its internal `kind`/`path` strings directly to a reader. `checkResult` does the same for a `CalculationCheckOutcome` from `domain/full-export-check.js` (#582), via a per-locale word lookup declared once and reused rather than duplicated inline.
 * @exports preferencesViewMessages
 */
import type { ImportError } from '../domain/full-export-importer.js';
import type { CalculationCheckOutcome } from '../domain/full-export-check.js';
import type { ProvenanceDifference } from '../domain/calculation-artifact.js';

type CheckOutcomeWords = Record<CalculationCheckOutcome['kind'], string>;
type ProvenanceFieldWords = Record<ProvenanceDifference['field'], string>;

function formatCheckOutcome(
  outcome: CalculationCheckOutcome,
  words: CheckOutcomeWords,
  fieldWords: ProvenanceFieldWords,
): string {
  switch (outcome.kind) {
    case 'changed':
      return outcome.differences.length === 0
        ? words.changed
        : `${words.changed}: ${outcome.differences.map((difference) => fieldWords[difference.field]).join(', ')}`;
    case 'error':
      return `${words.error}: ${outcome.message}`;
    default:
      return words[outcome.kind];
  }
}

const enCheckOutcomeWord: CheckOutcomeWords = {
  'no-artifact': 'no calculation to check',
  error: 'could not check',
  verified: 'verified',
  inconsistent: 'inconsistent',
  changed: 'changed',
};

const nlCheckOutcomeWord: CheckOutcomeWords = {
  'no-artifact': 'geen berekening om te controleren',
  error: 'kon niet worden gecontroleerd',
  verified: 'geverifieerd',
  inconsistent: 'inconsistent',
  changed: 'gewijzigd',
};

const enProvenanceFieldWord: ProvenanceFieldWords = {
  astrayaVersion: 'app version',
  swephVersion: 'ephemeris engine version',
  ephemerisAssets: 'ephemeris data files',
  tzdb: 'timezone database',
  timeResolution: 'birth-time resolution',
  houseSystem: 'house system',
  orbs: 'orb tiers',
};

const nlProvenanceFieldWord: ProvenanceFieldWords = {
  astrayaVersion: 'appversie',
  swephVersion: 'versie van de ephemeris-engine',
  ephemerisAssets: 'ephemeris-gegevensbestanden',
  tzdb: 'tijdzonedatabase',
  timeResolution: 'resolutie van de geboortetijd',
  houseSystem: 'huizensysteem',
  orbs: 'orbisniveaus',
};

const en = {
  heading: 'Preferences',
  intro: 'Durable settings for this account and this device, in one place.',
  // Card titles and the two-column row labels (#966). Each setting keeps the wording its control already had.
  cardInterface: 'Interface & display',
  cardSymbols: 'Symbol rendering',
  cardMotion: 'Motion & density',
  cardRulership: 'Rulership scheme',
  cardOrbs: 'Orb profiles & chart assignment',
  cardExport: 'Data export',
  cardImport: 'Import & diagnostics',
  languageTitle: 'Language',
  themeTitle: 'Theme',
  tablistLabel: 'Preferences sections',
  tabLabels: { appearance: 'Appearance & accessibility', astrology: 'Astrology defaults', data: 'Data & privacy' },
  // What each tab's settings are stored as. Every one is saved in this browser and none is synced to an account yet,
  // so "This device" is the true scope for all of them (the guidelines' account scope waits for profile sync).
  scope: {
    appearance: 'This device. Saved in this browser, and not synced to your account.',
    astrology: 'This device. Saved in this browser, and not synced to your account.',
    data: 'This device. Nothing here is sent anywhere; a file you export or restore stays between you and this browser.',
  },
  languageLabel: 'Interface and interpretation-report language.',
  rulersSubtitle: 'Which planets rule which signs, wherever a ruler, dignity, or dispositor is shown.',
  chartSetupSubtitle:
    'House system, zodiac, orbs, and which points show — the starting point for people who have no chart settings of their own. Each person keeps their own settings, changed from that person’s chart screens with the same control.',
  chartSetupNeedsEngine: 'Chart setup needs the calculation engine, which is still loading.',
  themeLabel: 'Light, dark, or follow the system.',
  motionLabel: 'Motion',
  motionHint:
    'Reduce motion switches off transitions and smooth scrolling. Your system’s own setting is always respected as well.',
  motionOptions: { system: 'Follow the system', reduced: 'Reduce motion' },
  densityLabel: 'Density',
  densityHint: 'Compact tightens the spacing of forms and tables. Touch screens keep full-size controls either way.',
  densityOptions: { standard: 'Standard', compact: 'Compact' },
  exportEverythingHint: 'Export birth records, natal charts, and people data stored on this device.',
  exportEverything: 'Export JSON (Full)',
  exportPeopleCsv: 'Export CSV',
  exportPeopleAaf: 'Export AAF',
  exportPeopleAafName: 'the people list as AAF',
  exportAafSkipped: (count: number) =>
    `${String(count)} ${count === 1 ? 'person has' : 'people have'} no complete birth record and ${count === 1 ? 'was' : 'were'} left out: AAF needs a date and a place.`,
  restoreAafErrors: (count: number, first: string) =>
    `${String(count)} ${count === 1 ? 'record' : 'records'} in the AAF file could not be read and ${count === 1 ? 'was' : 'were'} skipped. First: ${first}`,
  exportPreparing: (what: string) => `Preparing ${what}…`,
  exportDone: (what: string) => `${what} exported.`,
  exportFailed: (message: string) => `The export failed: ${message}`,
  exportNeedsEngine: 'The calculation engine is still loading.',
  exportNeedsStore: 'The local data store is not open yet.',
  exportEverythingName: 'everything',
  exportPeopleName: 'the people list',
  restoreHint:
    'Restore people from a full export made on this or another device, or import birth records from an AAF file made by another astrology program. Nothing is written until you review and confirm it.',
  restoreFromFile: 'Restore from file…',
  restorePreparing: 'Reading the file…',
  restoreInvalidJson: 'This file is not valid JSON.',
  restoreInvalid: (error: ImportError): string => {
    switch (error.kind) {
      case 'wrong-format':
        return 'This file is not an Astraya export.';
      case 'wrong-version':
        return error.direction === 'older'
          ? `This file was exported by an older version of Astraya (version ${String(error.got)}) and can no longer be read.`
          : error.direction === 'newer'
            ? 'This file was exported by a newer version of Astraya and cannot be read here.'
            : "This file's version could not be recognised.";
      case 'malformed':
        return `This file is malformed at ${error.path}: ${error.reason}.`;
    }
  },
  restoreReadyToReview: 'Review the list below before applying.',
  restoreStaged: (
    newCount: number,
    updatedCount: number,
    unchangedCount: number,
    deletedLocallyCount: number,
  ): string =>
    `${String(newCount)} new, ${String(updatedCount)} updated, ${String(unchangedCount)} unchanged` +
    (deletedLocallyCount > 0
      ? `, ${String(deletedLocallyCount)} already deleted on this device (their data will update, but they will stay hidden under Deleted)`
      : '') +
    '. Nothing has been written yet.',
  restorePreviewHeading: 'What this restore would change',
  restoreNameColumn: 'Name',
  restoreStatusColumn: 'Status',
  restoreNoName: '(no name)',
  restoreStatusWord: {
    new: 'new',
    updated: 'updated',
    unchanged: 'unchanged',
    deletedLocally: 'deleted on this device',
  },
  restoreApply: 'Apply restore',
  restoreConfirm: (newCount: number, updatedCount: number, deletedLocallyCount: number): string => {
    const affected = updatedCount + deletedLocallyCount;
    const note =
      deletedLocallyCount > 0
        ? ` ${String(deletedLocallyCount)} of those ${deletedLocallyCount === 1 ? 'is' : 'are'} deleted on this device and will stay hidden under Deleted.`
        : '';
    return `This will add ${String(newCount)} new ${newCount === 1 ? 'person' : 'people'} and overwrite fields on ${String(affected)} existing ${affected === 1 ? 'person' : 'people'}.${note} Continue?`;
  },
  restoreNothingToApply: 'Nothing in this file differs from what is already here.',
  restoreApplying: 'Applying the restore…',
  restoreApplied: (newCount: number, updatedCount: number, deletedLocallyCount: number): string =>
    `Restore applied: ${String(newCount)} new, ${String(updatedCount + deletedLocallyCount)} updated.`,
  restoreFailed: (message: string): string => `The restore failed: ${message}`,
  checkHint:
    'Check whether a full export’s recorded natal calculations still reproduce on this device’s current engine and data — useful after an app, ephemeris, or timezone-database update. Nothing is written; this only reads the file.',
  checkFromFile: 'Check a calculation file…',
  checkPreparing: 'Reading and checking the file…',
  checkResultsHeading: 'What this file’s calculations check against',
  checkResultColumn: 'Result',
  checkResult: (outcome: CalculationCheckOutcome): string =>
    formatCheckOutcome(outcome, enCheckOutcomeWord, enProvenanceFieldWord),
  checkStaged: (verified: number, changed: number, inconsistent: number, noArtifact: number, error: number): string =>
    `${String(verified)} verified, ${String(changed)} changed, ${String(inconsistent)} inconsistent, ${String(noArtifact)} with no calculation to check, ${String(error)} could not be checked.`,
  checkFailed: (message: string): string => `The check failed: ${message}`,
};

const nl: typeof en = {
  heading: 'Voorkeuren',
  intro: 'Blijvende instellingen voor dit account en dit apparaat, op één plek.',
  cardInterface: 'Interface & weergave',
  cardSymbols: 'Weergave van symbolen',
  cardMotion: 'Beweging & dichtheid',
  cardRulership: 'Heerserschema',
  cardOrbs: 'Orbprofielen & koppeling per horoscoop',
  cardExport: 'Gegevens exporteren',
  cardImport: 'Importeren & diagnose',
  languageTitle: 'Taal',
  themeTitle: 'Thema',
  tablistLabel: 'Onderdelen van de voorkeuren',
  tabLabels: {
    appearance: 'Weergave & toegankelijkheid',
    astrology: 'Astrologische standaardinstellingen',
    data: 'Gegevens & privacy',
  },
  scope: {
    appearance: 'Dit apparaat. Opgeslagen in deze browser en niet gesynchroniseerd met je account.',
    astrology: 'Dit apparaat. Opgeslagen in deze browser en niet gesynchroniseerd met je account.',
    data: 'Dit apparaat. Niets hier wordt ergens naartoe gestuurd; een bestand dat je exporteert of terugzet blijft tussen jou en deze browser.',
  },
  languageLabel: 'Taal van de interface en het interpretatierapport.',
  rulersSubtitle:
    'Welke planeten welke tekens heersen, overal waar een heerser, waardigheid of dispositor wordt getoond.',
  chartSetupSubtitle:
    'Huizensysteem, dierenriem, orbs en welke punten worden getoond — het startpunt voor personen die nog geen eigen horoscoopinstellingen hebben. Elke persoon houdt eigen instellingen, die je wijzigt op de horoscoopschermen van die persoon met dezelfde bediening.',
  chartSetupNeedsEngine: 'Horoscoopinstellingen hebben de rekenmachine nodig, die nog wordt geladen.',
  themeLabel: 'Licht, donker, of het systeem volgen.',
  motionLabel: 'Beweging',
  motionHint:
    'Minder beweging zet overgangen en vloeiend scrollen uit. De instelling van je systeem wordt altijd ook gerespecteerd.',
  motionOptions: { system: 'Het systeem volgen', reduced: 'Minder beweging' },
  densityLabel: 'Dichtheid',
  densityHint:
    'Compact maakt formulieren en tabellen krapper. Aanraakschermen houden in beide gevallen volledige bedieningselementen.',
  densityOptions: { standard: 'Standaard', compact: 'Compact' },
  exportEverythingHint:
    'Exporteer geboortegegevens, geboortehoroscopen en gegevens van personen die op dit apparaat zijn opgeslagen.',
  exportEverything: 'JSON exporteren (volledig)',
  exportPeopleCsv: 'CSV exporteren',
  exportPeopleAaf: 'AAF exporteren',
  exportPeopleAafName: 'de personenlijst als AAF',
  exportAafSkipped: (count: number) =>
    `${String(count)} ${count === 1 ? 'persoon heeft' : 'personen hebben'} geen volledige geboortegegevens en ${count === 1 ? 'is' : 'zijn'} weggelaten: AAF heeft een datum en een plaats nodig.`,
  restoreAafErrors: (count: number, first: string) =>
    `${String(count)} ${count === 1 ? 'record' : 'records'} in het AAF-bestand ${count === 1 ? 'kon' : 'konden'} niet worden gelezen en ${count === 1 ? 'is' : 'zijn'} overgeslagen. Eerste: ${first}`,
  exportPreparing: (what: string) => `${what} voorbereiden…`,
  exportDone: (what: string) => `${what} geëxporteerd.`,
  exportFailed: (message: string) => `De export is mislukt: ${message}`,
  exportNeedsEngine: 'De rekenmotor wordt nog geladen.',
  exportNeedsStore: 'De lokale gegevensopslag is nog niet geopend.',
  exportEverythingName: 'alles',
  exportPeopleName: 'de personenlijst',
  restoreHint:
    'Herstel personen uit een volledige export, gemaakt op dit of een ander apparaat, of importeer geboortegegevens uit een AAF-bestand van een ander astrologieprogramma. Er wordt niets geschreven voordat je het hebt bekeken en bevestigd.',
  restoreFromFile: 'Herstellen vanuit bestand…',
  restorePreparing: 'Bestand wordt gelezen…',
  restoreInvalidJson: 'Dit bestand is geen geldige JSON.',
  restoreInvalid: (error: ImportError): string => {
    switch (error.kind) {
      case 'wrong-format':
        return 'Dit bestand is geen Astraya-export.';
      case 'wrong-version':
        return error.direction === 'older'
          ? `Dit bestand is geëxporteerd door een oudere versie van Astraya (versie ${String(error.got)}) en kan niet meer worden gelezen.`
          : error.direction === 'newer'
            ? 'Dit bestand is geëxporteerd door een nieuwere versie van Astraya en kan hier niet worden gelezen.'
            : 'De versie van dit bestand kon niet worden herkend.';
      case 'malformed':
        return `Dit bestand is onjuist bij ${error.path}: ${error.reason}.`;
    }
  },
  restoreReadyToReview: 'Bekijk de lijst hieronder voordat je het toepast.',
  restoreStaged: (
    newCount: number,
    updatedCount: number,
    unchangedCount: number,
    deletedLocallyCount: number,
  ): string =>
    `${String(newCount)} nieuw, ${String(updatedCount)} bijgewerkt, ${String(unchangedCount)} ongewijzigd` +
    (deletedLocallyCount > 0
      ? `, ${String(deletedLocallyCount)} al verwijderd op dit apparaat (hun gegevens worden bijgewerkt, maar ze blijven verborgen onder Verwijderd)`
      : '') +
    '. Er is nog niets geschreven.',
  restorePreviewHeading: 'Wat dit herstel zou wijzigen',
  restoreNameColumn: 'Naam',
  restoreStatusColumn: 'Status',
  restoreNoName: '(geen naam)',
  restoreStatusWord: {
    new: 'nieuw',
    updated: 'bijgewerkt',
    unchanged: 'ongewijzigd',
    deletedLocally: 'verwijderd op dit apparaat',
  },
  restoreApply: 'Herstel toepassen',
  restoreConfirm: (newCount: number, updatedCount: number, deletedLocallyCount: number): string => {
    const affected = updatedCount + deletedLocallyCount;
    const note =
      deletedLocallyCount > 0
        ? ` Daarvan ${deletedLocallyCount === 1 ? 'is er 1' : `zijn er ${String(deletedLocallyCount)}`} verwijderd op dit apparaat en blijven verborgen onder Verwijderd.`
        : '';
    return `Dit voegt ${String(newCount)} nieuwe ${newCount === 1 ? 'persoon' : 'personen'} toe en overschrijft velden van ${String(affected)} bestaande ${affected === 1 ? 'persoon' : 'personen'}.${note} Doorgaan?`;
  },
  restoreNothingToApply: 'Niets in dit bestand verschilt van wat hier al staat.',
  restoreApplying: 'Herstel wordt toegepast…',
  restoreApplied: (newCount: number, updatedCount: number, deletedLocallyCount: number): string =>
    `Herstel toegepast: ${String(newCount)} nieuw, ${String(updatedCount + deletedLocallyCount)} bijgewerkt.`,
  restoreFailed: (message: string): string => `Het herstellen is mislukt: ${message}`,
  checkHint:
    'Controleer of de geboortehoroscoop-berekeningen uit een volledige export nog hetzelfde resultaat geven met de huidige rekenmachine en gegevens van dit apparaat — nuttig na een update van de app, de ephemeris of de tijdzonedatabase. Er wordt niets geschreven; dit leest alleen het bestand.',
  checkFromFile: 'Berekening controleren…',
  checkPreparing: 'Bestand wordt gelezen en gecontroleerd…',
  checkResultsHeading: 'Waartegen de berekeningen uit dit bestand zijn gecontroleerd',
  checkResultColumn: 'Resultaat',
  checkResult: (outcome: CalculationCheckOutcome): string =>
    formatCheckOutcome(outcome, nlCheckOutcomeWord, nlProvenanceFieldWord),
  checkStaged: (verified: number, changed: number, inconsistent: number, noArtifact: number, error: number): string =>
    `${String(verified)} geverifieerd, ${String(changed)} gewijzigd, ${String(inconsistent)} inconsistent, ${String(noArtifact)} zonder berekening om te controleren, ${String(error)} konden niet worden gecontroleerd.`,
  checkFailed: (message: string): string => `De controle is mislukt: ${message}`,
};

export const preferencesViewMessages = { en, nl };
