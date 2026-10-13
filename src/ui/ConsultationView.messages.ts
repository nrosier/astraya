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

  timingHeading: 'Active timing techniques',
  asOfToday: 'As of today',
  openTimingTimeline: 'Open timing timeline',

  highlightsHeading: 'Chart highlights',
  openPatternsAndCondition: 'Open Patterns & condition',
  shapeCannotBeWorkedOut: 'The chart shape could not be worked out.',
  noNotableConditions: 'No angular/luminary dignities or notable conditions stand out today.',
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

  timingHeading: 'Actieve tijdtechnieken',
  asOfToday: 'Vandaag',
  openTimingTimeline: 'Tijdlijn openen',

  highlightsHeading: 'Horoscoophoogtepunten',
  openPatternsAndCondition: 'Patronen & conditie openen',
  shapeCannotBeWorkedOut: 'De horoscoopvorm kon niet worden bepaald.',
  noNotableConditions: 'Geen opvallende hoekwaardigheden of condities vandaag.',
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
