/**
 * @module OrbRulesFields.messages
 * @purpose English/Dutch labels for the per-aspect and per-body orb inputs (#590).
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages`; Dutch retains the same keys as English.
 * @exports orbRulesFieldsMessages
 */
const en = {
  aspectsTitle: 'Orb per aspect',
  showAspects: 'Show aspect orbs',
  hideAspects: 'Hide aspect orbs',
  aspectsHint:
    'The orb for an aspect replaces its built-in tier. The luminary bonus is added when the Sun or Moon is involved. Blank keeps the built-in value.',
  aspectBase: 'Orb',
  aspectBonus: 'Luminary bonus',
  bodiesTitle: 'Orb per body',
  showBodies: 'Show body orbs',
  hideBodies: 'Hide body orbs',
  bodiesHint:
    'A half-orb for a body. When both bodies of a pair have one, their sum is the orb for that pair. Blank keeps the built-in value.',
};

const nl: typeof en = {
  aspectsTitle: 'Orbis per aspect',
  showAspects: 'Aspectorbissen tonen',
  hideAspects: 'Aspectorbissen verbergen',
  aspectsHint:
    'De orbis voor een aspect vervangt de ingebouwde stap. De bonus voor lichten komt erbij als Zon of Maan meedoet. Leeg behoudt de ingebouwde waarde.',
  aspectBase: 'Orbis',
  aspectBonus: 'Bonus voor lichten',
  bodiesTitle: 'Orbis per lichaam',
  showBodies: 'Lichaamsorbissen tonen',
  hideBodies: 'Lichaamsorbissen verbergen',
  bodiesHint:
    'Een halve orbis voor een lichaam. Hebben beide lichamen van een paar er een, dan is de som de orbis voor dat paar. Leeg behoudt de ingebouwde waarde.',
};

export const orbRulesFieldsMessages = { en, nl };
