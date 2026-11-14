/**
 * @module HeliocentricView.messages
 * @purpose English/Dutch i18n strings for the heliocentric chart screen (#1407).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by HeliocentricView.tsx via `useMessages(heliocentricViewMessages)`; `nl` is typed as `typeof en`.
 * @exports heliocentricViewMessages
 */
const en = {
  thisPerson: 'This person',
  heliocentricChartFallback: 'Heliocentric Chart',
  needsCompleteRecord: (name: string) =>
    `A heliocentric chart places every planet as seen from the Sun at the moment of birth, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  personPageLink: 'person page',

  heading: (name: string) => `${name}’s Heliocentric Chart`,
  headingFallback: 'Heliocentric Chart',
  hint: 'The planets as seen from the Sun, in the tropical zodiac. The Earth takes the Sun’s place. The Moon, the lunar nodes, Lilith and the calculated points are seen from the Earth by definition, so they are left out, and so are the houses and angles, which depend on a place on the Earth.',
};

const nl: typeof en = {
  thisPerson: 'Deze persoon',
  heliocentricChartFallback: 'Heliocentrische horoscoop',
  needsCompleteRecord: (name: string) =>
    `Een heliocentrische horoscoop plaatst elke planeet zoals die vanaf de Zon werd gezien op het geboortemoment, dus is een volledig geboorterecord met een bekende tijd vereist. Dat van ${name} is nog niet compleet. Vul het aan of corrigeer het op de`,
  personPageLink: 'persoonspagina',

  heading: (name: string) => `Heliocentrische horoscoop van ${name}`,
  headingFallback: 'Heliocentrische horoscoop',
  hint: 'De planeten zoals ze vanaf de Zon worden gezien, in de tropische dierenriem. De Aarde neemt de plaats van de Zon in. De Maan, de maansknopen, Lilith en de berekende punten worden per definitie vanaf de Aarde gezien en zijn daarom weggelaten, net als de huizen en hoeken, die van een plaats op Aarde afhangen.',
};

export const heliocentricViewMessages = { en, nl };
