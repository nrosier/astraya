/**
 * Message catalogue for `MultiWheelView.tsx` (#558).
 */
/**
 * @module MultiWheelView.messages
 * @purpose English/Dutch i18n strings for the multi-wheel overlay screen: ring toggles, transit/progression dates, relocation lat/lon inputs, and ring labels.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by MultiWheelView.tsx via `useMessages(multiWheelViewMessages)`; `nl` is typed as `typeof en`.
 * @exports multiWheelViewMessages
 */
const en = {
  personFallback: 'Person',
  thisPerson: 'This person',
  multiWheelFallback: 'Multi-wheel overlay',
  needsCompleteRecord: (name: string) =>
    `A multi-wheel overlay needs a complete birth record with a known time, the same as any other chart. ${name}’s does not have one yet. Fill in or correct it on the`,
  personPageLink: 'person page',

  heading: (name: string) => `${name}’s multi-wheel overlay`,
  headingFallback: 'Multi-wheel overlay',
  hint: 'Natal is always the innermost ring. Add transit, progressed, or relocated rings independently — each is computed and labelled on its own; positions never change between rings except for the ones each ring’s own technique actually moves.',

  natalLabel: 'Natal',
  transitRingLabel: 'Transit',
  progressedRingLabel: 'Progressed',
  relocatedRingLabel: 'Relocated',

  includeTransit: 'Add a transit ring',
  transitDateLabel: 'Transit date',
  includeProgressed: 'Add a progressed ring',
  progressedDateLabel: 'Progressed to date',
  includeRelocated: 'Add a relocated ring',
  latitudeLabel: 'Relocation latitude',
  longitudeLabel: 'Relocation longitude',
  latitudeDecreaseLabel: 'Decrease relocation latitude',
  latitudeIncreaseLabel: 'Increase relocation latitude',
  longitudeDecreaseLabel: 'Decrease relocation longitude',
  longitudeIncreaseLabel: 'Increase relocation longitude',
  needsLocation: 'Enter a latitude and longitude for the relocated ring.',
  invalidLocation: 'Latitude must be between -90 and 90; longitude between -180 and 180.',

  calculating: 'Calculating…',
  error: (message: string) => `Could not compute this overlay: ${message}`,
};

const nl: typeof en = {
  personFallback: 'Persoon',
  thisPerson: 'Deze persoon',
  multiWheelFallback: 'Overlay met meerdere wielen',
  needsCompleteRecord: (name: string) =>
    `Een overlay met meerdere wielen vereist een volledig geboorterecord met een bekende tijd, net als elke andere horoscoop. Dat van ${name} is nog niet compleet. Vul het aan of corrigeer het op de`,
  personPageLink: 'persoonspagina',

  heading: (name: string) => `Overlay met meerdere wielen van ${name}`,
  headingFallback: 'Overlay met meerdere wielen',
  hint: 'De geboortehoroscoop is altijd het binnenste wiel. Voeg onafhankelijk transit-, progressie- of verplaatsingswielen toe — elk wordt apart berekend en gelabeld; posities veranderen alleen voor wat de techniek van dat wiel daadwerkelijk verplaatst.',

  natalLabel: 'Geboortehoroscoop',
  transitRingLabel: 'Transit',
  progressedRingLabel: 'Progressie',
  relocatedRingLabel: 'Verplaatst',

  includeTransit: 'Transitwiel toevoegen',
  transitDateLabel: 'Transitdatum',
  includeProgressed: 'Progressiewiel toevoegen',
  progressedDateLabel: 'Gevorderd tot datum',
  includeRelocated: 'Verplaatsingswiel toevoegen',
  latitudeLabel: 'Breedtegraad van verplaatsing',
  longitudeLabel: 'Lengtegraad van verplaatsing',
  latitudeDecreaseLabel: 'Breedtegraad van verplaatsing verkleinen',
  latitudeIncreaseLabel: 'Breedtegraad van verplaatsing vergroten',
  longitudeDecreaseLabel: 'Lengtegraad van verplaatsing verkleinen',
  longitudeIncreaseLabel: 'Lengtegraad van verplaatsing vergroten',
  needsLocation: 'Voer een breedte- en lengtegraad in voor het verplaatsingswiel.',
  invalidLocation: 'Breedtegraad moet tussen -90 en 90 liggen; lengtegraad tussen -180 en 180.',

  calculating: 'Berekenen…',
  error: (message: string) => `Deze overlay kon niet worden berekend: ${message}`,
};

export const multiWheelViewMessages = { en, nl };
