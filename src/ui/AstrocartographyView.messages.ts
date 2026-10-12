/**
 * Message catalogue for `AstrocartographyView.tsx` (#158).
 */
/**
 * @module AstrocartographyView.messages
 * @purpose English/Dutch i18n strings for the Astrocartography screen: line-type/body legends, relocation controls, and export labels.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by AstrocartographyView.tsx via `useMessages(astrocartographyViewMessages)`; `nl` is typed as `typeof en`.
 * @exports astrocartographyViewMessages
 */
const en = {
  personFallback: 'Person',
  astrocartographyFallback: 'Astrocartography',
  thisPerson: 'This person',
  notCompleteMap: (name: string) =>
    `${name}’s birth record is not complete enough to calculate a map yet. Fill in the missing fields on the`,
  personPageLink: 'person page',
  needsKnownTime: (name: string) =>
    `Astrocartography lines shift about 15° of longitude per hour of birth-time error, so this needs a known birth time. ${name}’s birth time is unknown — the same reason their chart has no houses.`,

  heading: (name: string) => `${name}’s astrocartography`,
  hint: 'Where in the world each body’s angles (MC/IC/AC/DC) fall on the horizon or meridian right now, plus optional Local Space lines (azimuth vectors from the birthplace). Line kind is shown by both colour and dash pattern, so it stays readable without colour.',

  mc: 'MC (Midheaven)',
  ic: 'IC (Nadir)',
  ac: 'AC (Ascendant)',
  dc: 'DC (Descendant)',

  meaningsHeading: 'What the lines mean',
  meaningsHint:
    'What each checked body is traditionally read to mean on each checked kind of line, as a starting point for reflection; astrocartography is an interpretive tradition, not a forecast.',

  relocatedAscendantMidheaven: (ascendant: string, midheaven: string) =>
    `Ascendant: ${ascendant} · Midheaven: ${midheaven}`,

  calculating: 'Calculating…',
  updating: 'Updating the map…',
  selectedLines: (count: number) => `${String(count)} ${count === 1 ? 'line type' : 'line types'} selected`,
  showMeanings: 'Show meanings',
  hideMeanings: 'Hide meanings',
  error: (message: string) => `The map could not be calculated. ${message}`,

  downloadSvg: 'Download SVG',
  downloadPng: 'Download PNG',

  pngSmall: 'Small (900px)',
  pngMedium: 'Medium (1800px)',
  pngLarge: 'Large (3600px)',
};

const nl: typeof en = {
  personFallback: 'Persoon',
  astrocartographyFallback: 'Astrocartografie',
  thisPerson: 'Deze persoon',
  notCompleteMap: (name: string) =>
    `Het geboorterecord van ${name} is niet volledig genoeg om een kaart te berekenen. Vul de ontbrekende velden in op de`,
  personPageLink: 'persoonspagina',
  needsKnownTime: (name: string) =>
    `Astrocartografielijnen verschuiven ongeveer 15° lengtegraad per uur geboortetijdfout, dus is een bekende geboortetijd vereist. De geboortetijd van ${name} is onbekend — dezelfde reden waarom hun horoscoop geen huizen heeft.`,

  heading: (name: string) => `Astrocartografie van ${name}`,
  hint: 'Waar op de wereld de hoeken (MC/IC/AC/DC) van elk hemellichaam nu op de horizon of meridiaan vallen, plus optionele Local Space-lijnen (azimutvectoren vanaf de geboorteplaats). Het lijntype wordt zowel door kleur als streeppatroon getoond, zodat het ook zonder kleur leesbaar blijft.',

  mc: 'MC (Midheaven)',
  ic: 'IC (Nadir)',
  ac: 'AC (Ascendant)',
  dc: 'DC (Descendant)',

  meaningsHeading: 'Wat de lijnen betekenen',
  meaningsHint:
    'Wat elk aangevinkt hemellichaam traditioneel betekent op elk aangevinkt type lijn, als startpunt voor reflectie; astrocartografie is een interpretatieve traditie, geen voorspelling.',

  relocatedAscendantMidheaven: (ascendant: string, midheaven: string) =>
    `Ascendant: ${ascendant} · Midheaven: ${midheaven}`,

  calculating: 'Berekenen…',
  updating: 'Kaart wordt bijgewerkt…',
  selectedLines: (count: number) => `${String(count)} ${count === 1 ? 'lijntype' : 'lijntypen'} geselecteerd`,
  showMeanings: 'Toon betekenissen',
  hideMeanings: 'Verberg betekenissen',
  error: (message: string) => `De kaart kon niet worden berekend. ${message}`,

  downloadSvg: 'SVG downloaden',
  downloadPng: 'PNG downloaden',

  pngSmall: 'Klein (900px)',
  pngMedium: 'Middel (1800px)',
  pngLarge: 'Groot (3600px)',
};

export const astrocartographyViewMessages = { en, nl };
