/**
 * Message catalogue for `ProfectionsView.tsx` (#158).
 */
const en = {
  personFallback: 'Person',
  profectionsFallback: 'Profections',
  thisPerson: 'This person',
  notCompleteProfections: (name: string) =>
    `${name}’s birth record is not complete enough to calculate profections yet. Fill in the missing fields on the`,
  personPageLink: 'person page',
  needsKnownTime: (name: string) =>
    `Profections rotate the natal Ascendant, so they need a known birth time. ${name}’s birth time is unknown — the same reason their chart has no houses.`,

  heading: (name: string) => `${name}’s profections`,
  hint: 'Annual and monthly profections: a house-per-year rotation of the natal Ascendant. The "Lord of the Year/Month" is the ruler of the profected sign, by the planetary rulers you choose below; the technique is Hellenistic and predates the outer planets, so Traditional is the historically faithful choice.',
  asOfLabel: 'As of',
  calculating: 'Calculating…',
  error: (message: string) => `Profections could not be calculated. ${message}`,

  ageLine: (age: string) => `Age ${age}`,
  beforeBirth: '(before birth)',

  profectionsCaption: 'Profections',
  periodLabel: 'Period',
  signLabel: 'Sign',
  degLabel: 'Deg',
  minLabel: 'Min',
  secLabel: 'Sec',
  lordLabel: 'Lord',

  yearPeriod: 'Year',
  monthPeriod: 'Month',
};

const nl: typeof en = {
  personFallback: 'Persoon',
  profectionsFallback: 'Profecties',
  thisPerson: 'Deze persoon',
  notCompleteProfections: (name: string) =>
    `Het geboorterecord van ${name} is niet volledig genoeg om profecties te berekenen. Vul de ontbrekende velden in op de`,
  personPageLink: 'persoonspagina',
  needsKnownTime: (name: string) =>
    `Profecties draaien de natale Ascendant rond, dus is een bekende geboortetijd vereist. De geboortetijd van ${name} is onbekend — dezelfde reden waarom hun horoscoop geen huizen heeft.`,

  heading: (name: string) => `Profecties van ${name}`,
  hint: 'Jaarlijkse en maandelijkse profecties: een rotatie van de natale Ascendant met één huis per jaar. De "Heerser van het Jaar/Maand" is de heerser van het geprofecteerde teken, volgens de heersende planeten die je hieronder kiest; de techniek is hellenistisch en dateert van vóór de buitenplaneten, dus Traditioneel is de historisch trouwste keuze.',
  asOfLabel: 'Vanaf',
  calculating: 'Berekenen…',
  error: (message: string) => `Profecties konden niet worden berekend. ${message}`,

  ageLine: (age: string) => `Leeftijd ${age}`,
  beforeBirth: '(vóór de geboorte)',

  profectionsCaption: 'Profecties',
  periodLabel: 'Periode',
  signLabel: 'Teken',
  degLabel: 'Gr',
  minLabel: 'Min',
  secLabel: 'Sec',
  lordLabel: 'Heerser',

  yearPeriod: 'Jaar',
  monthPeriod: 'Maand',
};

export const profectionsViewMessages = { en, nl };
