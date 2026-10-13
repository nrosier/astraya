/**
 * Message catalogue for `RelocatedChartView.tsx` (#559).
 */
/**
 * @module RelocatedChartView.messages
 * @purpose English/Dutch i18n strings for the relocated-chart screen: the location picker, the relocated wheel, and the natal-vs-relocated comparison table.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by RelocatedChartView.tsx via `useMessages(relocatedChartViewMessages)`; `nl` is typed as `typeof en`.
 * @exports relocatedChartViewMessages
 */
const en = {
  personFallback: 'Person',
  thisPerson: 'This person',
  relocatedChartFallback: 'Relocated chart',
  needsCompleteRecord: (name: string) =>
    `A relocated chart keeps the exact birth moment but recomputes houses and angles for a different place, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  personPageLink: 'person page',

  heading: (name: string) => `${name}’s relocated chart`,
  headingFallback: 'Relocated chart',
  hint: 'The birth moment stays fixed; only the place changes. Planetary positions are identical to the natal chart — only houses, angles, and anything derived from the Ascendant (Vertex, Fortune, Spirit) move.',

  latitudeLabel: 'Relocation latitude',
  longitudeLabel: 'Relocation longitude',
  latitudeDecreaseLabel: 'Decrease relocation latitude',
  latitudeIncreaseLabel: 'Increase relocation latitude',
  longitudeDecreaseLabel: 'Decrease relocation longitude',
  longitudeIncreaseLabel: 'Increase relocation longitude',
  needsLocation: 'Enter a latitude and longitude to recompute this chart for another place.',
  invalidLocation: 'Latitude must be between -90 and 90; longitude between -180 and 180.',

  housesUndefined:
    'The chosen house system has no valid solution at this location’s latitude. Try a different house system in Extended settings, or a location further from the poles.',

  comparisonCaption: 'Natal vs. relocated',
  comparisonLabel: 'House / angle',
  comparisonNatal: 'Natal',
  comparisonRelocated: 'Relocated',
};

const nl: typeof en = {
  personFallback: 'Persoon',
  thisPerson: 'Deze persoon',
  relocatedChartFallback: 'Verplaatste horoscoop',
  needsCompleteRecord: (name: string) =>
    `Een verplaatste horoscoop houdt het exacte geboortemoment vast maar herberekent huizen en assen voor een andere plaats, dus is een volledig geboorterecord met een bekende tijd vereist. Dat van ${name} is nog niet compleet. Vul het aan of corrigeer het op de`,
  personPageLink: 'persoonspagina',

  heading: (name: string) => `Verplaatste horoscoop van ${name}`,
  headingFallback: 'Verplaatste horoscoop',
  hint: 'Het geboortemoment blijft vast; alleen de plaats verandert. Planeetposities zijn identiek aan de geboortehoroscoop — alleen huizen, assen en wat van de Ascendant is afgeleid (Vertex, Fortuna, Lot van de Geest) verschuiven.',

  latitudeLabel: 'Breedtegraad van verplaatsing',
  longitudeLabel: 'Lengtegraad van verplaatsing',
  latitudeDecreaseLabel: 'Breedtegraad van verplaatsing verkleinen',
  latitudeIncreaseLabel: 'Breedtegraad van verplaatsing vergroten',
  longitudeDecreaseLabel: 'Lengtegraad van verplaatsing verkleinen',
  longitudeIncreaseLabel: 'Lengtegraad van verplaatsing vergroten',
  needsLocation: 'Voer een breedte- en lengtegraad in om deze horoscoop voor een andere plaats te herberekenen.',
  invalidLocation: 'Breedtegraad moet tussen -90 en 90 liggen; lengtegraad tussen -180 en 180.',

  housesUndefined:
    'Het gekozen huizensysteem heeft geen geldige oplossing op de breedtegraad van deze locatie. Probeer een ander huizensysteem bij Uitgebreide instellingen, of een locatie verder van de polen.',

  comparisonCaption: 'Geboortehoroscoop vs. verplaatst',
  comparisonLabel: 'Huis / as',
  comparisonNatal: 'Geboortehoroscoop',
  comparisonRelocated: 'Verplaatst',
};

export const relocatedChartViewMessages = { en, nl };
