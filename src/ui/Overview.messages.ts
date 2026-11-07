/**
 * Message catalogue for `Overview.tsx` (#506/#509, #1173): the per-person Overview screen,
 * `docs/ui/UI-UX_GUIDELINES.md` §2's "task launchpad, not a generic dashboard".
 */
/**
 * @module ui/Overview.messages
 * @purpose English/Dutch i18n strings for the Overview screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports overviewMessages
 */
const en = {
  heading: (name: string) => `Overview · ${name}`,
  personFallback: 'Overview',
  nextActionsHeading: 'Next',
  editBirthRecord: 'Edit birth record',
  openChart: 'Open natal chart',
  openInterpretation: 'Open interpretation',
  viewTransits: 'View transits',
  compareWithAnother: 'Compare with another person',
  completeBirthRecordFirst: 'Complete the birth record to unlock the chart and its other screens.',
  nowLine: (sign: string, house: string, lord: string) =>
    `Now: profected year in ${sign}, ${house} house, lord ${lord}. See Consultation.`,
  healthHeading: 'Birth data',
  healthClear: 'Nothing is missing or uncertain in this birth record.',
  health: {
    date: 'The birth date is missing.',
    place: 'The birth place is missing.',
    placeName: 'The place has coordinates but no name.',
    timeUnknown: 'The birth time is unknown, so houses and angles are not shown.',
    timeApproximate: 'The birth time is only approximate.',
    timeRemembered: 'The birth time is remembered, not recorded.',
    timezone: 'The timezone offset for this date and place is uncertain.',
  },
  healthFix: { date: 'Enter the date', accuracy: 'Change how the time is known', place: 'Check the place' },
  resumeHeading: 'Continue where you left off',
  resumeChart: 'The chart you last opened',
  resumeBirthNotes: 'The notes on the birth record',
  resumeConsultationNotes: (count: number) =>
    `${String(count)} consultation ${count === 1 ? 'note' : 'notes'} in Consultation`,
};

const nl: typeof en = {
  heading: (name: string) => `Overzicht · ${name}`,
  personFallback: 'Overzicht',
  nextActionsHeading: 'Vervolgens',
  editBirthRecord: 'Geboortegegevens bewerken',
  openChart: 'Horoscoop openen',
  openInterpretation: 'Interpretatie openen',
  viewTransits: 'Transits bekijken',
  compareWithAnother: 'Vergelijken met een andere persoon',
  completeBirthRecordFirst: 'Vul de geboortegegevens aan om de horoscoop en de andere schermen te ontgrendelen.',
  nowLine: (sign: string, house: string, lord: string) =>
    `Nu: profectiejaar in ${sign}, ${house} huis, heer ${lord}. Zie Consultatie.`,
  healthHeading: 'Geboortegegevens',
  healthClear: 'In deze geboortegegevens ontbreekt niets en niets is onzeker.',
  health: {
    date: 'De geboortedatum ontbreekt.',
    place: 'De geboorteplaats ontbreekt.',
    placeName: 'De plaats heeft coördinaten maar geen naam.',
    timeUnknown: 'De geboortetijd is onbekend, dus huizen en assen worden niet getoond.',
    timeApproximate: 'De geboortetijd is slechts bij benadering bekend.',
    timeRemembered: 'De geboortetijd is onthouden, niet vastgelegd.',
    timezone: 'De tijdzoneverschuiving voor deze datum en plaats is onzeker.',
  },
  healthFix: { date: 'Voer de datum in', accuracy: 'Wijzig hoe de tijd bekend is', place: 'Controleer de plaats' },
  resumeHeading: 'Ga verder waar je gebleven was',
  resumeChart: 'De horoscoop die je het laatst opende',
  resumeBirthNotes: 'De notities bij de geboortegegevens',
  resumeConsultationNotes: (count: number) =>
    `${String(count)} ${count === 1 ? 'consultatienotitie' : 'consultatienotities'} in Consultatie`,
};

export const overviewMessages = { en, nl };
