/**
 * Message catalogue for `RiseSetView.tsx` (#1407).
 */
/**
 * @module RiseSetView.messages
 * @purpose English/Dutch message catalogue for the rise and set chart screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `RiseSetView.tsx`; `nl` is typed as `typeof en`.
 * @exports riseSetViewMessages
 */
const en = {
  thisPerson: 'This person',
  personPageLink: 'person page',
  needsCompleteRecord: (name: string) =>
    `A rise and set chart needs the birthplace and a known time, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  headingFallback: 'Rise and Set',
  heading: (name: string) => `${name}’s Rise and Set`,
  hint: 'The chart for the moment a body rises, sets or culminates at the birthplace. Solar Fire Deluxe calls this the rise and set chart (§12.9).',
  calculating: 'Calculating…',
  error: (message: string) => `The rise and set chart could not be calculated. ${message}`,
  bodyLabel: 'Body',
  eventLabel: 'Event',
  event: { rise: 'Rise', set: 'Set', culminate: 'Culmination', anticulminate: 'Anti-culmination' },
  horizonLabel: 'Horizon',
  horizon: { true: 'True', visual: 'Visual', 'centre-topocentric': 'Disc centre, topocentric' },
  horizonHint:
    'True puts the centre of the body on the astronomical horizon, with no refraction or parallax. Visual uses the upper edge of the body, with refraction.',
  dateLabel: 'From the date',
  invalidDate: 'Enter a date.',
  eventMoment: (moment: string) => `Event: ${moment}`,
  basis: (body: string, event: string, horizon: string, moment: string) =>
    `${body} ${event} (${horizon} horizon), ${moment}`,
  circumpolar: (body: string) =>
    `${body} stays above the horizon at the birthplace through the next day and a half, so it does not rise or set in that time.`,
  neverRises: (body: string, event: string) =>
    `${body} has no ${event} at the birthplace in the next day and a half: it stays below the horizon, or the event falls outside that window.`,
  conventions:
    'The event is the first one after the start of the chosen date, at the birthplace. The chart is cast for that moment and place.',
  housesUndefined:
    'This chart has no houses: the birthplace is too far north or south for the chosen house system at that moment.',
};

const nl: typeof en = {
  thisPerson: 'Deze persoon',
  personPageLink: 'persoonspagina',
  needsCompleteRecord: (name: string) =>
    `Een op- en ondergangshoroscoop heeft de geboorteplaats en een bekend tijdstip nodig, dus een volledig geboorterecord met bekende tijd. Dat van ${name} heeft er nog geen. Vul het aan of corrigeer het op de`,
  headingFallback: 'Op- en ondergang',
  heading: (name: string) => `Op- en ondergang van ${name}`,
  hint: 'De horoscoop voor het moment waarop een hemellichaam op de geboorteplaats opkomt, ondergaat of culmineert. Solar Fire Deluxe noemt dit de op- en ondergangshoroscoop (§12.9).',
  calculating: 'Berekenen…',
  error: (message: string) => `De op- en ondergangshoroscoop kon niet worden berekend. ${message}`,
  bodyLabel: 'Hemellichaam',
  eventLabel: 'Gebeurtenis',
  event: { rise: 'Opkomst', set: 'Ondergang', culminate: 'Culminatie', anticulminate: 'Anticulminatie' },
  horizonLabel: 'Horizon',
  horizon: { true: 'Ware', visual: 'Zichtbare', 'centre-topocentric': 'Schijfcentrum, topocentrisch' },
  horizonHint:
    'Ware zet het middelpunt van het lichaam op de astronomische horizon, zonder refractie of parallax. Zichtbare gebruikt de bovenrand van het lichaam, met refractie.',
  dateLabel: 'Vanaf de datum',
  invalidDate: 'Voer een datum in.',
  eventMoment: (moment: string) => `Gebeurtenis: ${moment}`,
  basis: (body: string, event: string, horizon: string, moment: string) =>
    `${body} ${event} (${horizon} horizon), ${moment}`,
  circumpolar: (body: string) =>
    `${body} blijft op de geboorteplaats de komende anderhalve dag boven de horizon, en komt of gaat in die tijd dus niet op of onder.`,
  neverRises: (body: string, event: string) =>
    `${body} heeft op de geboorteplaats de komende anderhalve dag geen ${event}: het blijft onder de horizon, of de gebeurtenis valt buiten dat venster.`,
  conventions:
    'De gebeurtenis is de eerste na het begin van de gekozen datum, op de geboorteplaats. De horoscoop is berekend voor dat moment en die plaats.',
  housesUndefined:
    'Deze horoscoop heeft geen huizen: de geboorteplaats ligt te ver noordelijk of zuidelijk voor het gekozen huizensysteem op dat moment.',
};

export const riseSetViewMessages = { en, nl };
