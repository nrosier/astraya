/**
 * Message catalogue for `ReturnView.tsx`: the solar and lunar return charts on the Charts page.
 */
const en = {
  personFallback: 'Person',
  thisPerson: 'This person',
  solarHeading: (name: string) => `${name}’s solar return`,
  lunarHeading: (name: string) => `${name}’s lunar return`,
  solarHeadingFallback: 'Solar return',
  lunarHeadingFallback: 'Lunar return',
  solarHint:
    'The chart cast for the moment the Sun returns to its exact natal longitude in the chosen year, once a year around the birthday.',
  lunarHint:
    'The chart cast for the moment the Moon returns to its exact natal longitude: the first one on or after the chosen date. The Moon comes back about every 27.3 days.',
  needsCompleteRecord: (name: string) =>
    `A return is found from the natal Sun or Moon, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  personPageLink: 'person page',
  yearLabel: 'Year',
  fromDateLabel: 'On or after (UTC date)',
  invalidYear: 'Enter a year between 1800 and 2200.',
  invalidDate: 'Enter a date.',
  placeLegend: 'Cast for',
  placeHint:
    'The return itself is one moment in time. The houses and angles depend on where the chart is cast: the birthplace by default, or the place the person is at the return.',
  placeBirth: 'The birthplace',
  placeOther: 'Another place',
  latitudeLabel: 'Latitude (north +)',
  longitudeLabel: 'Longitude (east +)',
  invalidPlace: 'Enter a latitude between −90 and 90 and a longitude between −180 and 180.',
  returnMoment: (utc: string) => `Exact return: ${utc}`,
  conventions:
    'Tropical zodiac, Placidus houses, default orbs. The Extended settings of the natal chart do not apply here.',
  castFor: (place: string) => `cast for ${place}`,
  calculating: 'Calculating…',
  chartError: (message: string) => `Could not calculate the return: ${message}`,
  housesUndefined:
    'The houses have no valid solution at this place — it falls at a latitude the chosen house system can’t resolve.',
  solarLabel: (year: string) => `Solar return ${year}`,
  lunarLabel: 'Lunar return',
  contactsCaption: 'Contacts to the natal chart',
  contactsHint: 'Aspects between the return chart’s planets and the natal chart’s (planets only, not the angles).',
  returnColumn: 'Return',
  natalColumn: 'Natal',
  aspectLabel: 'Aspect',
  orbLabel: 'Orb',
  applyingLabel: 'Applying',
  applying: 'Applying',
  separating: 'Separating',
};

const nl: typeof en = {
  personFallback: 'Persoon',
  thisPerson: 'Deze persoon',
  solarHeading: (name: string) => `Zonneterugkeer van ${name}`,
  lunarHeading: (name: string) => `Maanterugkeer van ${name}`,
  solarHeadingFallback: 'Zonneterugkeer',
  lunarHeadingFallback: 'Maanterugkeer',
  solarHint:
    'De horoscoop voor het moment waarop de Zon in het gekozen jaar terugkeert op haar exacte natale lengte, eens per jaar rond de verjaardag.',
  lunarHint:
    'De horoscoop voor het moment waarop de Maan terugkeert op haar exacte natale lengte: de eerste op of na de gekozen datum. De Maan komt ongeveer elke 27,3 dagen terug.',
  needsCompleteRecord: (name: string) =>
    `Een terugkeer wordt gevonden vanuit de natale Zon of Maan, dus is een volledig geboorterecord met een bekende tijd vereist. Dat van ${name} is nog niet compleet. Vul het aan of corrigeer het op de`,
  personPageLink: 'persoonspagina',
  yearLabel: 'Jaar',
  fromDateLabel: 'Op of na (UTC-datum)',
  invalidYear: 'Voer een jaar in tussen 1800 en 2200.',
  invalidDate: 'Voer een datum in.',
  placeLegend: 'Berekend voor',
  placeHint:
    'De terugkeer zelf is één moment in de tijd. De huizen en assen hangen af van de plaats waarvoor de horoscoop wordt berekend: standaard de geboorteplaats, of de plaats waar de persoon zich bij de terugkeer bevindt.',
  placeBirth: 'De geboorteplaats',
  placeOther: 'Een andere plaats',
  latitudeLabel: 'Breedtegraad (noord +)',
  longitudeLabel: 'Lengtegraad (oost +)',
  invalidPlace: 'Voer een breedtegraad in tussen −90 en 90 en een lengtegraad tussen −180 en 180.',
  returnMoment: (utc: string) => `Exacte terugkeer: ${utc}`,
  conventions:
    'Tropische dierenriem, Placidus-huizen, standaardorbs. De uitgebreide instellingen van het geboortehoroscoop gelden hier niet.',
  castFor: (place: string) => `berekend voor ${place}`,
  calculating: 'Berekenen…',
  chartError: (message: string) => `De terugkeer kon niet worden berekend: ${message}`,
  housesUndefined:
    'De huizen hebben op deze plaats geen geldige oplossing — de plaats ligt op een breedtegraad die het gekozen huizensysteem niet kan oplossen.',
  solarLabel: (year: string) => `Zonneterugkeer ${year}`,
  lunarLabel: 'Maanterugkeer',
  contactsCaption: 'Contacten met de geboortehoroscoop',
  contactsHint:
    'Aspecten tussen de planeten van de terugkeerhoroscoop en die van de geboortehoroscoop (alleen planeten, niet de assen).',
  returnColumn: 'Terugkeer',
  natalColumn: 'Natal',
  aspectLabel: 'Aspect',
  orbLabel: 'Orb',
  applyingLabel: 'Toenemend',
  applying: 'Toenemend',
  separating: 'Afnemend',
};

export const returnViewMessages = { en, nl };
