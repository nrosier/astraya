/** Message catalogue for `HoraryView.tsx` (#406). */
/**
 * @module HoraryView.messages
 * @purpose English/Dutch i18n strings for the Horary chart tool screen: the casting form and the traditional considerations-before-judgment list.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by HoraryView.tsx via `useMessages(horaryViewMessages)`; `nl` is typed as `typeof en`.
 * @exports horaryViewMessages
 */
const en = {
  heading: 'Horary Chart',
  hint: 'Cast a chart for the moment and place a question was asked, and check the traditional considerations before judgment. This tells you whether the chart is fit to be judged; it does not answer the question.',
  judgmentSource:
    'Judgment method: William Lilly, Christian Astrology, Book II, pp. 162–64 (the merchant’s-ship judgment).',
  dateLabel: 'Date the question was asked',
  timeLabel: 'Local time',
  dateTimeCardHeading: 'Date and time',
  locationCardHeading: 'Location',
  paramsCardHeading: 'Astrological parameters',
  setToNow: 'Set to now',
  geocodeNotice: (host: string) =>
    `Place search sends what you type to ${host}. You can also type the coordinates yourself.`,
  latitudeLabel: 'Latitude',
  longitudeLabel: 'Longitude',
  houseSystemLabel: 'House system',
  quesitedHouseLabel: 'House of the matter asked about',
  houseOption: (house: number) => `House ${String(house)}`,
  houseSystems: {
    R: 'Regiomontanus (the horary tradition’s)',
    P: 'Placidus',
    W: 'Whole sign',
  } as Record<string, string>,
  castButton: 'Cast chart',
  casting: 'Casting…',
  fieldErrors: {
    date: 'Enter a real date.',
    time: 'Enter a time such as 14:30.',
    latitude: 'Enter a latitude in decimal degrees, from -90 to 90.',
    longitude: 'Enter a longitude in decimal degrees, from -180 to 180.',
  },
  error: (message: string) => `The chart could not be cast. ${message}`,
  considerationsHeading: 'Considerations before judgment',
  radical: 'None of the considerations applies: the chart is fit to be judged.',
  notRadical: (count: number) =>
    `${String(count)} ${count === 1 ? 'consideration applies' : 'considerations apply'}. Traditionally the chart should then not be judged, or judged only with great care.`,
  applies: 'Applies',
  appliesSoftened: 'Applies, but weighs less',
  clear: 'Clear',
  radicalWithSoftened:
    'Only a softened consideration applies: Lilly says a void Moon matters less in Taurus, Cancer, Sagittarius and Pisces, so the chart is still fit to be judged.',
  judgmentHeading: 'Judgment toolkit',
  significators: (querent: string, quesited: string, house: number) =>
    `Querent: ${querent}. Quesited (house ${String(house)}): ${quesited}.`,
  perfection: {
    directAspect: 'The significators form a direct applying aspect.',
    translation: 'A third planet translates light between the significators.',
    collection: 'A third planet collects light from both significators.',
    prohibition: 'Another application perfects first and prohibits the matter.',
    frustration:
      'A third planet reaches a significator before the applying aspect can perfect: the matter is frustrated.',
    signChange: 'A significator changes sign before the applying aspect can perfect.',
    refranation: 'A significator stations before perfection and refrains from completing the aspect.',
    none: 'No perfection is found among the classical significators.',
  },
  /**
   * The practitioner note per key (#1960). The en text is the reason stored on a saved judgment, so it equals
   * `HORARY_PRACTITIONER_REASONS` (a test holds the two together). Not shown yet: the display awaits the owner's visual check.
   */
  practitioner: {
    'non-radical-chart': 'The chart is not radical. It is judged anyway; some practitioners would not judge it.',
    'late-ascendant-limit':
      "Lilly's late Ascendant (27, 28 or 29 degrees) is read here as from 27°00′; readings of the limit differ.",
    'house-by-exact-cusp':
      'A planet is in the house its degree falls in, by exact cusp, with no 5-degree rule; practitioners differ.',
    'perfection-orbs':
      "Perfection counts only the five Ptolemaic aspects within Lilly's moieties; orb tables differ by author.",
    'rule-order':
      'More than one rule applies. The code reports the first in its own fixed order, not an order from the texts.',
    'sign-change':
      'A significator changes sign before the aspect perfects; practitioners differ on whether it still counts.',
  },
  timing: (days: string) => `Estimated time to perfection: ${days} days.`,
  reception: {
    none: 'No essential reception is found.',
    oneWay: 'One-way essential reception is present.',
    mutual: 'Mutual essential reception is present.',
  },
  receptionAidsPerfection: 'Reception accompanies this applying perfection; it is testimony, not an automatic verdict.',
  considerations: {
    'ascendant-too-early': {
      label: 'Ascendant too early',
      explanation: 'The Ascendant is in the first 3° of its sign: the matter is not yet ripe to judge.',
    },
    'ascendant-too-late': {
      label: 'Ascendant too late',
      explanation: 'The Ascendant is in the last 3° of its sign: the matter is already decided.',
    },
    'moon-void-of-course': {
      label: 'Moon void of course',
      explanation:
        'The Moon makes no further major aspect before leaving its sign: nothing will come of the matter. In Taurus, Cancer, Sagittarius and Pisces Lilly says it matters less, because the Moon is not much impeded there.',
    },
    'moon-via-combusta': {
      label: 'Moon in the Via Combusta',
      explanation: 'The Moon is between 15° Libra and 15° Scorpio, the “burnt way”.',
    },
    'saturn-in-seventh': {
      label: 'Saturn in the seventh house',
      explanation: 'Saturn in the astrologer’s own house is said to impair the astrologer’s judgment.',
    },
  } as Record<string, { label: string; explanation: string }>,
  chartName: 'Horary chart',
  noHouses: 'No houses can be cast for this place and time, so the Ascendant and Saturn’s house cannot be checked.',
  horaryLink: 'Horary chart',
  questionCardHeading: 'Question',
  questionLabel: 'The question asked',
  questionHelp: (max: string) =>
    `Required to save the judgment. Up to ${max} characters. The question can hold personal data, so keep it generic.`,
  saveJudgment: 'Save judgment',
  saveNeedsQuestion: 'Enter the question above to save this judgment.',
  saved: (question: string) => `Saved “${question}”.`,
  questionTooLong: (max: string) => `The question is longer than ${max} characters.`,
  invalidJudgment: 'This judgment cannot be saved.',
  saveFailed: 'That did not save.',
  savedHeading: 'Saved judgments',
  savedScopeNote: 'Saved in your account. They sync when you are signed in and stay on this device when you are not.',
  savedUnavailable: 'Saved judgments are not available yet. The store is still opening.',
  savedEmpty: 'No saved judgments yet. Cast a chart, enter the question and save the judgment to reopen it later.',
  noQuestion: 'No question',
  savedOn: (when: string) => `Saved ${when}`,
  couldNotBeRead: 'Could not be read',
  open: 'Open',
  openLabel: (question: string) => `Open ${question}`,
  close: 'Close',
  openedHeading: 'Saved judgment',
  openedNote: 'Shown as it was saved. It is not recalculated.',
  openedQuestion: 'Question',
  openedMoment: 'Moment',
  openedPlace: 'Place',
  openedHouseSystem: 'House system',
  openedSummary: 'Judgment',
  openedConsiderations: 'Considerations',
  momentLine: (date: string, time: string, offset: string) => `${date}, ${time} (UTC${offset})`,
  delete: 'Delete',
  deleteLabel: (question: string) => `Delete ${question}`,
  deleted: (question: string) => `Deleted “${question}”.`,
  deleteHeading: 'Delete this judgment?',
  deleteConsequence: (question: string) =>
    `“${question}” and its saved judgment will be removed from your account and from every device that syncs with it.`,
  deleteCancel: 'Cancel',
  deleteConfirm: 'Delete judgment',
  deleteClose: 'Close without deleting',
};

