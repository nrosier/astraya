/**
 * Message catalogue for `Overview.tsx` (#506/#509): the per-person Overview screen,
 * `docs/UI-UX_GUIDELINES.md` §2's "task launchpad, not a generic dashboard".
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
  basisHeading: 'Calculation basis',
  basisLine: (zodiac: string, rulership: string) => `${zodiac} · ${rulership} rulers`,
  tropical: 'Tropical',
  sidereal: 'Sidereal',
  nextActionsHeading: 'Next',
  editBirthRecord: 'Edit birth record',
  openChart: 'Open natal chart',
  openInterpretation: 'Open interpretation',
  viewTransits: 'View transits',
  completeBirthRecordFirst: 'Complete the birth record to unlock the chart and its other screens.',
};

const nl: typeof en = {
  heading: (name: string) => `Overzicht · ${name}`,
  personFallback: 'Overzicht',
  basisHeading: 'Berekeningsbasis',
  basisLine: (zodiac: string, rulership: string) => `${zodiac} · ${rulership} heersers`,
  tropical: 'Tropisch',
  sidereal: 'Siderisch',
  nextActionsHeading: 'Vervolgens',
  editBirthRecord: 'Geboortegegevens bewerken',
  openChart: 'Horoscoop openen',
  openInterpretation: 'Interpretatie openen',
  viewTransits: 'Transits bekijken',
  completeBirthRecordFirst: 'Vul de geboortegegevens aan om de horoscoop en de andere schermen te ontgrendelen.',
};

export const overviewMessages = { en, nl };
