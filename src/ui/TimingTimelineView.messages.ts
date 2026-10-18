/**
 * @module TimingTimelineView.messages
 * @purpose English/Dutch labels for the timing timeline screen.
 * @conventions Co-located `{ en, nl }` catalogue with exact locale-key parity.
 * @exports timingTimelineViewMessages
 */
const en = {
  fallback: 'Timing timeline',
  heading: (name: string) => `${name}'s timing timeline`,
  hint: 'One shared date axis for zodiacal releasing, firdaria, profections, progressions, directions, transits, and forecast events. Period bars are active across their shown range; contacts mark an exact or selected date.',
  source:
    'Sources: Vettius Valens, Anthology IV (zodiacal releasing); al-Qabisi, Introduction to Traditional Astrology, VII.3 (firdaria periods).',
  asOfLabel: 'Centre date',
  calculating: 'Building timing timeline…',
  error: (message: string) => `Could not build the timeline: ${message}`,
  notComplete: (name: string) => `${name} needs complete birth details before timing techniques can be calculated.`,
  personPageLink: 'birth record',
  axis: (start: string, end: string) => `Shared date axis: ${start} to ${end}`,
  noEvents: 'No timing events fall in this window.',
  /** Under a track: the convention it follows, where there is more than one in use (#677). */
  trackNotes: {
    profections:
      'A profected year runs from one birthday to the next, at the local time of birth; its months are twelve equal parts of that year.',
  } as Partial<Record<string, string>>,
  range: (start: string, end: string) => `${start} to ${end}`,
  releasing: (lot: string, sign: string, ruler: string) => `From ${lot}: ${sign}, ruled by ${ruler}`,
  releasingLevel2: (lot: string, sign: string, ruler: string) => `From ${lot}, L2: ${sign}, ruled by ${ruler}`,
  /** The lots keep their English names in Dutch, like the Part of Fortune elsewhere (no vetted Dutch terms). */
  lots: { fortune: 'Fortune', spirit: 'Spirit' },
  loosingOfBond: 'loosing of the bond',
  profection: (sign: string, house: string) => `${sign}, ${house} house`,
  aspect: (from: string, aspect: string, to: string) => `${from} ${aspect} ${to}`,
  stationRetrograde: (body: string) => `${body} turns retrograde`,
  stationDirect: (body: string) => `${body} turns direct`,
  returns: {
    'solar-return': 'Solar return',
    demibirthday: 'Demibirthday',
    'progressed-lunar-return': 'Progressed lunar return',
    'lunar-return': 'Lunar return',
  },
  /** Names the shared body catalogue does not have: firdaria's nodes and the two lower angles of a primary direction. */
  extraNames: { northNode: 'North Node', southNode: 'South Node', dsc: 'Descendant', ic: 'Imum Coeli' },
  tracks: {
    'zodiacal-releasing': 'Zodiacal releasing',
    firdaria: 'Firdaria',
    profections: 'Profections',
    'primary-directions': 'Primary directions',
    'secondary-progression': 'Secondary progressions',
    'solar-arc': 'Solar arc directions',
    transit: 'Transits',
    'periodic-transit': 'Forecast events',
  },
};

const nl = {
  fallback: 'Tijdlijn',
  heading: (name) => `Tijdlijn van ${name}`,
  hint: 'Eén gedeelde datumas voor zodiacale releasing, firdaria, profecties, progressies, directies, transits en voorspellingsevenementen. Periodebalken zijn actief binnen hun bereik; contacten markeren een exacte of gekozen datum.',
  source:
    'Bronnen: Vettius Valens, Anthology IV (zodiacale releasing); al-Qabisi, Introduction to Traditional Astrology, VII.3 (firdaria-perioden).',
  asOfLabel: 'Middendatum',
  calculating: 'Tijdlijn wordt opgebouwd…',
  error: (message) => `De tijdlijn kon niet worden opgebouwd: ${message}`,
  notComplete: (name) =>
    `${name} heeft volledige geboortegegevens nodig voordat tijdtechnieken kunnen worden berekend.`,
  personPageLink: 'geboortegegevens',
  axis: (start, end) => `Gedeelde datumas: ${start} tot ${end}`,
  noEvents: 'Er vallen geen tijdgebeurtenissen binnen dit venster.',
  trackNotes: {
    profections:
      'Een geprofecteerd jaar loopt van verjaardag tot verjaardag, op de lokale geboortetijd; de maanden zijn twaalf gelijke delen van dat jaar.',
  },
  range: (start, end) => `${start} tot ${end}`,
  releasing: (lot, sign, ruler) => `Vanaf ${lot}: ${sign}, met als heerser ${ruler}`,
  releasingLevel2: (lot, sign, ruler) => `Vanaf ${lot}, L2: ${sign}, met als heerser ${ruler}`,
  lots: { fortune: 'Fortune', spirit: 'Spirit' },
  loosingOfBond: 'loosing of the bond',
  profection: (sign, house) => `${sign}, ${house} huis`,
  aspect: (from, aspect, to) => `${from} ${aspect} ${to}`,
  stationRetrograde: (body) => `${body} wordt retrograde`,
  stationDirect: (body) => `${body} wordt direct`,
  returns: {
    'solar-return': 'Solar return',
    demibirthday: 'Demibirthday',
    'progressed-lunar-return': 'Progressed lunar return',
    'lunar-return': 'Lunar return',
  },
  extraNames: {
    northNode: 'Noordelijke Maansknoop',
    southNode: 'Zuidelijke Maansknoop',
    dsc: 'Descendant',
    ic: 'Imum Coeli',
  },
  tracks: {
    'zodiacal-releasing': 'Zodiacale releasing',
    firdaria: 'Firdaria',
    profections: 'Profecties',
    'primary-directions': 'Primaire directies',
    'secondary-progression': 'Secundaire progressies',
    'solar-arc': 'Solar arc-directies',
    transit: 'Transits',
    'periodic-transit': 'Voorspellingsevenementen',
  },
} satisfies typeof en;

export const timingTimelineViewMessages = { en, nl };
