/**
 * @module OrbProfileEditor.messages
 * @purpose English/Dutch labels for the person's own orb-profile editor (#590).
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages`; Dutch retains the same keys as English.
 * @exports orbProfileEditorMessages
 */
const en = {
  title: 'My orb profile',
  summaryNone: 'Using the built-in orbs',
  summarySaved: (name: string, revision: number) => `${name}, revision ${String(revision)}`,
  show: 'Show orb profile',
  hide: 'Hide orb profile',
  hint: 'Your own orb rules, used for this person’s transit and synastry screens. They are your own choices, not a cited source. Blank fields keep the built-in value. Each save is a new revision.',
  name: 'Profile name',
  basedOn: 'Start from',
  scale: 'Scale',
  decreaseScale: 'Decrease scale',
  increaseScale: 'Increase scale',
  aspectsTitle: 'Orb per aspect',
  aspectsHint:
    'The orb for an aspect replaces its built-in tier. The luminary bonus is added when the Sun or Moon is involved.',
  aspectBase: 'Orb',
  aspectBonus: 'Luminary bonus',
  bodiesTitle: 'Orb per body',
  bodiesHint: 'A half-orb for a body. When both bodies of a pair have one, their sum is the orb for that pair.',
  save: 'Save orb profile',
  remove: 'Remove orb profile',
  invalid: 'Check the values: orbs run from 0° to 30°, the scale from −90% to 90%, and every entry must be a number.',
  saveFailed: (message: string) => `Could not save the orb profile. ${message}`,
  saved: (revision: number) => `Saved as revision ${String(revision)}.`,
  removed: 'Orb profile removed; the built-in orbs apply again.',
};

const nl: typeof en = {
  title: 'Mijn orbisprofiel',
  summaryNone: 'De ingebouwde orbissen worden gebruikt',
  summarySaved: (name: string, revision: number) => `${name}, revisie ${String(revision)}`,
  show: 'Orbisprofiel tonen',
  hide: 'Orbisprofiel verbergen',
  hint: 'Je eigen orbisregels, gebruikt voor de transit- en synastrieschermen van deze persoon. Het zijn je eigen keuzes, geen geciteerde bron. Lege velden behouden de ingebouwde waarde. Elke keer opslaan is een nieuwe revisie.',
  name: 'Profielnaam',
  basedOn: 'Beginnen bij',
  scale: 'Schaal',
  decreaseScale: 'Schaal verlagen',
  increaseScale: 'Schaal verhogen',
  aspectsTitle: 'Orbis per aspect',
  aspectsHint:
    'De orbis voor een aspect vervangt de ingebouwde stap. De bonus voor lichten komt erbij als Zon of Maan meedoet.',
  aspectBase: 'Orbis',
  aspectBonus: 'Bonus voor lichten',
  bodiesTitle: 'Orbis per lichaam',
  bodiesHint:
    'Een halve orbis voor een lichaam. Hebben beide lichamen van een paar er een, dan is de som de orbis voor dat paar.',
  save: 'Orbisprofiel opslaan',
  remove: 'Orbisprofiel verwijderen',
  invalid:
    'Controleer de waarden: orbissen lopen van 0° tot 30°, de schaal van −90% tot 90%, en elke invoer moet een getal zijn.',
  saveFailed: (message: string) => `Kon het orbisprofiel niet opslaan. ${message}`,
  saved: (revision: number) => `Opgeslagen als revisie ${String(revision)}.`,
  removed: 'Orbisprofiel verwijderd; de ingebouwde orbissen gelden weer.',
};

export const orbProfileEditorMessages = { en, nl };
