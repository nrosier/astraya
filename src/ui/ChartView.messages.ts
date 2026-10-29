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
  columnDesignation: 'Designation',
  columnSourceVersion: 'Source version',
  sourceVersionCell: (hash: string) => `SHA-256 ${hash}`,
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
  speedTooltip:
    'How many degrees this body moves per day — faster near perigee/perihelion, slower (or negative) near a retrograde turn',
  retrogradeTooltip:
    'Retrograde (℞): the body appears to move backward through the zodiac from Earth, a visual effect of relative orbital speed, not an actual reversal',
  aspectTooltip:
    'The angular relationship between two bodies — this table includes minor aspects alongside the major ones (conjunction, sextile, square, trine, opposition)',
  starTooltip:
    'A fixed star conjunct a planet or angle, within a tight orb — traditionally read as lending that star’s own character to the point it touches',
  derivedPointTooltip:
    'A point calculated from other positions rather than observed directly — e.g. the Part of Fortune, combining the Sun, Moon and Ascendant',
  lotFormulaLabel: 'Formula',
  lotFormulaTooltip:
    'The lot’s own formula (#550): day-chart operand order, then night-chart (the two always reverse here) — blank for the midpoints, which have no lot formula of their own.',
  rulerTooltip: 'Ruler (domicile): the planet is in the sign it rules — its own sign, where it is strongest',
  exaltedTooltip:
    'Exalted: the planet is in a sign where it is especially strengthened, second only to its own rulership',
  detrimentTooltip: 'Detriment: the planet is in the sign opposite the one it rules, where it is weakened',
  fallTooltip: 'Fall: the planet is in the sign opposite its exaltation, where it is most weakened',
  triplicityTooltip:
    'Triplicity: an essential dignity assigned by element (fire, earth, air, water) and by day/night sect',
  boundTooltip:
    'Bound (term): a classical subdivision of the sign into unequal segments, each ruled by a different planet',
  faceTooltip: 'Face (decan): a 10° third of the sign, ruled by a planet in a fixed rotating order',
  peregrineTooltip:
    'Peregrine: the planet holds none of the essential dignities in this sign — no rulership, exaltation, triplicity, bound or face',

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
  dispositorsTooltipLabel: 'About dispositors',
  conditionCaption: 'Condition',
  conditionHint:
    "A traditional planet's condition: sect alignment, angularity, hayz, motion, besiegement, and solar phase/proximity — the standard first read of a traditional chart, alongside dignity above.",
  conditionTooltip:
    "Sect alignment (of/contrary to the chart's own day or night sect), angularity (angular/succedent/cadent house), hayz (of sect, on its own side of the horizon, in a sign of its own gender), motion, besiegement (hemmed in by Mars and Saturn), and solar phase/proximity (oriental or occidental, cazimi, combust, or under the beams).",
  conditionTooltipLabel: 'About condition',
  sectAlignmentLabel: 'Sect',
  sectAlignmentTooltip:
    "Whether this planet is of the chart's own day/night sect, contrary to it, or (Mercury) neutral to either.",
  ofSect: 'Of sect',
  contraSect: 'Contrary',
  sectNeutral: 'Neutral',
  angularityLabel: 'Angularity',
  angularityTooltip: 'Angular (1st/4th/7th/10th house), succedent (2nd/5th/8th/11th), or cadent (3rd/6th/9th/12th).',
  angular: 'Angular',
  succedent: 'Succedent',
  cadent: 'Cadent',
  motionLabel: 'Motion',
  directLabel: 'Direct',
  retrogradeLabel: 'Retrograde',
  stationaryLabel: 'Stationary',
  stationaryFirstLabel: 'Stationary (1st station)',
  stationarySecondLabel: 'Stationary (2nd station)',
  stationFirstMarker: 'St.1',
  stationSecondMarker: 'St.2',
  stationMarker: 'St.',
  stationWindowNote:
    'Stationary planets are marked St.1 (first station), St.2 (second station), or St. when the type cannot be told. The station window is an Astraya convention, not a rule from Avelar & Ribeiro; see Extended settings.',
  motionScoreLabel: 'Motion score',
  motionScoreTooltip:
    'Direct +4 or retrograde −5 (a first station scores as retrograde, a second as direct), plus fast +2 or slow −2 against mean speed. Avelar & Ribeiro, p. 197. The Sun and Moon get the speed points only. Blank when a stationary planet’s station type is unknown.',
  hayzLabel: 'Hayz',
  hayzTooltip:
    "In hayz: of the chart's sect, on its own side of the horizon for that sect, and in a sign of its own gender (masculine for a diurnal planet, feminine for a nocturnal one).",
  besiegedLabel: 'Besieged',
  besiegedTooltip: 'Within conjunction orb of both Mars and Saturn at once, one on each side.',
  besiegedEased: (rescuers: string) => `eased by ${rescuers}`,
  solarPhaseLabel: 'Solar phase',
  solarPhaseTooltip: 'Oriental (rising before the Sun) or occidental (rising after it).',
  oriental: 'Oriental',
  occidental: 'Occidental',
  solarConditionLabel: 'Solar proximity',
  solarConditionTooltip:
    'How close to the Sun: cazimi (within its disk), combust, under the beams, or free of all three.',
  cazimi: 'Cazimi',
  combust: 'Combust',
  underTheBeams: 'Under the beams',
  solarConditionFree: 'Free',
  receptionCaption: 'Reception',
  receptionHint:
    'Reception: a planet standing in another’s essential dignity. Mutual reception is each planet in the other’s dignity of the same kind (e.g. both by domicile); mixed reception is each in the other’s dignity of a different kind; one-way is only one side. Aspect-linked reception — the pair also in aspect — is traditionally the stronger, more immediately active case.',
  receptionTooltip:
    'Which pairs of traditional planets receive each other, by which dignity (ruler, exalted, triplicity, bound, face), whether it is the same dignity on both sides, and whether the pair is also in aspect.',
  receptionTooltipLabel: 'About reception',
  receptionKindLabel: 'Kind',
  mutualReceptionKind: 'Mutual',
  oneWayReceptionKind: 'One-way',
  receptionAFromBLabel: 'A receives from B by',
  receptionBFromALabel: 'B receives from A by',
  receptionSameTypeLabel: 'Same dignity',
  receptionSameTypeTooltip:
    'Mutual reception of the same dignity type on both sides (e.g. both by domicile), rather than mixed reception by different types.',
  aspectLinkedLabel: 'Aspect-linked',
  aspectLinkedTooltip:
    'The two planets are also in aspect to each other — traditionally the stronger, more immediately active case of reception.',
  declinationsCaption: 'Declinations',
  antisciaCaption: 'Antiscia',
  midpointTreeCaption: 'Midpoint tree (90° dial)',
  allMidpointsCaption: 'All midpoints',
  pairLabel: 'Pair',
  midpointKindTooltip: 'Direct: half the shorter arc between the pair; Indirect: that point’s antipode',
  directMidpoint: 'Direct',
  indirectMidpoint: 'Indirect',
  harmonicFamilyLabel: 'Family',
  harmonicFamilyTooltip:
    'Addey’s harmonic grouping: the smallest division of the circle this aspect is a multiple of (conjunction H1, opposition H2, trine H3, square H4, quintile/biquintile H5, sextile H6, semisquare/sesquiquadrate H8, semisextile/quincunx H12)',
  harmonicFamilyFilterLabel: 'Aspect family',
  allHarmonicFamilies: 'All harmonic families',
  harmonicFamilyOption: (family: string) => `H${family}`,
  fixedStarsCaption: 'Fixed stars',
  // The list is deliberately short (#398, #725): said next to the table and in the PDF so an empty table is not read as "no star is near".
  fixedStarsScopeNote: (count: number, names: string) =>
    `This table checks only ${count === 1 ? '1 star' : `${String(count)} stars`}: ${names}. No other fixed star is looked for, so an empty or short list does not mean no star is near a planet.`,
  // Shown near the selection inspector when the chart is not a natal chart (#725).
  derivedChartInterpretationNote: (chartKind: string) =>
    `This reading applies natal-chart interpretations to a derived chart (${chartKind}); treat it as indicative.`,

  almutenOfAscendantSentence: (names: string) => `Almuten of the Ascendant: ${names}`,
  almutenTooltip:
    'The almuten is the planet with the most essential-dignity points at a chart point — found by scoring every dignity (rulership, exaltation, triplicity, bound/term, face) a planet holds there and taking the highest total.',
  almutenTooltipLabel: 'About the almuten',
  almutenScopeNote:
    'This is the Almuten of the Ascendant, scored by essential-dignity points only (5/4/3/2/1 for rulership, exaltation, triplicity, bound and face, as in Lilly\u2019s fortitudes table). It does not include the planetary hour or the prenatal syzygy that some authors add to an Almuten Figuris.',
  almutenBreakdownCaption: 'Almuten candidates',
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

  showOnChartColumn: 'Wheel',
  showOnChartButton: 'Show',
  showSignColumn: 'Sign on wheel',
  showSignButton: 'Show sign',
  showOnChart: (name: string) => `Show ${name} on the chart`,
  showOnWheel: (name: string) => `Show ${name} on the wheel`,
  selectedOnChart: (what: string) => `Selected on the chart: ${what}`,
  goToChart: 'Go to the chart',
  comparisonLabel: 'Comparison',
  natalLabel: 'Natal',
  shapeTabLabel: 'Chart shape',
  wheelViewLabel: 'Wheel',
  aspectsViewLabel: 'Aspects',
  matrixViewLabel: 'Aspect matrix',
  elementsViewLabel: 'Elements & modalities',
  emphasisCaption: 'Elements and modalities',
  emphasisHint:
    'Each body counted once, in the element and modality of the sign it stands in. The totals are along the right and the bottom.',
  emphasisElementLabel: 'Element',
  emphasisTotalLabel: 'Total',
  emphasisNone: '—',
  elementNames: { fire: 'Fire', earth: 'Earth', air: 'Air', water: 'Water' },
  modalityNames: { cardinal: 'Cardinal', fixed: 'Fixed', mutable: 'Mutable' },
  matrixLabel: 'Aspect matrix: select a pair to show it on the chart',
  matrixNameLabel: 'Name',
  matrixFormulaLink: 'Custom formula points: open them in Extended settings',
  compareFormulaLink: 'Custom formula points: open them in Extended settings (Bodies & orbs)',
  matrixHint:
    'Each cell is the aspect between the body named on its row and the one in its column. The aspect symbol is followed by the orb in degrees, and by a for applying or s for separating; cells are tinted by aspect family.',
  placementsViewLabel: 'Placements',
  patternsViewLabel: 'Patterns & condition',
  chartViewNavLabel: 'Chart view navigation',
  chartViewSelectLabel: 'Chart view',
  chartActionsLabel: 'Chart actions',
  aspectPatternsHeading: 'Aspect configurations',
  aspectPatternNames: {
    stellium: 'Stellium',
    'grand-trine': 'Grand Trine',
    't-square': 'T-Square',
    'grand-cross': 'Grand Cross',
    yod: 'Yod',
    cradle: 'Cradle',
    'mystic-rectangle': 'Mystic Rectangle',
    kite: 'Kite',
  },
  aspectPatternLine: (pattern: string, bodies: string, apex: string | undefined) =>
    apex === undefined ? `${pattern}: ${bodies}` : `${pattern}: ${bodies} (apex ${apex})`,
  aspectPatternSeparator: ', ',
  noAspectPatterns: 'No aspect configuration among the ten planets with the orbs in force.',
  aspectPatternsSourceNote:
    "Shapes as Astrolog 8.00 defines them, and the Kite as Huber defines its shape (Aspect Pattern Astrology, 2019). Astrolog does not list the Kite. In every shape the orb of each aspect comes from Astraya's orb settings, and Huber supplies only the Kite's shape. A stellium is three or four mutually conjunct planets. Only the ten planets, Sun to Pluto, are considered: no nodes, angles or asteroids. Yods need the quincunx turned on in the orb settings.",
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
  lunarPhaseKeyLabel: 'Lunar phase',
  lunarPhaseValue: (phase: string, elongation: string, waxing: boolean, litPercent: number) =>
    `${phase} — ${elongation} ahead of the Sun, ${waxing ? 'waxing' : 'waning'}, ${String(litPercent)}% lit`,

  sectKeyLabel: 'Sect',
  almutenKeyLabel: 'Almuten of Ascendant',
  dayChart: 'Day chart',
  nightChart: 'Night chart',

  pngSmall: 'Small (600px)',
  pngMedium: 'Medium (1200px)',
  pngLarge: 'Large (2400px)',

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

  thisPerson: 'this person',
  thisPersonCapitalized: 'This person',
  personFallback: 'Person',
  chartFallback: 'Chart',
  chartTitle: (type: string, name: string) => `${type} · ${name}`,
  natalFallback: 'Natal',
  notCompleteChart: (name: string) =>
    `${name}’s birth record is not complete enough to calculate a chart yet. Fill in the missing fields on the`,
  personPageLink: 'person page',

  isolationClear: 'Clear',
  inspectorHeading: 'Selection',
  inspectorEmpty: 'Select a planet, sign, house cusp, or aspect to explore it',
  selectionInterpretationHeading: 'What it means',
  selectionLoading: 'Loading the interpretation…',
  selectionUnavailable: 'The interpretation text could not be loaded.',
  selectionMoreTitle: 'More meanings',
  selectionMoreSummary: (count: number) => `${String(count)} more`,
  selectionShowAll: 'Show all meanings',
  selectionHideAll: 'Hide meanings',
  signSectionHeading: 'Sign interpretation',
  houseSectionHeading: 'House interpretation',
  degreeSectionHeading: 'Degree or Sabian symbol',
  dignityStateLabels: { ruler: 'Ruler (home sign)', exalted: 'Exalted', detriment: 'Detriment', fall: 'Fall' },
  cuspHeading: (sign: string, house: number) => `${sign} on the cusp of house ${String(house)}`,
  isolationSignEmpty: 'No planets in this sign.',
  isolationHouseEmpty: 'No planets in this house.',
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
  columnDesignation: 'Aanduiding',
  columnSourceVersion: 'Bronversie',
  sourceVersionCell: (hash: string) => `SHA-256 ${hash}`,
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
  speedTooltip:
    'Hoeveel graden dit hemellichaam per dag beweegt — sneller nabij perigeum/perihelium, trager (of negatief) nabij een retrograde ommekeer',
  retrogradeTooltip:
    'Retrograde (℞): het hemellichaam lijkt vanaf de Aarde achterwaarts door de dierenriem te bewegen, een visueel effect van relatieve omloopsnelheid, geen werkelijke omkering',
  aspectTooltip:
    'De hoekrelatie tussen twee hemellichamen — deze tabel bevat ook mineure aspecten naast de majeure (conjunctie, sextiel, vierkant, driehoek, oppositie)',
  starTooltip:
    'Een vaste ster die nauw samenvalt met een planeet of hoek — traditioneel gelezen als het overdragen van het eigen karakter van die ster aan het punt dat ze raakt',
  derivedPointTooltip:
    'Een punt dat berekend wordt uit andere posities in plaats van direct waargenomen — bijvoorbeeld de Fortuna, een combinatie van Zon, Maan en Ascendant',
  lotFormulaLabel: 'Formule',
  lotFormulaTooltip:
    'De eigen formule van het lot (#550): operandvolgorde bij een dagkaart, dan bij een nachtkaart (die twee wisselen hier altijd om) — leeg bij de middelpunten, die geen eigen lotformule hebben.',
  rulerTooltip:
    'Heerser (domicilie): de planeet staat in het teken dat ze heerst — haar eigen teken, waar ze het sterkst is',
  exaltedTooltip:
    'Verheven: de planeet staat in een teken waarin ze extra versterkt is, in kracht net na haar eigen heerserschap',
  detrimentTooltip:
    'Val (detriment): de planeet staat in het teken tegenover het teken dat ze heerst, waar ze verzwakt is',
  fallTooltip: 'Val: de planeet staat in het teken tegenover haar verheffing, waar ze het meest verzwakt is',
  triplicityTooltip:
    'Triplicitiet: een essentiële waardigheid toegekend op basis van element (vuur, aarde, lucht, water) en dag-/nachtsect',
  boundTooltip:
    'Bound (term): een klassieke onderverdeling van het teken in ongelijke segmenten, elk geheerst door een andere planeet',
  faceTooltip: 'Decaan: een derde van 10° van het teken, geheerst door een planeet in een vaste, roterende volgorde',
  peregrineTooltip:
    'Peregrine: de planeet heeft geen van de essentiële waardigheden in dit teken — geen heerserschap, verheffing, triplicitiet, bound of decaan',

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
  dispositorsTooltipLabel: 'Over dispositoren',
  conditionCaption: 'Conditie',
  conditionHint:
    'De conditie van een traditionele planeet: sectafstemming, hoekstand, hayz, beweging, belegering en zonnefase/-nabijheid — de gebruikelijke eerste blik op een traditionele horoscoop, naast de waardigheden hierboven.',
  conditionTooltip:
    'Sectafstemming (overeenstemmend met of in strijd met de eigen dag- of nachtsect van de horoscoop), hoekstand (hoekig/opvolgend/val-huis), hayz (van de sect, aan de eigen kant van de horizon, in een teken van het eigen geslacht), beweging, belegering (ingesloten door Mars en Saturnus), en zonnefase/-nabijheid (oosters of westers, cazimi, combust, of onder de stralen).',
  conditionTooltipLabel: 'Over conditie',
  sectAlignmentLabel: 'Sect',
  sectAlignmentTooltip:
    'Of deze planeet overeenstemt met de eigen dag-/nachtsect van de horoscoop, daarmee in strijd is, of (Mercurius) neutraal is ten opzichte van beide.',
  ofSect: 'Van de sect',
  contraSect: 'In strijd',
  sectNeutral: 'Neutraal',
  angularityLabel: 'Hoekstand',
  angularityTooltip: 'Hoekig (1e/4e/7e/10e huis), opvolgend (2e/5e/8e/11e), of val-huis (3e/6e/9e/12e).',
  angular: 'Hoekig',
  succedent: 'Opvolgend',
  cadent: 'Val-huis',
  motionLabel: 'Beweging',
  directLabel: 'Direct',
  retrogradeLabel: 'Retrograde',
  stationaryLabel: 'Stationair',
  stationaryFirstLabel: 'Stationair (1e station)',
  stationarySecondLabel: 'Stationair (2e station)',
  stationFirstMarker: 'St.1',
  stationSecondMarker: 'St.2',
  stationMarker: 'St.',
  stationWindowNote:
    'Stationaire planeten zijn gemarkeerd als St.1 (eerste station), St.2 (tweede station), of St. wanneer het type niet vastgesteld kan worden. Het stationsvenster is een Astraya-conventie, geen regel van Avelar & Ribeiro; zie Uitgebreide instellingen.',
  motionScoreLabel: 'Bewegingsscore',
  motionScoreTooltip:
    'Direct +4 of retrograde −5 (een eerste station telt als retrograde, een tweede als direct), plus snel +2 of traag −2 ten opzichte van de gemiddelde snelheid. Avelar & Ribeiro, blz. 197. De zon en de maan krijgen alleen de snelheidspunten. Leeg wanneer het stationstype van een stationaire planeet onbekend is.',
  hayzLabel: 'Hayz',
  hayzTooltip:
    'In hayz: van de sect van de horoscoop, aan de eigen kant van de horizon voor die sect, en in een teken van het eigen geslacht (mannelijk voor een dagplaneet, vrouwelijk voor een nachtplaneet).',
  besiegedLabel: 'Belegerd',
  besiegedTooltip: 'Binnen conjunctie-orb van zowel Mars als Saturnus tegelijk, één op elke kant.',
  besiegedEased: (rescuers: string) => `verlicht door ${rescuers}`,
  solarPhaseLabel: 'Zonnefase',
  solarPhaseTooltip: 'Oosters (komt op vóór de zon) of westers (komt op na de zon).',
  oriental: 'Oosters',
  occidental: 'Westers',
  solarConditionLabel: 'Zonnenabijheid',
  solarConditionTooltip:
    'Hoe dicht bij de zon: cazimi (binnen de schijf), combust, onder de stralen, of vrij van alle drie.',
  cazimi: 'Cazimi',
  combust: 'Combust',
  underTheBeams: 'Onder de stralen',
  solarConditionFree: 'Vrij',
  receptionCaption: 'Receptie',
  receptionHint:
    'Receptie: een planeet die in de essentiële waardigheid van een andere staat. Wederzijdse receptie is elke planeet in de waardigheid van de ander van hetzelfde type (bijv. beide via heerserschap); gemengde receptie is elk in de waardigheid van de ander van een ander type; eenzijdig is slechts één kant. Receptie met aspect — het paar staat ook in aspect — is traditioneel het sterkere, directer actieve geval.',
  receptionTooltip:
    'Welke paren traditionele planeten elkaar ontvangen, door welke waardigheid (heerser, verheven, triplicitiet, bound, decaan), of dit dezelfde waardigheid is op beide kanten, en of het paar ook in aspect staat.',
  receptionTooltipLabel: 'Over receptie',
  receptionKindLabel: 'Soort',
  mutualReceptionKind: 'Wederzijds',
  oneWayReceptionKind: 'Eenzijdig',
  receptionAFromBLabel: 'A ontvangt van B via',
  receptionBFromALabel: 'B ontvangt van A via',
  receptionSameTypeLabel: 'Zelfde waardigheid',
  receptionSameTypeTooltip:
    'Wederzijdse receptie van hetzelfde waardigheidstype op beide kanten (bijv. beide via heerserschap), in plaats van gemengde receptie via verschillende types.',
  aspectLinkedLabel: 'Met aspect',
  aspectLinkedTooltip:
    'De twee planeten staan ook in aspect met elkaar — traditioneel het sterkere, directer actieve geval van receptie.',
  declinationsCaption: 'Declinaties',
  antisciaCaption: 'Antiscia',
  midpointTreeCaption: 'Middelpuntenboom (90°-dial)',
  allMidpointsCaption: 'Alle middelpunten',
  pairLabel: 'Paar',
  midpointKindTooltip: 'Direct: de helft van de kortste boog tussen het paar; Indirect: het antipode punt daarvan',
  directMidpoint: 'Direct',
  indirectMidpoint: 'Indirect',
  harmonicFamilyLabel: 'Familie',
  harmonicFamilyTooltip:
    'Addeys harmonische indeling: de kleinste verdeling van de cirkel waarvan dit aspect een veelvoud is (conjunctie H1, oppositie H2, driehoek H3, vierkant H4, kwintiel/bikwintiel H5, sextiel H6, halfvierkant/anderhalfvierkant H8, halfsextiel/quincunx H12)',
  harmonicFamilyFilterLabel: 'Aspectfamilie',
  allHarmonicFamilies: 'Alle harmonische families',
  harmonicFamilyOption: (family: string) => `H${family}`,
  fixedStarsCaption: 'Vaste sterren',
  fixedStarsScopeNote: (count: number, names: string) =>
    `Deze tabel controleert slechts ${count === 1 ? '1 ster' : `${String(count)} sterren`}: ${names}. Er wordt naar geen enkele andere vaste ster gezocht, dus een lege of korte lijst betekent niet dat er geen ster bij een planeet staat.`,
  derivedChartInterpretationNote: (chartKind: string) =>
    `Deze interpretatie past geboortehoroscoop-interpretaties toe op een afgeleide horoscoop (${chartKind}); beschouw haar als indicatief.`,

  almutenOfAscendantSentence: (names: string) => `Almuten van de Ascendant: ${names}`,
  almutenTooltip:
    'De almuten is de planeet met de meeste essentiële waardigheidspunten op een chartpunt — gevonden door elke waardigheid (heerschappij, exaltatie, triplicitair, grens/term, decanaat) die een planeet daar heeft te scoren en de hoogste totaalscore te nemen.',
  almutenTooltipLabel: 'Over de almuten',
  almutenScopeNote:
    'Dit is de almuten van de Ascendant, uitsluitend gescoord met essentiële waardigheidspunten (5/4/3/2/1 voor heerschappij, exaltatie, triplicitair, grens en decanaat, zoals in Lilly\u2019s fortitudes-tabel). Het omvat niet het planetaire uur of de prenatale syzygie die sommige auteurs toevoegen aan een Almuten Figuris.',
  almutenBreakdownCaption: 'Almuten-kandidaten',
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

  showOnChartColumn: 'Wiel',
  showOnChartButton: 'Toon',
  showSignColumn: 'Teken op wiel',
  showSignButton: 'Toon teken',
  showOnChart: (name: string) => `Toon ${name} op de horoscoop`,
  showOnWheel: (name: string) => `Toon ${name} op de wiel`,
  selectedOnChart: (what: string) => `Geselecteerd op de horoscoop: ${what}`,
  goToChart: 'Ga naar de horoscoop',
  comparisonLabel: 'Vergelijking',
  natalLabel: 'Natal',
  shapeTabLabel: 'Horoscoopvorm',
  wheelViewLabel: 'Wiel',
  aspectsViewLabel: 'Aspecten',
  matrixViewLabel: 'Aspectenmatrix',
  elementsViewLabel: 'Elementen & modaliteiten',
  emphasisCaption: 'Elementen en modaliteiten',
  emphasisHint:
    'Elk hemellichaam telt één keer mee, in het element en de modaliteit van het teken waarin het staat. De totalen staan rechts en onderaan.',
  emphasisElementLabel: 'Element',
  emphasisTotalLabel: 'Totaal',
  emphasisNone: '—',
  elementNames: { fire: 'Vuur', earth: 'Aarde', air: 'Lucht', water: 'Water' },
  modalityNames: { cardinal: 'Kardinaal', fixed: 'Vast', mutable: 'Veranderlijk' },
  matrixLabel: 'Aspectenmatrix: kies een paar om het op de horoscoop te tonen',
  matrixNameLabel: 'Naam',
  matrixFormulaLink: 'Aangepaste formulepunten: open ze in Uitgebreide instellingen',
  compareFormulaLink: 'Aangepaste formulepunten: open ze in Uitgebreide instellingen (Hemellichamen en orbs)',
  matrixHint:
    'Elke cel is het aspect tussen het hemellichaam van de rij en dat van de kolom. Het aspectsymbool wordt gevolgd door de orb in graden en door a voor toenemend of s voor afnemend; cellen zijn gekleurd per aspectfamilie.',
  placementsViewLabel: 'Plaatsingen',
  patternsViewLabel: 'Patronen & conditie',
  chartViewNavLabel: 'Navigatie grafiekweergave',
  chartViewSelectLabel: 'Grafiekweergave',
  chartActionsLabel: 'Grafiekacties',
  aspectPatternsHeading: 'Aspectconfiguraties',
  aspectPatternNames: {
    stellium: 'Stellium',
    'grand-trine': 'Grote driehoek',
    't-square': 'T-vierkant',
    'grand-cross': 'Groot kruis',
    yod: 'Yod',
    cradle: 'Wieg',
    'mystic-rectangle': 'Mystieke rechthoek',
    kite: 'Vlieger',
  },
  aspectPatternLine: (pattern: string, bodies: string, apex: string | undefined) =>
    apex === undefined ? `${pattern}: ${bodies}` : `${pattern}: ${bodies} (top ${apex})`,
  aspectPatternSeparator: ', ',
  noAspectPatterns: 'Geen aspectconfiguratie tussen de tien planeten met de geldende orbs.',
  aspectPatternsSourceNote:
    'Vormen zoals Astrolog 8.00 ze definieert, en de vlieger zoals Huber de vorm ervan beschrijft (Aspect Pattern Astrology, 2019). Astrolog kent de vlieger niet. In elke vorm komt de orb van elk aspect uit de orbinstellingen van Astraya, en Huber levert alleen de vorm van de vlieger. Een stellium is drie of vier planeten die onderling conjunct staan. Alleen de tien planeten, Zon tot Pluto, tellen mee: geen knopen, hoeken of asteroïden. Voor een Yod moet de quincunx aan staan in de orbinstellingen.',
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
  lunarPhaseKeyLabel: 'Maanfase',
  lunarPhaseValue: (phase: string, elongation: string, waxing: boolean, litPercent: number) =>
    `${phase} — ${elongation} voor op de Zon, ${waxing ? 'wassend' : 'afnemend'}, ${String(litPercent)}% verlicht`,

  sectKeyLabel: 'Sect',
  almutenKeyLabel: 'Almuten van de Ascendant',
  dayChart: 'Daghoroscoop',
  nightChart: 'Nachthoroscoop',

  pngSmall: 'Klein (600px)',
  pngMedium: 'Middel (1200px)',
  pngLarge: 'Groot (2400px)',

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

  thisPerson: 'deze persoon',
  thisPersonCapitalized: 'Deze persoon',
  personFallback: 'Persoon',
  chartFallback: 'Horoscoop',
  chartTitle: (type: string, name: string) => `${type} · ${name}`,
  natalFallback: 'Natal',
  notCompleteChart: (name: string) =>
    `Het geboorterecord van ${name} is niet volledig genoeg om een horoscoop te berekenen. Vul de ontbrekende velden in op de`,
  personPageLink: 'persoonspagina',

  isolationClear: 'Wissen',
  inspectorHeading: 'Selectie',
  inspectorEmpty: 'Selecteer een planeet, teken, huispunt of aspect om het te verkennen',
  selectionInterpretationHeading: 'Wat het betekent',
  selectionLoading: 'De interpretatie wordt geladen…',
  selectionUnavailable: 'De interpretatietekst kon niet worden geladen.',
  selectionMoreTitle: 'Meer betekenissen',
  selectionMoreSummary: (count: number) => `${String(count)} meer`,
  selectionShowAll: 'Toon alle betekenissen',
  selectionHideAll: 'Verberg betekenissen',
  signSectionHeading: 'Tekeninterpretatie',
  houseSectionHeading: 'Huisinterpretatie',
  degreeSectionHeading: 'Graad of Sabiaans symbool',
  dignityStateLabels: { ruler: 'Heerser (eigen teken)', exalted: 'Verheffing', detriment: 'Schade', fall: 'Val' },
  cuspHeading: (sign: string, house: number) => `${sign} op de cusp van huis ${String(house)}`,
  isolationSignEmpty: 'Geen planeten in dit teken.',
  isolationHouseEmpty: 'Geen planeten in dit huis.',
  wheelClickHint:
    'Klik op een planeet, teken of aspectlijn om die en zijn verbindingen uit te lichten. Klik nogmaals, of op een lege plek, om te wissen.',
};

export const chartViewMessages = { en, nl };
