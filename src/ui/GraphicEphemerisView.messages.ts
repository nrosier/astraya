/** Message catalogue for `GraphicEphemerisView.tsx` (#1404). */
/**
 * @module GraphicEphemerisView.messages
 * @purpose English/Dutch i18n strings for the Graphic ephemeris tool screen: the date range and body selection form, the time plot and its table.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by GraphicEphemerisView.tsx via `useMessages(graphicEphemerisViewMessages)`; `nl` is typed as `typeof en`.
 * @exports graphicEphemerisViewMessages
 */
const en = {
  heading: 'Graphic ephemeris',
  hint: 'Where the Sun, Moon and planets stand in the zodiac, day by day, over a range of dates — found from the ephemeris alone, with no birth chart involved. Each body is one line: it climbs through the signs, flattens at a station and runs back while retrograde.',
  settingsHeading: 'Range and bodies',
  startLabel: 'Start date',
  endLabel: 'End date',
  rangeHelp: 'UTC days, 1800 to 2399, up to five years. Opens on one year.',
  classicalLegend: 'Classical seven',
  outerLegend: 'Outer bodies',
  bodiesHelp: 'Add outer bodies to draw them as well.',
  plotButton: 'Plot',
  plotting: 'Plotting…',
  summaryHeading: 'Bodies drawn',
  noBodies: 'Choose at least one body.',
  invalid: 'Enter both dates as real calendar dates.',
  reversed: 'The end date must not be before the start date.',
  outsideEphemeris: (min: number, max: number) => `Choose dates between ${String(min)} and ${String(max)}.`,
  tooLong: (years: number) => `Choose a range of at most ${String(years)} years.`,
  error: (message: string) => `The ephemeris could not be plotted. ${message}`,
  summary: (days: number, bodies: number, from: string, to: string) =>
    `${String(days)} ${days === 1 ? 'day' : 'days'} of ${String(bodies)} ${bodies === 1 ? 'body' : 'bodies'}, ${from} to ${to} (UTC).`,
  plotHeading: 'Longitude over time',
  plotCaption:
    'Time runs left to right and the zodiac bottom to top, 0° Aries at the base. A line breaks where a body passes from Pisces back into Aries.',
  tableCaption: 'Ecliptic longitudes',
  dateColumn: 'Date (UTC)',
  tableHint: 'The same values as the plot, one row per day at 00:00 UTC.',
};

const nl: typeof en = {
  heading: 'Grafische efemeriden',
  hint: 'Waar Zon, Maan en planeten dag na dag in de dierenriem staan, over een reeks data — berekend uit alleen de efemeriden, zonder geboortehoroscoop. Elk hemellichaam is één lijn: die stijgt door de tekens, vlakt af bij een standpunt en loopt terug zolang het lichaam retrograde is.',
  settingsHeading: 'Periode en hemellichamen',
  startLabel: 'Startdatum',
  endLabel: 'Einddatum',
  rangeHelp: 'UTC-dagen, 1800 tot 2399, tot vijf jaar. Opent op één jaar.',
  classicalLegend: 'Klassieke zeven',
  outerLegend: 'Buitenste planeten',
  bodiesHelp: 'Voeg buitenste planeten toe om ze ook te tekenen.',
  plotButton: 'Tekenen',
  plotting: 'Tekenen…',
  summaryHeading: 'Getekende hemellichamen',
  noBodies: 'Kies minstens één hemellichaam.',
  invalid: 'Vul beide data in als echte kalenderdata.',
  reversed: 'De einddatum mag niet voor de startdatum liggen.',
  outsideEphemeris: (min: number, max: number) => `Kies data tussen ${String(min)} en ${String(max)}.`,
  tooLong: (years: number) => `Kies een periode van hooguit ${String(years)} jaar.`,
  error: (message: string) => `De efemeriden konden niet worden getekend. ${message}`,
  summary: (days: number, bodies: number, from: string, to: string) =>
    `${String(days)} ${days === 1 ? 'dag' : 'dagen'} van ${String(bodies)} ${bodies === 1 ? 'hemellichaam' : 'hemellichamen'}, ${from} tot ${to} (UTC).`,
  plotHeading: 'Lengte in de tijd',
  plotCaption:
    'De tijd loopt van links naar rechts en de dierenriem van onder naar boven, met 0° Ram onderaan. Een lijn breekt waar een hemellichaam van Vissen terug in Ram komt.',
  tableCaption: 'Ecliptische lengtes',
  dateColumn: 'Datum (UTC)',
  tableHint: 'Dezelfde waarden als de grafiek, één rij per dag om 00:00 UTC.',
};

export const graphicEphemerisViewMessages = { en, nl };
