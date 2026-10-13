/**
 * Message catalogue for the ephemeris research screen (#562).
 */
/**
 * @module EventSearchView.messages
 * @purpose English/Dutch UI text for bounded event searches and reproducible CSV download.
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages()`.
 * @exports eventSearchViewMessages
 */
const en = {
  heading: 'Ephemeris research',
  intro:
    'Search a UTC date range for exact sky events and download the parameters with the results as reproducible CSV.',
  rangeLegend: 'UTC date range',
  fromLabel: 'From',
  toLabel: 'To',
  eventsLegend: 'Events and filters',
  stationBody: 'Station body',
  ingressBody: 'Ingress body',
  aspectBodyA: 'First aspect body',
  aspectBodyB: 'Second aspect body',
  aspect: 'Exact aspect',
  kindLabels: {
    station: 'Stations',
    ingress: 'Sign ingresses',
    lunation: 'New and Full Moons',
    aspect: 'Exact moving-body aspects',
  },
  searchButton: 'Search events',
  searching: 'Searching the ephemeris…',
  invalidRange: 'Enter a valid non-empty UTC date range in YYYY-MM-DD format and choose at least one event kind.',
  needsTwoBodies: 'Choose two different bodies for an exact aspect search.',
  resultCount: (count: string) => `${count} events found`,
  downloadCsv: 'Download reproducible CSV',
  date: 'UTC date',
  kind: 'Kind',
  event: 'Event',
};
const nl: typeof en = {
  heading: 'Ephemerisonderzoek',
  intro:
    'Doorzoek een UTC-datumbereik op exacte hemelgebeurtenissen en download parameters en resultaten als reproduceerbare CSV.',
  rangeLegend: 'UTC-datumbereik',
  fromLabel: 'Van',
  toLabel: 'Tot',
  eventsLegend: 'Gebeurtenissen en filters',
  stationBody: 'Stationerend lichaam',
  ingressBody: 'Ingang-lichaam',
  aspectBodyA: 'Eerste aspectlichaam',
  aspectBodyB: 'Tweede aspectlichaam',
  aspect: 'Exact aspect',
  kindLabels: {
    station: 'Stations',
    ingress: 'Tekenovergangen',
    lunation: 'Nieuwe en volle manen',
    aspect: 'Exacte aspecten tussen bewegende lichamen',
  },
  searchButton: 'Gebeurtenissen zoeken',
  searching: 'Ephemeris wordt doorzocht…',
  invalidRange: 'Vul een geldig, niet-leeg UTC-datumbereik in als JJJJ-MM-DD en kies minstens één gebeurtenissoort.',
  needsTwoBodies: 'Kies twee verschillende lichamen voor een exacte aspectzoekopdracht.',
  resultCount: (count: string) => `${count} gebeurtenissen gevonden`,
  downloadCsv: 'Reproduceerbare CSV downloaden',
  date: 'UTC-datum',
  kind: 'Soort',
  event: 'Gebeurtenis',
};
export const eventSearchViewMessages = { en, nl };
