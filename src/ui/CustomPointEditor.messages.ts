/**
 * @module CustomPointEditor.messages
 * @purpose English/Dutch labels for the chart-side custom formula point editor.
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages`; Dutch retains the same keys as English.
 * @exports customPointEditorMessages
 */
const en = {
  heading: 'Custom formula points',
  hint: 'Create named points from chart identifiers such as Sun, Moon, Ascendant, Midheaven, Fortune, and Spirit. Formulas are parsed safely; they are never executable code.',
  name: 'Point name',
  formula: 'Formula',
  add: 'Add formula point',
  save: 'Save formula point',
  cancel: 'Cancel edit',
  edit: (name: string) => `Edit ${name}`,
  remove: (name: string) => `Remove ${name}`,
  enabled: 'Show and aspect this point',
  disabled: 'Disabled',
  duplicateName: 'A formula point already uses this name.',
  redundant: (name: string) => `This formula duplicates the built-in ${name} point.`,
  invalid: (message: string) => `Formula is not valid: ${message}`,
  saveFailed: (message: string) => `Could not save formula points. ${message}`,
  empty: 'No custom formula points yet.',
};

const nl: typeof en = {
  heading: 'Aangepaste formulepunten',
  hint: 'Maak benoemde punten met kaart-id’s zoals Zon, Maan, Ascendant, Midheaven, Fortuin en Geest. Formules worden veilig geparseerd; ze zijn nooit uitvoerbare code.',
  name: 'Puntnaam',
  formula: 'Formule',
  add: 'Formulepunt toevoegen',
  save: 'Formulepunt opslaan',
  cancel: 'Bewerken annuleren',
  edit: (name: string) => `${name} bewerken`,
  remove: (name: string) => `${name} verwijderen`,
  enabled: 'Dit punt tonen en aspecten berekenen',
  disabled: 'Uitgeschakeld',
  duplicateName: 'Een formulepunt gebruikt deze naam al.',
  redundant: (name: string) => `Deze formule dupliceert het ingebouwde punt ${name}.`,
  invalid: (message: string) => `Formule is niet geldig: ${message}`,
  saveFailed: (message: string) => `Kon formulepunten niet opslaan. ${message}`,
  empty: 'Nog geen aangepaste formulepunten.',
};

export const customPointEditorMessages = { en, nl };
