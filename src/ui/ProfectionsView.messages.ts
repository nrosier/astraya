/**
 * Message catalogue for `ProfectionsView.tsx` (#158).
 */
/**
 * @module ProfectionsView.messages
 * @purpose English/Dutch message catalogue for the annual/monthly profections screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `ProfectionsView.tsx`.
 * @exports profectionsViewMessages
 */
const en = {
  personFallback: 'Person',
  profectionsFallback: 'Profections',
  thisPerson: 'This person',
  notCompleteProfections: (name: string) =>
    `${name}'s birth record is not complete enough to calculate profections yet. Fill in the missing fields on the`,
  personPageLink: 'person page',
  needsKnownTime: (name: string) =>
    `Profections rotate the natal Ascendant, so they need a known birth time. ${name}'s birth time is unknown — the same reason their chart has no houses.`,

  heading: (name: string) => `${name}'s profections`,
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

  meaningHeading: 'What the profected houses mean',
  periodHouse: (period: string, house: string) => `${period}: ${house} house`,

  rulersHeading: 'About the Lords of the Year and Month',
  rulersTraditional:
    'The Traditional rulers recognize only the seven classical planets visible to the naked eye: Sun, Moon, Mercury, Venus, Mars, Jupiter and Saturn. This is the historically faithful choice for profections, a Hellenistic technique that predates modern astrology by 2000 years.',
  rulersModern:
    'The Modern rulers add the trans-Saturnian planets: Uranus (Aquarius), Neptune (Pisces) and Pluto (Scorpio) were discovered or added to the system in the last 300 years. This is standard in contemporary Western astrology.',
  rulersBoth:
    'The "Both" mode lists traditional and modern rulers as co-rulers — Aquarius has both Saturn and Uranus, Pisces has both Jupiter and Neptune, and Scorpio has both Mars and Pluto. This acknowledges the historical transition from classical to modern rulership.',
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

  meaningHeading: 'Wat de geprofecteerde huizen betekenen',
  periodHouse: (period, house) => `${period}: ${house} huis`,

  rulersHeading: 'Over de Heersers van het Jaar en Maand',
  rulersTraditional:
    'De Traditionele heersers erkennen alleen de zeven klassieke planeten die met het blote oog zichtbaar zijn: Zon, Maan, Mercurius, Venus, Mars, Jupiter en Saturnus. Dit is de historisch trouwste keuze voor profecties, een Hellenistische techniek die 2000 jaar ouder is dan de moderne astrologie.',
  rulersModern:
    'De Moderne heersers voegen de trans-Saturniaanse planeten toe: Uranus (Waterman), Neptunus (Vissen) en Pluto (Schorpioen) werden in de afgelopen 300 jaar ontdekt of aan het systeem toegevoegd. Dit is standaard in hedendaagse Westerse astrologie.',
  rulersBoth:
    'De modus "Beide" somt traditionele en moderne heersers als co-heersers op — Waterman heeft zowel Saturnus als Uranus, Vissen heeft zowel Jupiter als Neptunus, en Schorpioen heeft zowel Mars als Pluto. Dit erkent de historische overgang van klassieke naar moderne heerschappij.',
};

export const profectionsViewMessages = { en, nl };
