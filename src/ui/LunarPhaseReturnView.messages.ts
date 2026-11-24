/**
 * Message catalogue for `LunarPhaseReturnView.tsx` (#1407).
 */
/**
 * @module LunarPhaseReturnView.messages
 * @purpose English/Dutch message catalogue for the lunar phase return chart screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `LunarPhaseReturnView.tsx`; `nl` is typed as `typeof en`.
 * @exports lunarPhaseReturnViewMessages
 */
const en = {
  thisPerson: 'This person',
  personPageLink: 'person page',
  needsCompleteRecord: (name: string) =>
    `A lunar phase return needs the natal Sun and Moon at a known time, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  headingFallback: 'Lunar Phase Return',
  heading: (name: string) => `${name}’s Lunar Phase Return`,
  hint: 'The chart for the moment the angle between the Sun and the Moon comes back to what it was at birth. Solar Fire Deluxe lists these among its lunar phase charts (§12.10).',
  calculating: 'Calculating…',
  error: (message: string) => `The lunar phase return could not be calculated. ${message}`,
  dateLabel: 'Around the date',
  invalidDate: 'Enter a date.',
  whichLabel: 'Which one',
  which: { current: 'Before the date', nearest: 'Nearest', next: 'After the date' },
  phaseAngle: (degrees: string) => `Phase angle ${degrees}°`,
  returnMoment: (moment: string) => `Phase return: ${moment}`,
  returnsCaption: 'Phase returns from the last one before the date',
  returnColumn: 'Phase return',
  returnsHint:
    'Solar Fire lists phase returns starting one lunar month before the date; these start at the most recent return before the date, which is always within one lunar month of it.',
  conventions:
    'The phase angle is the Moon’s ecliptic longitude minus the Sun’s, so it is the same in every zodiac. Before the date, Nearest and After the date are Astraya’s own convenience, after the single-chart choice Solar Fire has for other lunar phase charts. The chart is cast at the birthplace.',
  housesUndefined:
    'This chart has no houses: the birthplace is too far north or south for the chosen house system at that moment.',
};

const nl: typeof en = {
  thisPerson: 'Deze persoon',
  personPageLink: 'persoonspagina',
  needsCompleteRecord: (name: string) =>
    `Een maanfaseterugkeer heeft de geboortezon en -maan op een bekend tijdstip nodig, dus een volledig geboorterecord met bekende tijd. Dat van ${name} heeft er nog geen. Vul het aan of corrigeer het op de`,
  headingFallback: 'Maanfaseterugkeer',
  heading: (name: string) => `Maanfaseterugkeer van ${name}`,
  hint: 'De horoscoop voor het moment waarop de hoek tussen de zon en de maan terugkeert naar wat die bij de geboorte was. Solar Fire Deluxe rekent deze tot zijn maanfasehoroscopen (§12.10).',
  calculating: 'Berekenen…',
  error: (message: string) => `De maanfaseterugkeer kon niet worden berekend. ${message}`,
  dateLabel: 'Rond de datum',
  invalidDate: 'Voer een datum in.',
  whichLabel: 'Welke',
  which: { current: 'Vóór de datum', nearest: 'Dichtstbijzijnde', next: 'Na de datum' },
  phaseAngle: (degrees: string) => `Fasehoek ${degrees}°`,
  returnMoment: (moment: string) => `Faseterugkeer: ${moment}`,
  returnsCaption: 'Faseterugkeren vanaf de laatste vóór de datum',
  returnColumn: 'Faseterugkeer',
  returnsHint:
    'Solar Fire toont faseterugkeren vanaf een maanmaand vóór de datum; deze beginnen bij de meest recente terugkeer vóór de datum, die altijd binnen een maanmaand ervan ligt.',
  conventions:
    'De fasehoek is de ecliptische lengte van de maan min die van de zon, dus in elke dierenriem gelijk. Vóór de datum, Dichtstbijzijnde en Na de datum zijn een eigen gemak van Astraya, naar de enkelvoudige keuze die Solar Fire bij andere maanfasehoroscopen heeft. De horoscoop is berekend voor de geboorteplaats.',
  housesUndefined:
    'Deze horoscoop heeft geen huizen: de geboorteplaats ligt te ver noordelijk of zuidelijk voor het gekozen huizensysteem op dat moment.',
};

export const lunarPhaseReturnViewMessages = { en, nl };
