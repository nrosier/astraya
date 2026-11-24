/**
 * Message catalogue for `SolarArcView.tsx` (#398).
 */
/**
 * @module SolarArcView.messages
 * @purpose English/Dutch message catalogue for the solar arc directions screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SolarArcView.tsx`.
 * @exports solarArcViewMessages
 */
const en = {
  personFallback: 'Person',
  solarArcFallback: 'Solar Arc',
  thisPerson: 'This person',
  notCompleteSolarArc: (name: string) =>
    `${name}’s birth record is not complete enough to calculate solar arc directions yet. Fill in the missing fields on the`,
  personPageLink: 'person page',
  needsKnownTime: (name: string) =>
    `Solar arc directions need a known birth time. ${name}’s birth time is unknown — the same reason their chart has no houses.`,

  heading: (name: string) => `${name}’s Solar Arc Directions`,
  hint: 'Every natal body and angle is shifted by the same arc — the distance the Sun itself has moved since birth, in symbolic (a-day-for-a-year) time. Unlike a progressed chart, nothing here depends on a progressed Moon or planetary speed.',
  declinationNote: 'Longitude only: declination is not directed.',
  hintInfoLabel: 'About solar arc directions',
  positionLabel: 'Position',
  calculating: 'Calculating…',
  error: (message: string) => `Solar arc directions could not be calculated. ${message}`,

  ageLine: (age: string) => `Age ${age}`,
  beforeBirth: '(before birth)',
  arcLine: (arc: string) => `Arc: ${arc}°`,

  positionsCaption: 'Directed positions',
  contactsCaption: 'Directed-to-natal contacts',
  noContacts: 'No directed-to-natal contacts within orb.',
  directedInLabel: 'Directed in',
  directedIn: { longitude: 'Longitude', declination: 'Declination' },
  arcLabel: 'Arc',
  arcKinds: { solar: 'Solar arc', ascendant: 'Ascendant arc', vertex: 'Vertex arc' },
  multiplierLabel: 'Multiplier',
  multipliers: {
    '1': '×1 (normal)',
    '2': '×2 (double)',
    '0.5': '×0.5 (half)',
    '-1': '×−1 (negative)',
    '-2': '×−2 (negative double)',
    '-0.5': '×−0.5 (negative half)',
  },
  converseLabel: 'Converse (backwards in time)',
  exactNotDated: 'not dated for this arc',
  declinationArcLine: (arc: string) => `Arc in declination: ${arc}°`,
  declinationPositionsCaption: 'Directed declinations',
  declinationContactsCaption: 'Directed-to-natal parallels',
  noDeclinationContacts: 'No directed-to-natal parallels or contraparallels within orb.',
  natalDeclinationLabel: 'Natal',
  directedDeclinationLabel: 'Directed',
  directedBodyLabel: 'Directed',
  natalBodyLabel: 'Natal',
  contactKindLabel: 'Contact',
  contactKinds: { parallel: 'Parallel', contraparallel: 'Contraparallel' },
  north: 'N',
  south: 'S',

  bodyLabel: 'Body',
  houseLabel: 'House',

  bodyALabel: 'Directed',
  aspectLabel: 'Aspect',
  bodyBLabel: 'Natal',
  orbLabel: 'Orb',
  applyingLabel: 'Applying',
  applying: 'Applying',
  separating: 'Separating',
  exactOnLabel: 'Exact on',
  exactOnUnknown: 'outside search window',
};

const nl: typeof en = {
  personFallback: 'Persoon',
  solarArcFallback: 'Solar Arc',
  thisPerson: 'Deze persoon',
  notCompleteSolarArc: (name: string) =>
    `Het geboorterecord van ${name} is niet volledig genoeg om solar arc-directies te berekenen. Vul de ontbrekende velden in op de`,
  personPageLink: 'persoonspagina',
  needsKnownTime: (name: string) =>
    `Solar arc-directies vereisen een bekende geboortetijd. De geboortetijd van ${name} is onbekend — dezelfde reden waarom hun horoscoop geen huizen heeft.`,

  heading: (name: string) => `Solar arc-directies van ${name}`,
  hint: 'Elk natal hemellichaam en elke hoek wordt verschoven met dezelfde boog — de afstand die de Zon zelf heeft afgelegd sinds de geboorte, in symbolische (een-dag-voor-een-jaar) tijd. In tegenstelling tot een progressieve horoscoop hangt hier niets af van een progressieve Maan of planetaire snelheid.',
  declinationNote: 'Alleen lengte: de declinatie wordt niet gedirigeerd.',
  hintInfoLabel: 'Over zonneboogdirecties',
  positionLabel: 'Positie',
  calculating: 'Berekenen…',
  error: (message: string) => `Solar arc-directies konden niet worden berekend. ${message}`,

  ageLine: (age: string) => `Leeftijd ${age}`,
  beforeBirth: '(vóór de geboorte)',
  arcLine: (arc: string) => `Boog: ${arc}°`,

  positionsCaption: 'Gedirigeerde posities',
  contactsCaption: 'Gedirigeerd-natale contacten',
  noContacts: 'Geen gedirigeerd-natale contacten binnen orb.',
  directedInLabel: 'Gedirigeerd in',
  directedIn: { longitude: 'Lengte', declination: 'Declinatie' },
  arcLabel: 'Boog',
  arcKinds: { solar: 'Zonneboog', ascendant: 'Ascendantboog', vertex: 'Vertexboog' },
  multiplierLabel: 'Vermenigvuldiger',
  multipliers: {
    '1': '×1 (normaal)',
    '2': '×2 (dubbel)',
    '0.5': '×0,5 (half)',
    '-1': '×−1 (negatief)',
    '-2': '×−2 (negatief dubbel)',
    '-0.5': '×−0,5 (negatief half)',
  },
  converseLabel: 'Convers (terug in de tijd)',
  exactNotDated: 'niet gedateerd voor deze boog',
  declinationArcLine: (arc: string) => `Boog in declinatie: ${arc}°`,
  declinationPositionsCaption: 'Gedirigeerde declinaties',
  declinationContactsCaption: 'Gedirigeerd-natale parallellen',
  noDeclinationContacts: 'Geen gedirigeerd-natale parallellen of contraparallellen binnen orb.',
  natalDeclinationLabel: 'Natal',
  directedDeclinationLabel: 'Gedirigeerd',
  directedBodyLabel: 'Gedirigeerd',
  natalBodyLabel: 'Natal',
  contactKindLabel: 'Contact',
  contactKinds: { parallel: 'Parallel', contraparallel: 'Contraparallel' },
  north: 'N',
  south: 'Z',

  bodyLabel: 'Hemellichaam',
  houseLabel: 'Huis',

  bodyALabel: 'Gedirigeerd',
  aspectLabel: 'Aspect',
  bodyBLabel: 'Natal',
  orbLabel: 'Orb',
  applyingLabel: 'Toenemend',
  applying: 'Toenemend',
  separating: 'Afnemend',
  exactOnLabel: 'Exact op',
  exactOnUnknown: 'buiten zoekvenster',
};

export const solarArcViewMessages = { en, nl };
