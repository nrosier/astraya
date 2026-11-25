/**
 * Message catalogue for `TrutineView.tsx` (#1407).
 */
/**
 * @module TrutineView.messages
 * @purpose English/Dutch message catalogue for the Trutine of Hermes conception chart screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `TrutineView.tsx`; `nl` is typed as `typeof en`; the Dutch is machine-drafted and awaits a native review.
 * @exports trutineViewMessages
 */
const en = {
  thisPerson: 'This person',
  personPageLink: 'person page',
  needsCompleteRecord: (name: string) =>
    `The Trutine of Hermes needs the birthplace and a known time, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  headingFallback: 'Trutine of Hermes',
  heading: (name: string) => `${name}’s Trutine of Hermes`,
  hint: 'William Lilly’s conception chart: the gestation in days is read from his table from the birth Moon and Ascendant, and the chart is cast for noon on the conception day.',
  calculating: 'Calculating…',
  error: (message: string) => `The Trutine of Hermes could not be calculated. ${message}`,
  julianOnly:
    'Lilly’s table is reckoned in the Julian calendar, so the Trutine of Hermes can only be cast for a birth dated in the Julian calendar. This birth is read in the Gregorian calendar. Change the calendar on the person page if the date was written in the Julian one.',
  basis: 'Trutine of Hermes (Lilly, Christian Astrology, 1647, pp. 503-504)',
  conceptionLabel: 'Conception (Julian date)',
  gestationLabel: 'Gestation',
  gestationDays: (n: string) => `${n} days`,
  columnUnder: 'Moon under the earth',
  columnAbove: 'Moon above the earth',
  columnLabel: 'Column of the table',
  checkPassed: (degrees: string) => `Check passed: the conception Moon is ${degrees}° from the birth Ascendant`,
  checkFailed: (degrees: string) =>
    `Check not met: the conception Moon is ${degrees}° from the birth Ascendant (Lilly's limit is 13°)`,
  summaryLabel: 'Conception summary',
  housesUndefined:
    'This chart has no houses: the birthplace is too far north or south for the chosen house system at that moment.',
};

const nl: typeof en = {
  thisPerson: 'Deze persoon',
  personPageLink: 'persoonspagina',
  needsCompleteRecord: (name: string) =>
    `De Trutina Hermetis heeft de geboorteplaats en een bekend tijdstip nodig, dus een volledig geboorterecord met bekende tijd. Dat van ${name} heeft er nog geen. Vul het aan of corrigeer het op de`,
  headingFallback: 'Trutina Hermetis',
  heading: (name: string) => `Trutina Hermetis van ${name}`,
  hint: 'De conceptiehoroscoop van William Lilly: de zwangerschapsduur in dagen wordt uit zijn tabel gelezen aan de hand van de maan en de ascendant bij de geboorte, en de horoscoop wordt opgesteld voor het middaguur van de conceptiedag.',
  calculating: 'Berekenen…',
  error: (message: string) => `De Trutina Hermetis kon niet worden berekend. ${message}`,
  julianOnly:
    'Lilly’s tabel rekent in de juliaanse kalender, dus de Trutina Hermetis kan alleen worden opgesteld voor een geboorte met een juliaanse datum. Deze geboorte wordt in de gregoriaanse kalender gelezen. Pas de kalender aan op de persoonspagina als de datum juliaans is geschreven.',
  basis: 'Trutina Hermetis (Lilly, Christian Astrology, 1647, blz. 503-504)',
  conceptionLabel: 'Conceptie (juliaanse datum)',
  gestationLabel: 'Zwangerschapsduur',
  gestationDays: (n: string) => `${n} dagen`,
  columnUnder: 'Maan onder de aarde',
  columnAbove: 'Maan boven de aarde',
  columnLabel: 'Kolom van de tabel',
  checkPassed: (degrees: string) =>
    `Controle geslaagd: de conceptiemaan staat ${degrees}° van de ascendant bij de geboorte`,
  checkFailed: (degrees: string) =>
    `Controle niet gehaald: de conceptiemaan staat ${degrees}° van de ascendant bij de geboorte (Lilly's grens is 13°)`,
  summaryLabel: 'Samenvatting van de conceptie',
  housesUndefined:
    'Deze horoscoop heeft geen huizen: de geboorteplaats ligt te ver noordelijk of zuidelijk voor het gekozen huizensysteem op dat moment.',
};

export const trutineViewMessages = { en, nl };
