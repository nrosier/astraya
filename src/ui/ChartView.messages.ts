/**
 * Message catalogue for `ChartView.tsx` (#158).
 */
/**
 * @module ChartView.messages
 * @purpose English/Dutch i18n strings for the natal chart screen: table column labels, chart-shape/lunar-phase/sect wording, export labels, and share-link text.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by ChartView.tsx via `useMessages(chartViewMessages)`; `nl` is typed as `typeof en`.
 * @exports chartViewMessages
 */
const en = {
  signLabel: 'Sign',
  degLabel: 'Deg',
  minLabel: 'Min',
  secLabel: 'Sec',
  houseLabel: 'House',
  speedLabel: 'Speed',
  rxLabel: 'Rx',
  symbolLabel: 'Symbol',
  bodyLabel: 'Body',
  angleLabel: 'Angle',
  bodyALabel: 'Body A',
  aspectLabel: 'Aspect',
  bodyBLabel: 'Body B',
  orbLabel: 'Orb',
  applyingLabel: 'Applying',
  applying: 'Applying',
  separating: 'Separating',
  rulerLabel: 'Ruler',
  exaltedLabel: 'Exalted',
  detrimentLabel: 'Detriment',
  fallLabel: 'Fall',
  pointLabel: 'Point',
  anareticLabel: 'Anaretic',
  outOfBoundsLabel: 'OOB',
  triplicityLabel: 'Triplicity',
  boundLabel: 'Bound',
  faceLabel: 'Face',
  dignityPointsLabel: 'Points',
  peregrineLabel: 'Peregrine',
  chainLabel: 'Chain',
  finalDispositorLabel: 'Final dispositor',
  mutualReceptionLabel: 'Mutual reception',
  cycleLabel: 'Cycle',
  contactLabel: 'Contact',
  kindLabel: 'Kind',
  starLabel: 'Star',
  parallel: 'Parallel',
  contraparallel: 'Contraparallel',
  antiscion: 'Antiscion',
  contraAntiscion: 'Contra-antiscion',

  // Tooltips for table column headers
  declinationKindTooltip:
    'Parallel: bodies with the same declination; Contraparallel: bodies with equal but opposite declinations',
  antisciaKindTooltip:
    'Antiscion: reflected across Cancer-Leo axis; Contraantiscion: reflected across Aries-Libra axis',
  applyingTooltip: 'Applying: bodies moving toward exact aspect; Separating: bodies moving away from exact aspect',

  positionsCaption: 'Positions',
  housesCaption: 'Houses',
  anglesCaption: 'Angles',
  aspectsCaption: 'Aspects',
  dignitiesCaption: 'Dignities',
  derivedPointsCaption: 'Derived points',
  dispositorsCaption: 'Dispositors',
  dispositorsHint:
    "A dispositor is the ruler of a planet's sign — the planetary chain traces each ruler forward until it circles back on itself or reaches a final dispositor. Use this to find rulership cycles and understand what each planet depends on.",
  dispositorsTooltip:
    "A dispositor is the ruler of a planet's sign. Dispositor chains trace where each planet's rulership flows.",
  declinationsCaption: 'Declinations',
  antisciaCaption: 'Antiscia',
  fixedStarsCaption: 'Fixed stars',

  almutenOfAscendantSentence: (names: string) => `Almuten of the Ascendant: ${names}`,
  // Jones' own seven pattern names (#35, #398) have no established Dutch astrological
  // vocabulary, the same out-of-scope treatment house-system names and "Harmonic"/"Solar
  // return" already get (#158's glossary) — kept untranslated in both locales.
  jonesShapeLabels: {
    bundle: 'Bundle',
    bowl: 'Bowl',
    locomotive: 'Locomotive',
    bucket: 'Bucket',
    seesaw: 'Seesaw',
    splay: 'Splay',
    splash: 'Splash',
  },
  chartShapeSentence: (shape: string, handle: string | undefined) =>
    handle === undefined ? `Chart shape: ${shape}.` : `Chart shape: ${shape} (handle: ${handle}).`,

  chartTabLabel: 'Chart wheel',
  showOnChartColumn: 'Wheel',
  showOnChartButton: 'Show',
  showOnChart: (name: string) => `Show ${name} on the chart`,
  selectedOnChart: (what: string) => `Selected on the chart: ${what}`,
  goToChart: 'Go to the chart',
  shapeTabLabel: 'Chart shape',
  shapeSourceNote:
    'Chart shapes are a convention from Marc Edmund Jones (1941), widely taught in modern textbooks. They are not part of classical astrology and have not been validated empirically: read them as a tendency, never a verdict. The shape is worked out from the ten planets, Sun to Pluto, and its boundaries are approximate: a chart just either side of a boundary can fall in a neighbouring shape.',
  shapeCannotBeWorkedOut: 'The chart shape cannot be worked out: it needs at least two planets.',
  jonesShapeExplanations: {
    bundle:
      'All the planets sit within about a third of the circle. Traditionally read as a concentrated, self-contained focus with a narrow range of experience. A tendency, not a verdict.',
    bowl: 'The planets fill about half the circle and leave the other half empty. Often read as self-containment, the empty half being what the person looks toward or lacks; the planets at the edges of the filled half (the “rim”) are sometimes given extra weight.',
    locomotive:
      'The planets span about two thirds of the circle and leave a third empty. Often read as drive and momentum, with the planet leading the motion sometimes taken as the focal point; that last part is a later gloss.',
    bucket:
      'A bowl-like group of planets plus one separate planet, the handle. Read as the outlet or focus of the chart’s energy, so the handle matters for its sign, house and aspects.',
    seesaw:
      'Two groups of planets roughly facing each other across the circle. Read as balancing two sets of concerns, a polarity; “tension” is a modern gloss.',
    splay: 'Three or more irregular groups of planets. Read as individualistic and varied, without one dominant theme.',
    splash:
      'The planets are spread widely around the circle with few gaps. Read as many interests and an all-round range; the “scattered” downside is a modern gloss.',
  },

  lunarPhaseLabels: {
    new: 'New Moon',
    crescent: 'Crescent Moon',
    'first-quarter': 'First Quarter Moon',
    gibbous: 'Gibbous Moon',
    full: 'Full Moon',
    disseminating: 'Disseminating Moon',
    'last-quarter': 'Last Quarter Moon',
    balsamic: 'Balsamic Moon',
  },
  lunarPhaseSentence: (phase: string, elongation: string, waxing: boolean, litPercent: number) =>
    `Lunar phase: ${phase} — ${elongation} ahead of the Sun, ${waxing ? 'waxing' : 'waning'}, ${String(litPercent)}% lit.`,

  sectPrefix: 'Sect:',
  dayChart: 'Day chart',
  nightChart: 'Night chart',

  pngSmall: 'Small (600px)',
  pngMedium: 'Medium (1200px)',
  pngLarge: 'Large (2400px)',

  linkCopied: 'Link copied',
  copyShareLink: 'Copy share link',
  shareLinkHint:
    'The link holds the whole birth record and settings — nothing is sent to us to create it, and opening it needs no account.',
  // The other side of the same fact (#341): because the data is in the link and not on a
  // server, there is nothing to revoke. Worth saying at the moment of copying rather than
  // in a settings screen nobody opens.
  shareLinkWarning:
    'Anyone who has the link can read that birth data, and it cannot be revoked — sharing it is permanent wherever it is pasted.',

  housesUnknownHint: (name: string) =>
    `The birth time for ${name} is unknown, so houses, angles and the Ascendant-based derived points cannot be calculated — they are not shown below. Positions, aspects and dignities are still meaningful, though the Moon’s sign may be uncertain.`,

  housesUndefinedHint: (name: string) =>
    `The chosen house system has no valid solution for ${name}’s birth place at this exact time, so houses, angles and the Ascendant-based derived points are not shown below. This is different from an unknown birth time — try a different house system in Extended settings, or a location further from the poles. Positions, aspects and dignities are still meaningful.`,

  calculating: 'Calculating…',
  chartError: (message: string) => `The chart could not be calculated. ${message}`,

  astrochartReferenceHeading: 'AstroChart reference rendering (dev only)',
  astrochartReferenceHint: 'Shown for comparison only — exports always use Astraya’s own rendering above.',

  exportSvg: 'Image (SVG)',
  exportPng: (size: string) => `Image (PNG), ${size}`,
  exportPdf: 'Document (PDF, via print)…',
  exportPdfHint:
    '“Export PDF” opens your browser’s print dialog with the wheel and every data table laid out for paper — choose “Save as PDF” there.',

  chartDataTablist: 'Chart data',

  thisPerson: 'this person',
  thisPersonCapitalized: 'This person',
  personFallback: 'Person',
  chartFallback: 'Chart',
  natalFallback: 'Natal',
  notCompleteChart: (name: string) =>
    `${name}’s birth record is not complete enough to calculate a chart yet. Fill in the missing fields on the`,
  personPageLink: 'person page',

  isolationClear: 'Clear',
  selectionInterpretationHeading: 'What it means',
  selectionLoading: 'Loading the interpretation…',
  selectionUnavailable: 'The interpretation text could not be loaded.',
  selectionShowAll: (count: number) => `Show all ${String(count)}`,
  selectionShowFewer: 'Show fewer',
  dignityStateLabels: { ruler: 'Ruler (home sign)', exalted: 'Exalted', detriment: 'Detriment', fall: 'Fall' },
  cuspHeading: (sign: string, house: number) => `${sign} on the cusp of house ${String(house)}`,
  isolationSignEmpty: 'No planets in this sign.',
  wheelClickHint:
    'Click a planet, sign or aspect line to highlight it and its connections. Click it again, or an empty spot, to clear.',
};

