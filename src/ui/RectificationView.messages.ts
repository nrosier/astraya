/** Message catalogue for `RectificationView.tsx` (#408). */
/**
 * @module RectificationView.messages
 * @purpose English/Dutch message catalogue for the birth-time rectification screen.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `RectificationView.tsx`.
 * @exports rectificationViewMessages
 */
const en = {
  heading: 'Birth-Time Rectification',
  hint: 'For a birth date and place with an uncertain time: test candidate times against dated life events. For each candidate the Ascendant and Midheaven are worked out, and the events are checked for solar-arc and slow-body transit contacts to them. The scoring method’s citation is pending.',
  caveat:
    'This narrows the choice; it does not prove a time. The score adds up coincidences, some of which are chance, so look at how much better the top times score than the average (the “lift”) — a time that explains the events no better than average has explained nothing. Give it several well-dated events that mattered.',
  searchHeading: 'Birth details',
  panelHeading: 'Time window and events',
  personLabel: 'Fill in from a person',
  personNone: 'None — enter the details below',
  birthDateLabel: 'Birth date',
  latitudeLabel: 'Latitude',
  longitudeLabel: 'Longitude',
  fromTimeLabel: 'Earliest possible time',
  toTimeLabel: 'Latest possible time',
  stepLabel: 'Test every',
  stepOption: (minutes: number) => (minutes === 1 ? '1 minute' : `${String(minutes)} minutes`),
  eventsLegend: 'Life events',
  eventsHint:
    'Dates of events that changed things — a marriage, a move, a career change, a loss. The date only is needed.',
  eventDateLabel: (n: number) => `Event ${String(n)} date`,
  eventLabelLabel: (n: number) => `Event ${String(n)} description`,
  eventLabelPlaceholder: 'e.g. moved abroad',
  eventsSavedHint: 'Changes to these events are saved on the chosen person.',
  eventsUnreadableDetail:
    'Events you enter here are used for this search only. The saved list is left as it is and is not overwritten.',
  eventsSaveError: (message: string) => `The events could not be saved on the person. ${message}`,
  addEvent: 'Add an event',
  removeEvent: (n: number) => `Remove event ${String(n)}`,
  findButton: 'Test candidate times',
  testing: 'Testing…',
  fieldErrors: {
    birthDate: 'Enter a real birth date.',
    fromTime: 'Enter the earliest time as HH:MM.',
    toTime: 'Enter the latest time as HH:MM.',
    order: 'The latest time must not be before the earliest.',
    latitude: 'Enter a latitude in decimal degrees, from -90 to 90.',
    longitude: 'Enter a longitude in decimal degrees, from -180 to 180.',
    events: 'Add at least one event with a date.',
    eventDate: (n: number) => `Event ${String(n)} needs a real date.`,
    eventBeforeBirth: (n: number) => `Event ${String(n)} must be after the birth date.`,
  },
  error: (message: string) => `The search could not be completed. ${message}`,
  summary: (tested: number, shown: number) =>
    `${String(tested)} candidate times tested; the best ${String(shown)} are shown, best first.`,
  tableCaption: 'Candidate birth times',
  timeColumn: 'Local time',
  ascendantColumn: 'Ascendant',
  midheavenColumn: 'Midheaven',
  scoreColumn: 'Score',
  liftColumn: 'Lift',
  contactsColumn: 'Contacts',
  detailsHeading: 'Evidence for each time',
  detailsSummary: (time: string, score: string) => `${time} — score ${score}`,
  noContacts: 'No contacts within the orb for any event.',
  contactCount: (count: number) => `${String(count)} ${count === 1 ? 'contact' : 'contacts'}`,
  showDetails: 'Show contacts',
  hideDetails: 'Hide contacts',
  forEvent: (n: number, label: string) => `Event ${String(n)}${label === '' ? '' : ` (${label})`}`,
  solarArcContact: (moving: string, aspect: string, natal: string, orb: string) =>
    `Solar arc: directed ${moving} ${aspect} natal ${natal} (${orb})`,
  transitContact: (moving: string, aspect: string, natal: string, orb: string) =>
    `Transit: ${moving} ${aspect} natal ${natal} (${orb})`,
  includeEvent: (n: number) => `Include event ${String(n)}`,
  includedCount: (included: number, total: number) =>
    `${String(included)} of ${String(total)} events included. The scores update when you include or exclude an event.`,
  noEventsIncluded: 'No event is included. Include at least one event to score the candidate times.',
  verdictColumn: 'Reading',
  spike: 'Above chance',
  noBetterThanChance: 'Explains the events no better than chance',
  methodHeading: 'Method and its limits',
  methodBody:
    'Each candidate time gives an Ascendant, Midheaven, Descendant and Imum Coeli. For every included event, a score is added for each Solar Arc contact (a directed angle on a natal planet, or a directed planet on a natal angle) and each transit contact (Jupiter, Saturn, Uranus, Neptune, Pluto or the mean lunar node on a natal angle) that is a conjunction, square or opposition. The orb is the existing transit orb of the body involved. All contact types count equally, and each contact counts in full when exact and less the looser it is, down to nothing at the edge of its orb. The lift is a candidate’s score divided by the average score of all candidates tested; only a lift above 1.0 is marked as above chance.',
  methodLimits:
    'Limits: the result is an estimate, not a measurement. Some contacts are chance, and a wide window or few events leaves the field flat. Huber’s rectification article supports rectifying against dated events accurate to within a month, with at least five dates for a margin of up to 30 minutes and at least ten for up to two hours. It does not support this Solar Arc and transit scoring, which is a convention of this tool.',
  citationPending: 'Scoring method: citation pending',
  timesHeading: 'Reported and rectified time',
  reportedTimeLabel: 'Reported time',
  reportedTimeNone: 'Choose a person to see the reported time.',
  rectifiedTimeLabel: 'Rectified time (estimate)',
  rectifiedTimeNone: 'None saved',
  rectifiedTimeValue: (time: string) => `${time} (estimate)`,
  rectifiedSourceLabel: 'Source note',
  reportedNeverChanged:
    'The reported time is never changed. A rectified time is stored beside it, with its source note.',
  promoteButton: 'Promote to rectified time',
  promoteBlocked: {
    citation: 'Methodology citation pending',
    noPerson: 'Choose a stored person to save a rectified time on.',
    noSpike: 'No candidate explains the events better than chance.',
  },
  promoteReasonPrefix: 'Unavailable:',
  rectificationLink: 'Birth-time rectification',
  unnamedPerson: 'Unnamed',
};

