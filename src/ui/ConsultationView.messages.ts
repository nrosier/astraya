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
  basisLine: (zodiac: string, rulership: string) => `${zodiac} · ${rulership} rulers`,
  tropical: 'Tropical',
  sidereal: 'Sidereal',

  viewAllTransits: 'View all transits',
  noShownTransits: 'No transits currently pass this filter.',
  rankingConvention: 'The order is Astraya’s own ranking convention, not a published rule.',
  fastToday: (contacts: string) => `Today: ${contacts}`,
  noFastToday: 'Today: no fast contacts within orb.',
  listSeparator: '; ',
  anglesHeading: 'Transits to the Ascendant and Midheaven',
  anglesNeedBirthTime: 'These need a known birth time.',
  noAngleTransits: 'No slow planet is within 3.5° of the Ascendant or Midheaven.',
  angleTransit: (body: string, aspect: string, angle: string, orb: string, motion: string) =>
    `${body} ${aspect} ${angle} · ${orb} · ${motion}`,
  exactPrefix: 'exact',
  noExactDate: 'no exact pass within three years',
  // Layout (#669): summary first, then grouped sections.
  topTransit: 'Top transit',
  profectionYear: 'Profection year',
  profectionValue: (sign: string, house: string, lords: string, until: string) =>
    `${sign}, ${house} house · lord ${lords} · until ${until}`,
  firdaria: 'Firdaria',
  firdariaValue: (ruler: string, until: string) => `${ruler} · until ${until}`,
  progressedMoon: 'Progressed Moon',
  progressedMoonValue: (sign: string, house: string | undefined, phase: string) =>
    house === undefined ? `${sign} · ${phase}` : `${sign}, ${house} house · ${phase}`,
  solarReturns: 'Solar returns',
  solarReturnsValue: (last: string, next: string) => `last ${last}, next ${next}`,
  thisYearHeading: 'This year',
  moreTiming: 'More timing detail',
  moreTimingSummary: 'Zodiacal releasing level 2 and the month profection',
  show: 'Show',
  hide: 'Hide',
  majorTransitsHeading: 'Major transits now',
  transitRow: (body: string, aspect: string, natal: string, orb: string, motion: string) =>
    `${body} ${aspect} ${natal} · ${orb} · ${motion}`,
  directionsHeading: 'Directions',
  noDirections: 'No solar arc or primary direction is active now.',
  moreDirections: (count: number) => `${String(count)} more active directions`,
  conditionLine: (body: string, conditions: string) => `${body}: ${conditions}`,
  retrogradeAtBirth: (bodies: string) => `Retrograde at birth: ${bodies}`,
  chartShape: 'Chart shape',
  moreChart: 'More chart detail',
  moreChartSummary: 'Chart shape and planets retrograde at birth',
  conditionSeparator: ', ',
  rulerSeparator: ' and ',

  asOf: (time: string) => `As of ${time}, your local time`,
  refreshNow: 'Now',
  openTimingTimeline: 'Open timing timeline',

  highlightsHeading: 'Chart highlights',
  openPatternsAndCondition: 'Open Patterns & condition',
  shapeCannotBeWorkedOut: 'The chart shape could not be worked out.',
  noNotableConditions:
    'No planet in the birth chart is in its own sign or exaltation, cazimi, combust, besieged or retrograde.',
  dignityCaption: (rulership: string) => `Own sign or exaltation, by your rulership: ${rulership}`,
  conditionCaption: 'Condition, by traditional rules (the seven classical planets)',
  dignityNote: (body: string, dignity: string) => `${body}: ${dignity}`,
  rulerDignity: 'ruler',
  exaltedDignity: 'exalted',
  besiegedCondition: 'besieged',
  besiegedEasedCondition: (rescuers: string) => `besieged (eased by ${rescuers})`,
  cazimiCondition: 'cazimi',
  combustCondition: 'combust',

  openInterpretation: 'Open interpretation',
  buildPdf: 'Build PDF',
};