const nl: typeof en = {
  signLabel: 'Teken',
  degLabel: 'Gr',
  minLabel: 'Min',
  secLabel: 'Sec',
  houseLabel: 'Huis',
  speedLabel: 'Snelheid',
  rxLabel: 'Rx',
  symbolLabel: 'Symbool',
  bodyLabel: 'Hemellichaam',
  angleLabel: 'Hoek',
  bodyALabel: 'Hemellichaam A',
  aspectLabel: 'Aspect',
  bodyBLabel: 'Hemellichaam B',
  orbLabel: 'Orb',
  applyingLabel: 'Toenemend',
  applying: 'Toenemend',
  separating: 'Afnemend',
  rulerLabel: 'Heerser',
  exaltedLabel: 'Verheven',
  detrimentLabel: 'Val (detriment)',
  fallLabel: 'Val',
  pointLabel: 'Punt',
  anareticLabel: 'Anaretisch',
  outOfBoundsLabel: 'OOB',
  triplicityLabel: 'Triplicitiet',
  boundLabel: 'Bound',
  faceLabel: 'Decaan',
  dignityPointsLabel: 'Punten',
  peregrineLabel: 'Peregrine',
  chainLabel: 'Keten',
  finalDispositorLabel: 'Uiteindelijke dispositor',
  mutualReceptionLabel: 'Wederzijdse ontvangst',
  cycleLabel: 'Kringloop',
  contactLabel: 'Contact',
  kindLabel: 'Soort',
  starLabel: 'Ster',
  parallel: 'Parallel',
  contraparallel: 'Contraparallel',
  antiscion: 'Antiscion',
  contraAntiscion: 'Contra-antiscion',

  // Tooltips for table column headers (Dutch)
  declinationKindTooltip:
    'Parallel: hemellichamen met dezelfde declinatie; Contraparallel: hemellichamen met gelijke maar tegengestelde declinaties',
  antisciaKindTooltip:
    'Antiscion: gereflecteerd over Kreeft-Leeuw-as; Contraantiscion: gereflecteerd over Ram-Weegschaal-as',
  applyingTooltip:
    'Toenemend: hemellichamen bewegen naar exact aspect; Afnemend: hemellichamen bewegen weg van exact aspect',

  positionsCaption: 'Posities',
  housesCaption: 'Huizen',
  anglesCaption: 'Hoeken',
  aspectsCaption: 'Aspecten',
  dignitiesCaption: 'Waardigheden',
  derivedPointsCaption: 'Afgeleide punten',
  dispositorsCaption: 'Dispositoren',
  dispositorsHint:
    'Een dispositor is de heerser van het teken van een planeet — de planetaire keten volgt elke heerser vooruit totdat deze op zichzelf terugvoert of een uiteindelijke dispositor bereikt. Gebruik dit om heersersakels te vinden en te begrijpen waar elke planeet van afhangt.',
  dispositorsTooltip:
    'Een dispositor is de heerser van het teken van een planeet. Dispositorketens tonen hoe de heerserschap van elke planeet vloeit.',
  declinationsCaption: 'Declinaties',
  antisciaCaption: 'Antiscia',
  fixedStarsCaption: 'Vaste sterren',

  almutenOfAscendantSentence: (names: string) => `Almuten van de Ascendant: ${names}`,
  jonesShapeLabels: {
    bundle: 'Bundle',
    bowl: 'Bowl',
    locomotive: 'Locomotive',
    bucket: 'Bucket',
    seesaw: 'Seesaw',
    splay: 'Splay',
    splash: 'Splash',
  },
  chartShapeSentence: (shape: string, handle: string | undefined) =>
    handle === undefined ? `Horoscoopvorm: ${shape}.` : `Horoscoopvorm: ${shape} (handvat: ${handle}).`,

  chartTabLabel: 'Horoscoopwiel',
  showOnChartColumn: 'Wiel',
  showOnChartButton: 'Toon',
  showOnChart: (name: string) => `Toon ${name} op de horoscoop`,
  selectedOnChart: (what: string) => `Geselecteerd op de horoscoop: ${what}`,
  goToChart: 'Ga naar de horoscoop',
  shapeTabLabel: 'Horoscoopvorm',
  shapeSourceNote:
    'Horoscoopvormen zijn een conventie van Marc Edmund Jones (1941), veel onderwezen in moderne leerboeken. Ze maken geen deel uit van de klassieke astrologie en zijn niet empirisch onderbouwd: lees ze als een neiging, nooit als een oordeel. De vorm wordt bepaald uit de tien planeten, Zon tot Pluto, en de grenzen zijn bij benadering: een horoscoop net aan de ene of andere kant van een grens kan in een naburige vorm vallen.',
  shapeCannotBeWorkedOut: 'De horoscoopvorm kan niet worden bepaald: er zijn minstens twee planeten nodig.',
  jonesShapeExplanations: {
    bundle:
      'Alle planeten staan binnen ongeveer een derde van de cirkel. Traditioneel gelezen als een geconcentreerde, in zichzelf gekeerde focus met een smal ervaringsgebied. Een neiging, geen oordeel.',
    bowl: 'De planeten vullen ongeveer de helft van de cirkel en laten de andere helft leeg. Vaak gelezen als in zichzelf gekeerdheid, waarbij de lege helft is waar iemand naar uitkijkt of wat iemand mist; de planeten aan de randen van de gevulde helft (de “rand”) krijgen soms extra gewicht.',
    locomotive:
      'De planeten beslaan ongeveer twee derde van de cirkel en laten een derde leeg. Vaak gelezen als drijfkracht en vaart, waarbij de planeet die de beweging aanvoert soms als brandpunt wordt gezien; dat laatste is een latere toevoeging.',
    bucket:
      'Een komvormige groep planeten plus één losse planeet, het handvat. Gelezen als de uitlaat of het brandpunt van de energie van de horoscoop, dus het handvat telt mee voor zijn teken, huis en aspecten.',
    seesaw:
      'Twee groepen planeten die elkaar ongeveer aankijken aan weerszijden van de cirkel. Gelezen als het in evenwicht brengen van twee reeksen zorgen, een polariteit; “spanning” is een moderne toevoeging.',
    splay:
      'Drie of meer onregelmatige groepen planeten. Gelezen als eigenzinnig en gevarieerd, zonder één overheersend thema.',
    splash:
      'De planeten zijn wijd over de cirkel verspreid met weinig tussenruimten. Gelezen als veel interesses en een brede, veelzijdige range; de “versnipperde” keerzijde is een moderne toevoeging.',
  },

  lunarPhaseLabels: {
    new: 'Nieuwe maan',
    crescent: 'Wassende sikkel',
    'first-quarter': 'Eerste kwartier',
    gibbous: 'Wassende maan',
    full: 'Volle maan',
    disseminating: 'Afnemende maan',
    'last-quarter': 'Laatste kwartier',
    balsamic: 'Balsamische maan',
  },
  lunarPhaseSentence: (phase: string, elongation: string, waxing: boolean, litPercent: number) =>
    `Maanfase: ${phase} — ${elongation} voor op de Zon, ${waxing ? 'wassend' : 'afnemend'}, ${String(litPercent)}% verlicht.`,

  sectPrefix: 'Sect:',
  dayChart: 'Daghoroscoop',
  nightChart: 'Nachthoroscoop',

  pngSmall: 'Klein (600px)',
  pngMedium: 'Middel (1200px)',
  pngLarge: 'Groot (2400px)',

  linkCopied: 'Link gekopieerd',
  copyShareLink: 'Deellink kopiëren',
  shareLinkHint:
    'De link bevat het hele geboorterecord en de instellingen — er wordt niets naar ons verzonden om hem te maken, en het openen ervan vereist geen account.',
  shareLinkWarning:
    'Iedereen met de link kan die geboortegegevens lezen, en de link kan niet worden ingetrokken — delen is definitief, waar de link ook geplakt wordt.',

  housesUnknownHint: (name: string) =>
    `De geboortetijd van ${name} is onbekend, dus huizen, hoeken en de op de Ascendant gebaseerde afgeleide punten kunnen niet worden berekend — ze worden hieronder niet getoond. Posities, aspecten en waardigheden blijven zinvol, al kan het teken van de Maan onzeker zijn.`,

  housesUndefinedHint: (name: string) =>
    `Het gekozen huizensysteem heeft geen geldige oplossing voor de geboorteplaats van ${name} op dit exacte moment, dus huizen, hoeken en de op de Ascendant gebaseerde afgeleide punten worden hieronder niet getoond. Dit is iets anders dan een onbekende geboortetijd — probeer een ander huizensysteem bij Uitgebreide instellingen, of een locatie verder van de polen. Posities, aspecten en waardigheden blijven zinvol.`,

  calculating: 'Berekenen…',
  chartError: (message: string) => `De horoscoop kon niet worden berekend. ${message}`,

  astrochartReferenceHeading: 'AstroChart-referentieweergave (alleen dev)',
  astrochartReferenceHint:
    'Alleen getoond ter vergelijking — exports gebruiken altijd Astraya’s eigen weergave hierboven.',

  exportSvg: 'Afbeelding (SVG)',
  exportPng: (size: string) => `Afbeelding (PNG), ${size}`,
  exportPdf: 'Document (PDF, via afdrukken)…',
  exportPdfHint:
    '“PDF exporteren” opent het afdrukdialoogvenster van je browser met het wiel en elke gegevenstabel opgemaakt voor papier — kies daar “Opslaan als PDF”.',

  chartDataTablist: 'Horoscoopgegevens',

  thisPerson: 'deze persoon',
  thisPersonCapitalized: 'Deze persoon',
  personFallback: 'Persoon',
  chartFallback: 'Horoscoop',
  natalFallback: 'Natal',
  notCompleteChart: (name: string) =>
    `Het geboorterecord van ${name} is niet volledig genoeg om een horoscoop te berekenen. Vul de ontbrekende velden in op de`,
  personPageLink: 'persoonspagina',

  isolationClear: 'Wissen',
  selectionInterpretationHeading: 'Wat het betekent',
  selectionLoading: 'De interpretatie wordt geladen…',
  selectionUnavailable: 'De interpretatietekst kon niet worden geladen.',
  selectionShowAll: (count: number) => `Toon alle ${String(count)}`,
  selectionShowFewer: 'Toon minder',
  dignityStateLabels: { ruler: 'Heerser (eigen teken)', exalted: 'Verheffing', detriment: 'Schade', fall: 'Val' },
  cuspHeading: (sign: string, house: number) => `${sign} op de cusp van huis ${String(house)}`,
  isolationSignEmpty: 'Geen planeten in dit teken.',
  wheelClickHint:
    'Klik op een planeet, teken of aspectlijn om die en zijn verbindingen uit te lichten. Klik nogmaals, of op een lege plek, om te wissen.',
};

export const chartViewMessages = { en, nl };
