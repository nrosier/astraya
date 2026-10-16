/**
 * @module OrbLibraryEditor.messages
 * @purpose English/Dutch labels for the device's orb library and the per-context orb choice (#590).
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages`; Dutch retains the same keys as English.
 * @exports orbLibraryEditorMessages
 */
const en = {
  heading: 'Orb profiles',
  hint: 'Named sets of orbs kept on this device. Each change to a profile is a new revision; a chart already drawn keeps the revision it used.',
  none: 'No orb profiles yet. The card’s orbs are used everywhere.',
  add: 'Add orb profile',
  edit: (name: string) => `Edit ${name}`,
  remove: (name: string) => `Remove ${name}`,
  name: 'Profile name',
  scale: 'Scale',
  decreaseScale: 'Decrease scale',
  increaseScale: 'Increase scale',
  saveNew: 'Save orb profile',
  saveRevision: (revision: number) => `Save as revision ${String(revision)}`,
  cancel: 'Cancel',
  invalid: 'Check the values: orbs run from 0° to 30°, the scale from −90% to 90%, and every entry must be a number.',
  saved: (name: string, revision: number) => `Saved ${name}, revision ${String(revision)}.`,
  removed: 'Orb profile removed. Any chart set to it now uses the card’s orbs.',
  chosen: 'Orb choice saved.',
  revisionLabel: (revision: number) => `revision ${String(revision)}`,
  cardOption: 'The card’s orbs',
  useHeading: 'Which orbs each chart uses',
  useHint: 'The card’s orbs are the default. Choose a profile to use its orbs for that kind of chart.',
  contextLabel: {
    natal: 'Natal and returns',
    transit: 'Transits',
    synastry: 'Synastry',
  },
};

const nl: typeof en = {
  heading: 'Orbisprofielen',
  hint: 'Benoemde sets orbissen die op dit apparaat bewaard worden. Elke wijziging van een profiel is een nieuwe revisie; een grafiek die al getekend is, houdt de revisie die ze gebruikte.',
  none: 'Nog geen orbisprofielen. De orbissen van de kaart worden overal gebruikt.',
  add: 'Orbisprofiel toevoegen',
  edit: (name: string) => `${name} bewerken`,
  remove: (name: string) => `${name} verwijderen`,
  name: 'Profielnaam',
  scale: 'Schaal',
  decreaseScale: 'Schaal verlagen',
  increaseScale: 'Schaal verhogen',
  saveNew: 'Orbisprofiel opslaan',
  saveRevision: (revision: number) => `Opslaan als revisie ${String(revision)}`,
  cancel: 'Annuleren',
  invalid:
    'Controleer de waarden: orbissen lopen van 0° tot 30°, de schaal van −90% tot 90%, en elke invoer moet een getal zijn.',
  saved: (name: string, revision: number) => `${name} opgeslagen, revisie ${String(revision)}.`,
  removed: 'Orbisprofiel verwijderd. Een grafiek die ermee was ingesteld, gebruikt nu de orbissen van de kaart.',
  chosen: 'Orbkeuze opgeslagen.',
  revisionLabel: (revision: number) => `revisie ${String(revision)}`,
  cardOption: 'De orbissen van de kaart',
  useHeading: 'Welke orbissen elke grafiek gebruikt',
  useHint:
    'De orbissen van de kaart zijn de standaard. Kies een profiel om de orbissen ervan voor dat soort grafiek te gebruiken.',
  contextLabel: {
    natal: 'Geboortekaart en terugkeren',
    transit: 'Transits',
    synastry: 'Synastrie',
  },
};

export const orbLibraryEditorMessages = { en, nl };