const nl: typeof en = {
  heading: 'Horoscoop voor een vraag',
  hint: 'Maak een horoscoop voor het moment en de plaats waarop een vraag werd gesteld, en controleer de traditionele overwegingen vóór het oordeel. Dit zegt of de horoscoop geschikt is om te beoordelen; het beantwoordt de vraag niet.',
  judgmentSource:
    'Oordeelmethode: William Lilly, Christian Astrology, Boek II, pp. 162–64 (het oordeel over het koopvaardijschip).',
  dateLabel: 'Datum waarop de vraag werd gesteld',
  timeLabel: 'Lokale tijd',
  dateTimeCardHeading: 'Datum en tijd',
  locationCardHeading: 'Locatie',
  paramsCardHeading: 'Astrologische parameters',
  setToNow: 'Nu invullen',
  geocodeNotice: (host: string) =>
    `Plaatszoeken stuurt wat je typt naar ${host}. Je kunt de coördinaten ook zelf invullen.`,
  latitudeLabel: 'Breedtegraad',
  longitudeLabel: 'Lengtegraad',
  houseSystemLabel: 'Huizensysteem',
  quesitedHouseLabel: 'Huis van de gevraagde zaak',
  houseOption: (house: number) => `Huis ${String(house)}`,
  houseSystems: {
    R: 'Regiomontanus (dat van de horaire traditie)',
    P: 'Placidus',
    W: 'Hele tekens',
  },
  castButton: 'Horoscoop maken',
  casting: 'Bezig…',
  fieldErrors: {
    date: 'Voer een bestaande datum in.',
    time: 'Voer een tijd in zoals 14:30.',
    latitude: 'Voer een breedtegraad in decimale graden in, van -90 tot 90.',
    longitude: 'Voer een lengtegraad in decimale graden in, van -180 tot 180.',
  },
  error: (message: string) => `De horoscoop kon niet worden gemaakt. ${message}`,
  considerationsHeading: 'Overwegingen vóór het oordeel',
  radical: 'Geen van de overwegingen is van toepassing: de horoscoop is geschikt om te beoordelen.',
  notRadical: (count: number) =>
    `${String(count)} ${count === 1 ? 'overweging is van toepassing' : 'overwegingen zijn van toepassing'}. Traditioneel moet de horoscoop dan niet worden beoordeeld, of alleen met grote zorg.`,
  applies: 'Van toepassing',
  appliesSoftened: 'Van toepassing, maar weegt minder',
  clear: 'Niet van toepassing',
  radicalWithSoftened:
    'Alleen een verzwakte overweging is van toepassing: volgens Lilly telt een lege Maan minder in Stier, Kreeft, Boogschutter en Vissen, dus de horoscoop is nog steeds geschikt om te beoordelen.',
  judgmentHeading: 'Oordeelhulpmiddel',
  significators: (querent: string, quesited: string, house: number) =>
    `Vragensteller: ${querent}. Gevraagde zaak (huis ${String(house)}): ${quesited}.`,
  perfection: {
    directAspect: 'De significatoren vormen een direct toepassend aspect.',
    translation: 'Een derde planeet vertaalt licht tussen de significatoren.',
    collection: 'Een derde planeet verzamelt licht van beide significatoren.',
    prohibition: 'Een andere toepassing perfectioneert eerst en verhindert de zaak.',
    frustration:
      'Een derde planeet bereikt een significator vóór het aspect perfectioneert: de zaak wordt gefrustreerd.',
    signChange: 'Een significator verandert van teken vóór het aspect perfectioneert.',
    refranation: 'Een significator stationeert vóór de perfectionering en voltooit het aspect niet.',
    none: 'Er is geen perfectionering onder de klassieke significatoren.',
  },
  // Machine-drafted; needs a native Dutch read (#1960).
  practitioner: {
    'non-radical-chart':
      'De kaart is niet radicaal. Ze wordt toch beoordeeld; sommige beoefenaars zouden dat niet doen.',
    'late-ascendant-limit':
      "Lilly's late Ascendant (27, 28 of 29 graden) geldt hier vanaf 27°00′; de lezingen van die grens verschillen.",
    'house-by-exact-cusp':
      'Een planeet staat in het huis waar haar graad valt, op de exacte spits, zonder 5-gradenregel; beoefenaars verschillen.',
    'perfection-orbs':
      "Perfectie telt alleen de vijf Ptolemaeïsche aspecten binnen Lilly's moieties; orbtabellen verschillen per auteur.",
    'rule-order':
      'Meer dan één regel geldt. De code meldt de eerste in haar eigen vaste volgorde, niet een volgorde uit de teksten.',
    'sign-change':
      'Een significator verandert van teken voordat het aspect perfectioneert; beoefenaars verschillen of het nog telt.',
  },
  timing: (days: string) => `Geschatte tijd tot perfectionering: ${days} dagen.`,
  reception: {
    none: 'Er is geen essentiële receptie gevonden.',
    oneWay: 'Er is eenzijdige essentiële receptie aanwezig.',
    mutual: 'Er is wederzijdse essentiële receptie aanwezig.',
  },
  receptionAidsPerfection:
    'Receptie begeleidt deze toepassende perfectionering; het is getuigenis, geen automatisch oordeel.',
  considerations: {
    'ascendant-too-early': {
      label: 'Ascendant te vroeg',
      explanation: 'De Ascendant staat in de eerste 3° van zijn teken: de zaak is nog niet rijp om te beoordelen.',
    },
    'ascendant-too-late': {
      label: 'Ascendant te laat',
      explanation: 'De Ascendant staat in de laatste 3° van zijn teken: de zaak is al beslist.',
    },
    'moon-void-of-course': {
      label: 'Maan zonder koers',
      explanation:
        'De Maan maakt geen hoofdaspect meer voordat ze haar teken verlaat: er komt niets van de zaak. In Stier, Kreeft, Boogschutter en Vissen telt het volgens Lilly minder, omdat de Maan daar niet veel gehinderd wordt.',
    },
    'moon-via-combusta': {
      label: 'Maan in de Via Combusta',
      explanation: 'De Maan staat tussen 15° Weegschaal en 15° Schorpioen, de “verbrande weg”.',
    },
    'saturn-in-seventh': {
      label: 'Saturnus in het zevende huis',
      explanation: 'Saturnus in het eigen huis van de astroloog zou het oordeel van de astroloog schaden.',
    },
  },
  chartName: 'Horoscoop voor een vraag',
  noHouses:
    'Voor deze plaats en tijd kunnen geen huizen worden berekend, dus de Ascendant en het huis van Saturnus kunnen niet worden gecontroleerd.',
  horaryLink: 'Horoscoop voor een vraag',
  // Machine-drafted; needs a native Dutch read (#1960).
  questionCardHeading: 'Vraag',
  questionLabel: 'De gestelde vraag',
  questionHelp: (max: string) =>
    `Nodig om het oordeel op te slaan. Maximaal ${max} tekens. De vraag kan persoonlijke gegevens bevatten, houd haar dus algemeen.`,
  saveJudgment: 'Oordeel opslaan',
  saveNeedsQuestion: 'Vul hierboven de vraag in om dit oordeel op te slaan.',
  saved: (question: string) => `“${question}” is opgeslagen.`,
  questionTooLong: (max: string) => `De vraag is langer dan ${max} tekens.`,
  invalidJudgment: 'Dit oordeel kan niet worden opgeslagen.',
  saveFailed: 'Opslaan is niet gelukt.',
  savedHeading: 'Opgeslagen oordelen',
  savedScopeNote:
    'Opgeslagen in je account. Ze synchroniseren als je bent ingelogd en blijven op dit apparaat als je dat niet bent.',
  savedUnavailable: 'Opgeslagen oordelen zijn nog niet beschikbaar. De opslag wordt nog geopend.',
  savedEmpty:
    'Nog geen opgeslagen oordelen. Maak een horoscoop, vul de vraag in en sla het oordeel op om het later te heropenen.',
  noQuestion: 'Geen vraag',
  savedOn: (when: string) => `Opgeslagen ${when}`,
  couldNotBeRead: 'Kon niet worden gelezen',
  open: 'Openen',
  openLabel: (question: string) => `${question} openen`,
  close: 'Sluiten',
  openedHeading: 'Opgeslagen oordeel',
  openedNote: 'Getoond zoals het is opgeslagen. Het wordt niet opnieuw berekend.',
  openedQuestion: 'Vraag',
  openedMoment: 'Moment',
  openedPlace: 'Plaats',
  openedHouseSystem: 'Huizensysteem',
  openedSummary: 'Oordeel',
  openedConsiderations: 'Overwegingen',
  momentLine: (date: string, time: string, offset: string) => `${date}, ${time} (UTC${offset})`,
  delete: 'Verwijderen',
  deleteLabel: (question: string) => `${question} verwijderen`,
  deleted: (question: string) => `“${question}” is verwijderd.`,
  deleteHeading: 'Dit oordeel verwijderen?',
  deleteConsequence: (question: string) =>
    `“${question}” en het opgeslagen oordeel worden verwijderd uit je account en van elk apparaat dat ermee synchroniseert.`,
  deleteCancel: 'Annuleren',
  deleteConfirm: 'Oordeel verwijderen',
  deleteClose: 'Sluiten zonder te verwijderen',
};

export const horaryViewMessages = { en, nl };
