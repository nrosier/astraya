/**
 * Message catalogue for `PrimaryDirectionsView.tsx` (#407).
 */
/**
 * @module PrimaryDirectionsView.messages
 * @purpose English/Dutch message catalogue for the primary directions screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `PrimaryDirectionsView.tsx`; `nl` is typed as `typeof en` so both locales stay in parity.
 * @exports primaryDirectionsViewMessages
 */
const en = {
  personFallback: 'Person',
  primaryDirectionsFallback: 'Primary Directions',
  thisPerson: 'This person',
  notCompletePrimaryDirections: (name: string) =>
    `${name}’s birth record is not complete enough to calculate primary directions yet. Fill in the missing fields on the`,
  personPageLink: 'person page',
  needsKnownTime: (name: string) =>
    `Primary directions need a known birth time. ${name}’s birth time is unknown — the same reason their chart has no houses.`,

  heading: (name: string) => `${name}’s primary directions`,
  hint: 'Primary directions turn the whole birth sky by its daily rotation: every degree of right ascension it turns after birth stands for about a year of life. Choose direct or converse motion and zodiacal or in-mundo latitude under the Placidus semi-arc method. The outer ring is available for direct directions only, because converse directions carry the selected significator rather than one whole sky.',
  source: 'Method: Bob Makransky, Primary Directions: A Primer of Calculation (1988), ch. VII (Placidian semi-arcs).',
  asOfLabel: 'As of',
  ageLabel: 'Age (years)',
  keyLabel: 'Time key',
  modeLabel: 'Direction',
  directMode: 'Direct (promissor carried)',
  converseMode: 'Converse (significator carried)',
  methodLabel: 'Placidus method',
  zodiacalMethod: 'In zodiaco',
  inMundoMethod: 'In mundo (real latitude)',
  significatorsPickerLabel: 'Significators',
  promissorsPickerLabel: 'Promissors',
  angleLabels: { asc: 'Ascendant', mc: 'Midheaven', dsc: 'Descendant', ic: 'Imum Coeli' },
  naibodKey: 'Naibod (0°59′08″ a year)',
  ptolemyKey: 'Ptolemy (1° a year)',
  calculating: 'Calculating…',
  error: (message: string) => `Primary directions could not be calculated. ${message}`,
  undefinedAtLatitude:
    'Primary directions by Placidus semi-arcs cannot be calculated for this birthplace: at or beyond the polar circles part of the zodiac never rises or never sets, so it has no semi-arc to measure.',

  ageLine: (age: string) => `Age ${age}`,
  beforeBirth: 'This date is before birth; primary directions start at birth.',
  converseWheelUnavailable:
    'A bi-wheel is not shown for converse directions: this method carries the selected significator, not a single outer chart.',
  arcLine: (arc: string) => `Arc for this age: ${arc}°`,

  natalRingLabel: 'Natal',
  directedRingLabel: 'Directed',

  activeCaption: (orb: string) => `Active at this age (within ${orb}° of arc)`,
  noActive: 'No direction is within orb at this age.',
  allCaption: 'All directions, by age',
  noDirections: 'No directions within the lifetime window.',

  significatorLabel: 'Significator',
  promissorLabel: 'Promissor',
  arcLabel: 'Arc (RA)',
  ageColumnLabel: 'Age',
  descriptionLabel: 'Direction',
  dexter: (aspect: string) => `dexter ${aspect}`,
  sinister: (aspect: string) => `sinister ${aspect}`,
  description: (significator: string, aspect: string, promissor: string) => `${significator} → ${aspect} ${promissor}`,
};

const nl: typeof en = {
  personFallback: 'Persoon',
  primaryDirectionsFallback: 'Primaire directies',
  thisPerson: 'Deze persoon',
  notCompletePrimaryDirections: (name: string) =>
    `Het geboorterecord van ${name} is niet volledig genoeg om primaire directies te berekenen. Vul de ontbrekende velden in op de`,
  personPageLink: 'persoonspagina',
  needsKnownTime: (name: string) =>
    `Primaire directies vereisen een bekende geboortetijd. De geboortetijd van ${name} is onbekend — dezelfde reden waarom hun horoscoop geen huizen heeft.`,

  heading: (name: string) => `Primaire directies van ${name}`,
  hint: 'Primaire directies draaien de hele geboortehemel met zijn dagelijkse omwenteling: elke graad rechte klimming die hij na de geboorte draait, staat voor ongeveer een levensjaar. Kies directe of converse beweging en zodiakale of in-mundo-breedte binnen de methode met Placidus-semi-bogen. De buitenste ring is alleen beschikbaar voor directe directies, omdat converse directies de gekozen significator dragen en niet één volledige hemel.',
  source:
    'Methode: Bob Makransky, Primary Directions: A Primer of Calculation (1988), hfst. VII (Placidus-semi-bogen).',
  asOfLabel: 'Vanaf',
  ageLabel: 'Leeftijd (jaren)',
  keyLabel: 'Tijdsleutel',
  modeLabel: 'Directie',
  directMode: 'Direct (promissor beweegt)',
  converseMode: 'Converse (significator beweegt)',
  methodLabel: 'Placidus-methode',
  zodiacalMethod: 'In zodiaco',
  inMundoMethod: 'In mundo (werkelijke breedte)',
  significatorsPickerLabel: 'Significatoren',
  promissorsPickerLabel: 'Promissors',
  angleLabels: { asc: 'Ascendant', mc: 'Medium Coeli', dsc: 'Descendant', ic: 'Imum Coeli' },
  naibodKey: 'Naibod (0°59′08″ per jaar)',
  ptolemyKey: 'Ptolemaeus (1° per jaar)',
  calculating: 'Berekenen…',
  error: (message: string) => `Primaire directies konden niet worden berekend. ${message}`,
  undefinedAtLatitude:
    'Primaire directies met de semi-bogen van Placidus kunnen voor deze geboorteplaats niet worden berekend: op of voorbij de poolcirkels komt een deel van de dierenriem nooit op of gaat het nooit onder, en heeft het dus geen semi-boog om te meten.',

  ageLine: (age: string) => `Leeftijd ${age}`,
  beforeBirth: 'Deze datum ligt vóór de geboorte; primaire directies beginnen bij de geboorte.',
  converseWheelUnavailable:
    'Voor converse directies wordt geen bi-wheel getoond: deze methode draagt de gekozen significator, niet één vaste buitenste horoscoop.',
  arcLine: (arc: string) => `Boog voor deze leeftijd: ${arc}°`,

  natalRingLabel: 'Natal',
  directedRingLabel: 'Gedirigeerd',

  activeCaption: (orb: string) => `Actief op deze leeftijd (binnen ${orb}° boog)`,
  noActive: 'Geen enkele directie valt op deze leeftijd binnen orb.',
  allCaption: 'Alle directies, op leeftijd',
  noDirections: 'Geen directies binnen het levensvenster.',

  significatorLabel: 'Significator',
  promissorLabel: 'Promissor',
  arcLabel: 'Boog (RK)',
  ageColumnLabel: 'Leeftijd',
  descriptionLabel: 'Directie',
  dexter: (aspect: string) => `dexter ${aspect}`,
  sinister: (aspect: string) => `sinister ${aspect}`,
  description: (significator: string, aspect: string, promissor: string) => `${significator} → ${aspect} ${promissor}`,
};

export const primaryDirectionsViewMessages = { en, nl };
