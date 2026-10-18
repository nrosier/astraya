/**
 * Message catalogue for `ConsultationView.tsx` (#563): the consultation dashboard, second in the
 * person workspace right after Overview.
 */
/**
 * @module ui/ConsultationView.messages
 * @purpose English/Dutch i18n strings for the consultation dashboard.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports consultationViewMessages
 */
const en = {
  heading: (name: string) => `Consultation · ${name}`,
  fallback: 'Consultation',
  notComplete: (name: string) => `${name} needs a complete birth record before a consultation dashboard can show.`,
  personPageLink: 'birth record',
  calculating: 'Calculating…',
  error: (message: string) => `Could not calculate: ${message}`,
  basisHeading: 'Calculation basis',
  basisLine: (zodiac: string, rulership: string) => `${zodiac} · ${rulership} rulers`,
  tropical: 'Tropical',
  sidereal: 'Sidereal',

  transitsHeading: 'Current transits',
  viewAllTransits: 'View all transits',
  noShownTransits: 'No transits currently pass this filter.',
  rankingConvention: 'The order is Astraya’s own ranking convention, not a published rule.',
  fastToday: (contacts: string) => `Today: ${contacts}`,
  noFastToday: 'Today: no fast contacts within orb.',
  listSeparator: '; ',

  timingHeading: 'Active timing techniques',
  asOf: (time: string) => `As of ${time}, your local time`,
  refreshNow: 'Now',
  openTimingTimeline: 'Open timing timeline',

  highlightsHeading: 'Chart highlights',
  openPatternsAndCondition: 'Open Patterns & condition',
  shapeCannotBeWorkedOut: 'The chart shape could not be worked out.',
  noNotableConditions:
    'No planet in the birth chart is in its own sign or exaltation, cazimi, combust, besieged or retrograde.',
  dignityNote: (body: string, dignity: string) => `${body}: ${dignity}`,
  rulerDignity: 'ruler',
  exaltedDignity: 'exalted',
  conditionNote: (body: string, condition: string) => `${body}: ${condition}`,
  retrogradeCondition: 'retrograde',
  besiegedCondition: 'besieged',
  cazimiCondition: 'cazimi',
  combustCondition: 'combust',

  nextHeading: 'Next',
  openNatalChart: 'Open natal chart',
  openInterpretation: 'Open interpretation',
  buildPdf: 'Build PDF',
};

const nl: typeof en = {
  heading: (name: string) => `Consult · ${name}`,
  fallback: 'Consult',
  notComplete: (name: string) => `${name} heeft volledige geboortegegevens nodig voor een consultdashboard.`,
  personPageLink: 'geboortegegevens',
  calculating: 'Berekenen…',
  error: (message: string) => `Berekening mislukt: ${message}`,
  basisHeading: 'Berekeningsbasis',
  basisLine: (zodiac: string, rulership: string) => `${zodiac} · ${rulership} heersers`,
  tropical: 'Tropisch',
  sidereal: 'Siderisch',

  transitsHeading: 'Actuele transits',
  viewAllTransits: 'Alle transits bekijken',
  noShownTransits: 'Er voldoen momenteel geen transits aan dit filter.',
  rankingConvention: 'De volgorde is Astraya’s eigen rangschikking, geen gepubliceerde regel.',
  fastToday: (contacts: string) => `Vandaag: ${contacts}`,
  noFastToday: 'Vandaag: geen snelle contacten binnen orb.',
  listSeparator: '; ',

  timingHeading: 'Actieve tijdtechnieken',
  asOf: (time: string) => `Per ${time}, je lokale tijd`,
  refreshNow: 'Nu',
  openTimingTimeline: 'Tijdlijn openen',

  highlightsHeading: 'Horoscoophoogtepunten',
  openPatternsAndCondition: 'Patronen & conditie openen',
  shapeCannotBeWorkedOut: 'De horoscoopvorm kon niet worden bepaald.',
  noNotableConditions:
    'Geen planeet in de geboortehoroscoop staat in eigen teken of verhoging, of is cazimi, combust, belegerd of retrograde.',
  dignityNote: (body: string, dignity: string) => `${body}: ${dignity}`,
  rulerDignity: 'heerser',
  exaltedDignity: 'verheven',
  conditionNote: (body: string, condition: string) => `${body}: ${condition}`,
  retrogradeCondition: 'retrograde',
  besiegedCondition: 'belegerd',
  cazimiCondition: 'cazimi',
  combustCondition: 'combust',

  nextHeading: 'Vervolgens',
  openNatalChart: 'Horoscoop openen',
  openInterpretation: 'Interpretatie openen',
  buildPdf: 'PDF samenstellen',
};

export const consultationViewMessages = { en, nl };