const nl: typeof en = {
  heading: 'Geboortetijd-rectificatie',
  hint: 'Voor een geboortedatum en -plaats met een onzekere tijd: toets kandidaat-tijden aan gedateerde levensgebeurtenissen. Voor elke kandidaat worden de Ascendant en Midheaven berekend en worden de gebeurtenissen gecontroleerd op solar-arc- en transitcontacten van trage lichamen ermee. De bronvermelding van de scoremethode volgt.',
  caveat:
    'Dit beperkt de keuze; het bewijst geen tijd. De score telt toevalligheden op, waarvan sommige puur toeval zijn, dus kijk hoeveel beter de beste tijden scoren dan het gemiddelde (de “lift”) — een tijd die de gebeurtenissen niet beter verklaart dan gemiddeld, verklaart niets. Geef meerdere goed gedateerde gebeurtenissen die ertoe deden.',
  searchHeading: 'Geboortegegevens',
  panelHeading: 'Tijdvenster en gebeurtenissen',
  personLabel: 'Vul in vanuit een persoon',
  personNone: 'Geen — vul de gegevens hieronder in',
  birthDateLabel: 'Geboortedatum',
  latitudeLabel: 'Breedtegraad',
  longitudeLabel: 'Lengtegraad',
  fromTimeLabel: 'Vroegst mogelijke tijd',
  toTimeLabel: 'Laatst mogelijke tijd',
  stepLabel: 'Toets elke',
  stepOption: (minutes: number) => (minutes === 1 ? '1 minuut' : `${String(minutes)} minuten`),
  eventsLegend: 'Levensgebeurtenissen',
  eventsHint:
    'Data van gebeurtenissen die iets veranderden — een huwelijk, een verhuizing, een carrièrewissel, een verlies. Alleen de datum is nodig.',
  eventDateLabel: (n: number) => `Datum van gebeurtenis ${String(n)}`,
  eventLabelLabel: (n: number) => `Omschrijving van gebeurtenis ${String(n)}`,
  eventLabelPlaceholder: 'bijv. naar het buitenland verhuisd',
  eventsSavedHint: 'Wijzigingen in deze gebeurtenissen worden bij de gekozen persoon bewaard.',
  eventsUnreadableDetail:
    'Gebeurtenissen die u hier invoert gelden alleen voor deze zoekopdracht. De bewaarde lijst blijft zoals ze is en wordt niet overschreven.',
  eventsSaveError: (message: string) => `De gebeurtenissen konden niet bij de persoon worden bewaard. ${message}`,
  addEvent: 'Gebeurtenis toevoegen',
  removeEvent: (n: number) => `Gebeurtenis ${String(n)} verwijderen`,
  findButton: 'Kandidaat-tijden toetsen',
  testing: 'Bezig met toetsen…',
  fieldErrors: {
    birthDate: 'Voer een bestaande geboortedatum in.',
    fromTime: 'Voer de vroegste tijd in als UU:MM.',
    toTime: 'Voer de laatste tijd in als UU:MM.',
    order: 'De laatste tijd mag niet vóór de vroegste liggen.',
    latitude: 'Voer een breedtegraad in decimale graden in, van -90 tot 90.',
    longitude: 'Voer een lengtegraad in decimale graden in, van -180 tot 180.',
    events: 'Voeg minstens één gebeurtenis met een datum toe.',
    eventDate: (n: number) => `Gebeurtenis ${String(n)} heeft een bestaande datum nodig.`,
    eventBeforeBirth: (n: number) => `Gebeurtenis ${String(n)} moet na de geboortedatum liggen.`,
  },
  error: (message: string) => `De zoekopdracht kon niet worden voltooid. ${message}`,
  summary: (tested: number, shown: number) =>
    `${String(tested)} kandidaat-tijden getoetst; de beste ${String(shown)} staan hieronder, beste eerst.`,
  tableCaption: 'Kandidaat-geboortetijden',
  timeColumn: 'Lokale tijd',
  ascendantColumn: 'Ascendant',
  midheavenColumn: 'Midheaven',
  scoreColumn: 'Score',
  liftColumn: 'Lift',
  contactsColumn: 'Contacten',
  detailsHeading: 'Bewijs per tijd',
  detailsSummary: (time: string, score: string) => `${time} — score ${score}`,
  noContacts: 'Geen contacten binnen de orb voor welke gebeurtenis dan ook.',
  contactCount: (count: number) => `${String(count)} ${count === 1 ? 'contact' : 'contacten'}`,
  showDetails: 'Toon contacten',
  hideDetails: 'Verberg contacten',
  forEvent: (n: number, label: string) => `Gebeurtenis ${String(n)}${label === '' ? '' : ` (${label})`}`,
  solarArcContact: (moving: string, aspect: string, natal: string, orb: string) =>
    `Solar arc: gedirigeerde ${moving} ${aspect} natale ${natal} (${orb})`,
  transitContact: (moving: string, aspect: string, natal: string, orb: string) =>
    `Transit: ${moving} ${aspect} natale ${natal} (${orb})`,
  includeEvent: (n: number) => `Gebeurtenis ${String(n)} meenemen`,
  includedCount: (included: number, total: number) =>
    `${String(included)} van ${String(total)} gebeurtenissen meegenomen. De scores worden bijgewerkt zodra u een gebeurtenis meeneemt of uitsluit.`,
  noEventsIncluded:
    'Geen gebeurtenis is meegenomen. Neem minstens één gebeurtenis mee om de kandidaat-tijden te scoren.',
  verdictColumn: 'Beoordeling',
  spike: 'Boven toeval',
  noBetterThanChance: 'Verklaart de gebeurtenissen niet beter dan toeval',
  methodHeading: 'Methode en de grenzen ervan',
  methodBody:
    'Elke kandidaat-tijd geeft een Ascendant, Midheaven, Descendant en Imum Coeli. Voor elke meegenomen gebeurtenis komt er een score bij voor elk solar-arc-contact (een gedirigeerde hoek op een natale planeet, of een gedirigeerde planeet op een natale hoek) en elk transitcontact (Jupiter, Saturnus, Uranus, Neptunus, Pluto of de gemiddelde maansknoop op een natale hoek) dat een conjunctie, kwadraat of oppositie is. De orb is de bestaande transitorb van het betrokken lichaam. Alle soorten contact tellen even zwaar, en elk contact telt volledig als het exact is en minder naarmate het ruimer is, tot niets aan de rand van zijn orb. De lift is de score van een kandidaat gedeeld door de gemiddelde score van alle getoetste kandidaten; alleen een lift boven 1,0 wordt als boven toeval gemarkeerd.',
  methodLimits:
    'Grenzen: het resultaat is een schatting, geen meting. Sommige contacten zijn toeval, en een breed venster of weinig gebeurtenissen laat het veld vlak. Hubers rectificatie-artikel ondersteunt rectificatie aan de hand van gedateerde gebeurtenissen die op een maand nauwkeurig zijn, met minstens vijf data voor een marge tot 30 minuten en minstens tien tot twee uur. Het ondersteunt deze solar-arc- en transitscore niet; die is een afspraak van deze tool.',
  citationPending: 'Scoremethode: bronvermelding volgt',
  timesHeading: 'Opgegeven en gerectificeerde tijd',
  reportedTimeLabel: 'Opgegeven tijd',
  reportedTimeNone: 'Kies een persoon om de opgegeven tijd te zien.',
  rectifiedTimeLabel: 'Gerectificeerde tijd (schatting)',
  rectifiedTimeNone: 'Geen bewaard',
  rectifiedTimeValue: (time: string) => `${time} (schatting)`,
  rectifiedSourceLabel: 'Bronnotitie',
  reportedNeverChanged:
    'De opgegeven tijd wordt nooit gewijzigd. Een gerectificeerde tijd wordt ernaast bewaard, met zijn bronnotitie.',
  promoteButton: 'Bevorderen tot gerectificeerde tijd',
  promoteBlocked: {
    citation: 'Methodologische bronvermelding volgt',
    noPerson: 'Kies een bewaarde persoon om een gerectificeerde tijd bij te bewaren.',
    noSpike: 'Geen enkele kandidaat verklaart de gebeurtenissen beter dan toeval.',
  },
  promoteReasonPrefix: 'Niet beschikbaar:',
  rectificationLink: 'Geboortetijd-rectificatie',
  unnamedPerson: 'Naamloos',
};

export const rectificationViewMessages = { en, nl };