const nl: typeof en = {
  heading: (name: string) => `Consultatie · ${name}`,
  fallback: 'Consultatie',
  notComplete: (name: string) => `${name} heeft volledige geboortegegevens nodig voor een consultdashboard.`,
  personPageLink: 'geboortegegevens',
  calculating: 'Berekenen…',
  error: (message: string) => `Berekening mislukt: ${message}`,
  basisLine: (zodiac: string, rulership: string) => `${zodiac} · ${rulership} heersers`,
  tropical: 'Tropisch',
  sidereal: 'Siderisch',

  viewAllTransits: 'Alle transits bekijken',
  noShownTransits: 'Er voldoen momenteel geen transits aan dit filter.',
  rankingConvention: 'De volgorde is Astraya’s eigen rangschikking, geen gepubliceerde regel.',
  fastToday: (contacts: string) => `Vandaag: ${contacts}`,
  noFastToday: 'Vandaag: geen snelle contacten binnen orb.',
  listSeparator: '; ',
  anglesHeading: 'Transits naar de Ascendant en het Hemelmidden',
  anglesNeedBirthTime: 'Hiervoor is een bekende geboortetijd nodig.',
  noAngleTransits: 'Geen trage planeet staat binnen 3,5° van de Ascendant of het Hemelmidden.',
  angleTransit: (body: string, aspect: string, angle: string, orb: string, motion: string) =>
    `${body} ${aspect} ${angle} · ${orb} · ${motion}`,
  exactPrefix: 'exact op',
  noExactDate: 'geen exacte passage binnen drie jaar',
  topTransit: 'Belangrijkste transit',
  profectionYear: 'Profectiejaar',
  profectionValue: (sign: string, house: string, lords: string, until: string) =>
    `${sign}, ${house} huis · heer ${lords} · tot ${until}`,
  firdaria: 'Firdaria',
  firdariaValue: (ruler: string, until: string) => `${ruler} · tot ${until}`,
  progressedMoon: 'Geprogresseerde Maan',
  progressedMoonValue: (sign: string, house: string | undefined, phase: string) =>
    house === undefined ? `${sign} · ${phase}` : `${sign}, ${house} huis · ${phase}`,
  solarReturns: 'Solar returns',
  solarReturnsValue: (last: string, next: string) => `vorige ${last}, volgende ${next}`,
  thisYearHeading: 'Dit jaar',
  moreTiming: 'Meer tijdsdetail',
  moreTimingSummary: 'Zodiacale releasing niveau 2 en de maandprofectie',
  show: 'Tonen',
  hide: 'Verbergen',
  majorTransitsHeading: 'Belangrijke transits nu',
  transitRow: (body: string, aspect: string, natal: string, orb: string, motion: string) =>
    `${body} ${aspect} ${natal} · ${orb} · ${motion}`,
  directionsHeading: 'Directies',
  noDirections: 'Er is nu geen solar arc of primaire directie actief.',
  moreDirections: (count: number) => `nog ${String(count)} actieve directies`,
  conditionLine: (body: string, conditions: string) => `${body}: ${conditions}`,
  retrogradeAtBirth: (bodies: string) => `Retrograde bij de geboorte: ${bodies}`,
  chartShape: 'Horoscoopvorm',
  moreChart: 'Meer horoscoopdetail',
  moreChartSummary: 'Horoscoopvorm en planeten die bij de geboorte retrograde stonden',
  conditionSeparator: ', ',
  rulerSeparator: ' en ',

  asOf: (time: string) => `Per ${time}, je lokale tijd`,
  refreshNow: 'Nu',
  openTimingTimeline: 'Tijdlijn openen',

  highlightsHeading: 'Horoscoophoogtepunten',
  openPatternsAndCondition: 'Patronen & conditie openen',
  shapeCannotBeWorkedOut: 'De horoscoopvorm kon niet worden bepaald.',
  noNotableConditions:
    'Geen planeet in de geboortehoroscoop staat in eigen teken of verhoging, of is cazimi, combust, belegerd of retrograde.',
  dignityCaption: (rulership: string) => `Eigen teken of verhoging, volgens je heerserschap: ${rulership}`,
  conditionCaption: 'Conditie, volgens traditionele regels (de zeven klassieke planeten)',
  dignityNote: (body: string, dignity: string) => `${body}: ${dignity}`,
  rulerDignity: 'heerser',
  exaltedDignity: 'verheven',
  besiegedCondition: 'belegerd',
  besiegedEasedCondition: (rescuers: string) => `belegerd (verlicht door ${rescuers})`,
  cazimiCondition: 'cazimi',
  combustCondition: 'combust',

  openInterpretation: 'Interpretatie openen',
  buildPdf: 'PDF samenstellen',
};

export const consultationViewMessages = { en, nl };
