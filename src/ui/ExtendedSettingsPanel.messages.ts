/**
 * Message catalogue for `ExtendedSettingsPanel.tsx` (#158, #442).
 */
/**
 * @module ExtendedSettingsPanel.messages
 * @purpose English/Dutch i18n strings for the chart's Extended Settings modal: presets, zodiac/house-system/body/aspect/wheel-colour controls, and their explanatory text.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by ExtendedSettingsPanel.tsx via `useMessages(extendedSettingsPanelMessages)`; `nl` is typed as `typeof en`.
 * @exports extendedSettingsPanelMessages
 */
const en = {
  heading: 'Extended settings',
  triggerChanged: (count: string) => `${count} changed`,
  closeLabel: 'Close without applying',
  scopeNote:
    'These settings draw the natal chart and the solar and lunar returns. Draconic and harmonic charts, transits and synastry do not use them.',

  presetLabel: 'Calculation profile',
  presetOptions: {
    custom: 'Custom',
    'modern-western-v1': 'Modern Western',
    'traditional-western-v1': 'Traditional Western',
    'sidereal-lahiri-v1': 'Sidereal (Lahiri)',
  },
  presetNotes: {
    custom: 'Your own combination. Choose a built-in profile to replace every value it owns in one go.',
    'modern-western-v1':
      'Tropical zodiac, Placidus houses, modern rulers, Chiron shown, Fortune and Vertex hidden, five major aspects, mean node and Lilith, standard orbs.',
    'traditional-western-v1':
      'Tropical zodiac, Whole Sign houses, traditional rulers, the Part of Fortune shown, no Chiron, five major aspects, mean node and Lilith, standard orbs.',
    'sidereal-lahiri-v1':
      'Sidereal zodiac with the Lahiri ayanamsa, Whole Sign houses, traditional rulers, no Chiron or Fortune, five major aspects, mean node and Lilith, standard orbs.',
  },
  presetRulership: (scheme: string) => `Applying it also sets the planetary rulers to ${scheme}.`,
  rulershipNames: { modern: 'Modern', traditional: 'Traditional', both: 'Both' },

  appliesOnApply: 'Applies when you choose “Apply and redraw”.',
  devicePreview: 'Shown at once, kept when you apply or save, and put back by Cancel.',

  zodiacHousesLegend: 'Chart frame',
  houseSystemLegend: 'House system',
  systemLabel: 'House system',
  zodiacLegend: 'Zodiac',
  tropical: 'Tropical',
  sidereal: 'Sidereal',
  ayanamsaLabel: 'Ayanamsa',
  zodiacFrameSubtitle: 'How the zodiac and houses are calculated',
  tropicalDescription:
    'The Tropical zodiac is fixed to the seasons. The vernal equinox (Spring) is always at 0° Aries, regardless of where the background stars have moved. This is the standard in Western astrology and most popular software.',
  siderealDescription:
    'The Sidereal zodiac is fixed to the background stars as they are now. Because the stars have precessed about 24° since the tropical zodiac was defined, your Sun sign in sidereal astrology is typically one sign earlier than in tropical (e.g., Western Aries becomes Pisces in sidereal). This is the coordinate system Vedic (Jyotish) astrology uses — but choosing it here only changes which zodiac longitudes are measured against; it does not add Vimshottari dasha timing, planetary yoga detection, or any other Jyotish-specific technique, none of which this app computes.',
  houseSystemDescription: (system: string) => {
    const descriptions: Record<string, string> = {
      placidus:
        'Placidus (the default) divides the MC-to-IC meridian into three equal times, then projects those times onto the ecliptic. It is the most traditional and widely used system in Western astrology.',
      koch: 'Koch divides the MC-to-IC meridian in time and space together, accounting for the diurnal motion at your latitude. It is popular for very high-latitude births where Placidus breaks down.',
      whole_sign:
        'Whole Sign places each cusp at the beginning of a zodiac sign, so each house spans exactly 30°. It is the ancient system used in classical and Vedic astrology.',
      equal_house:
        'Equal House divides the ecliptic into 12 equal 30° sections starting from the ascendant. It is simple and was used in classical astrology; popular with modern psychological and esoteric practitioners.',
      regiomontanus:
        'Regiomontanus divides the equator into 12 equal parts and projects onto the ecliptic. It is an older European tradition, useful at high latitudes, and the basis for some classical interpretation texts.',
    };
    return (
      descriptions[system] ??
      "This house system calculates cusps using a specific mathematical method. Check the system's documentation for details."
    );
  },

  rulersLegend: 'Rulership & dignities',
  rulersSubtitle: 'Which planets rule which zodiac signs',
  modernRulersDescription:
    'Modern rulership includes the trans-Saturnian planets (Uranus rules Aquarius, Neptune rules Pisces, Pluto rules Scorpio) discovered in the last 300 years. This is standard in 20th/21st-century Western astrology. Affects dispositors, essential dignities, profections, and chart interpretation.',
  traditionalRulersDescription:
    'Traditional rulership uses only the seven classical planets visible to the naked eye (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn). Aquarius and Pisces are co-ruled by Saturn, and Scorpio by Mars. This reflects pre-telescope astrology and is foundational to medieval and classical systems.',
  coRulersDescription:
    'Co-rulers shows both classical and modern rulerships simultaneously—each sign has two rulers (e.g., Aquarius has both Saturn and Uranus). This hybrid approach lets you see how rulerships have evolved and compare traditional and modern interpretations side by side.',
  symbolsFrameSubtitle: 'How planetary and zodiac symbols are displayed',
  unicodeSymbolsDescription:
    "Display symbols as Unicode text characters (♅, ♇, ☿, etc.). This uses the font's built-in glyphs and is fast and lightweight, but appearance depends on your font.",
  drawnSymbolsDescription:
    'Display symbols as hand-rolled SVG paths. This gives consistent appearance across all devices and allows fine-tuning of line weight and form variants (e.g., Uranus and Pluto have alternate shapes).',
  textSymbolsDescription:
    "Display symbols as letter codes (♅ becomes 'U', ♇ becomes 'P', etc.). This is compact and always legible, but loses visual distinctiveness.",
  lineWeightLabel: 'Line weight',
  lineWeightAvailableWhen: '(Only available when Symbols is set to "Drawn")',
  fineWeightDescription: 'Fine lines: delicate, minimal visual weight. Good for dense charts or small screens.',
  regularWeightDescription: 'Regular lines (default): balanced between visibility and elegance.',
  boldWeightDescription:
    'Bold lines: thick, prominent strokes. Good for large printed charts or low-vision accessibility.',

  bodiesLegend: 'Bodies and points',
  partOfFortune: 'Part of Fortune',
  vertex: 'Vertex',
  spirit: 'Part of Spirit',
  chiron: 'Chiron',
  // nl wording pending native review (#560)
  vertexHelp:
    'The vertex is the point where the ecliptic crosses the prime vertical in the west. It is often read as a point of encounter with significant others.',
  spiritHelp:
    'Also called the Lot of Spirit or Daemonic Point. It is calculated as the mirror of the Part of Fortune and is used as a traditional lot in some practices.',
  chironHelp:
    'Chiron is a small body discovered in 1977, with an orbit between Saturn and Uranus. Astrologers often use it to describe wounds and healing themes.',
  midpoints: 'Midpoints (ASC/MC, Sun/Moon)',
  objectVisibleLabel: (name: string) => `${name} — visible`,
  objectParticipatesLabel: (name: string) => `${name} — participates in aspects`,
  objectInterpretedLabel: (name: string) => `${name} — included in the written report`,
  groupAll: 'All',
  groupClear: 'Clear',
  objectPresetLabel: 'Object visibility preset',
  objectPresetOptions: {
    custom: 'Custom',
    core: 'Core',
    traditional: 'Traditional',
    all: 'All',
  },
  objectPresetNotes: {
    custom:
      'Your own combination. Choosing a preset replaces every object’s visibility and aspect participation in one go.',
    core: 'Shows and aspects only the Sun, Moon, Mercury, Venus and Mars — a tight set for a quick read.',
    traditional:
      'Shows and aspects the seven classical planets (Sun through Saturn) plus the Part of Fortune and Part of Spirit; everything else hidden and silent.',
    all: 'Shows and aspects every supported body and point.',
  },
  objectVisibleCount: (visible: string, total: string) => `${visible} of ${total} objects visible.`,
  planetsGroupLabel: 'Planets',
  pointsGroupLabel: 'Points',
  lilithModelAriaLabel: 'Lilith model',
  lilithLabel: 'Lilith (the lunar apogee):',
  lilithObjectName: 'Lilith (the lunar apogee)',
  lilithHelp:
    'Also called Black Moon Lilith. Mean is the smooth average position, true is the actual position of the apogee, interpolated is a smoothed version of the true one.',
  mean: 'Mean',
  true: 'True',
  interpolated: 'Interpolated',
  lunarNodeModelAriaLabel: 'Lunar node model',
  lunarNodesLabel: 'Lunar nodes:',
  lunarNodesObjectName: 'Lunar nodes',
  nodeHelp: 'Mean and true differ by up to about 1.5°.',
  minorPlanetsLegend: 'Minor planets (Swiss Ephemeris asteroid elements)',
  aspectsToHint:
    'The Ascendant and Midheaven always aspect the bodies. The Vertex and the two parts do so here, to bodies only, never to each other or the angles; a part is not aspected to the luminary it is built from, as that repeats an Ascendant aspect.',
  antiscia: 'Show antiscia and contra-antiscia on the wheel',
  antisciaHint: 'Draws one chord for each visible antiscion or contra-antiscion contact within the orb below.',
  antisciaMaxOrbLabel: 'Antiscia orb',
  antisciaMaxOrbDecreaseLabel: 'Decrease antiscia orb',
  antisciaMaxOrbIncreaseLabel: 'Increase antiscia orb',
  declination: 'Show parallels and contraparallels on the wheel',
  declinationHint:
    'Draws one chord for each visible declination contact within the orb below. It is unavailable for synthetic charts without a real declination.',
  declinationMaxOrbLabel: 'Declination orb',
  declinationMaxOrbDecreaseLabel: 'Decrease declination orb',
  declinationMaxOrbIncreaseLabel: 'Increase declination orb',
  dial90: 'Midpoint tree (90° dial)',
  dial90Hint:
    'Adds a 90° dial beside the wheel and lists every body sitting within the orb below of another pair’s midpoint, collapsed so conjunction, square and opposition hits are all caught.',
  midpointTreeOrbLabel: 'Midpoint tree orb',
  midpointTreeOrbDecreaseLabel: 'Decrease midpoint tree orb',
  midpointTreeOrbIncreaseLabel: 'Increase midpoint tree orb',

  motionLegend: 'Station window and motion score',
  motionHint:
    'Both are off by default. Neither changes the Almuten or any other score, and both only add to the tables.',
  stationWindowLabel: 'Station window (Astraya convention)',
  stationWindowKLabel: 'Window fraction k',
  stationWindowKDecreaseLabel: 'Decrease window fraction k',
  stationWindowKIncreaseLabel: 'Increase window fraction k',
  stationWindowHint:
    'Astraya convention, not a cited rule: Avelar & Ribeiro give the mean speeds (pp. 59–60) but no threshold for a station. A planet is stationary when its speed, ignoring sign, is at most k times its mean daily speed. The default is 0.05. Stationary planets show St.1 for a first station and St.2 for a second.',
  motionScoreLabel: 'Show the motion score on the condition table',
  motionScoreHint:
    'Direct +4, retrograde −5, with a first station scored as retrograde and a second as direct. Fast +2 and slow −2 against mean speed. Avelar & Ribeiro, p. 197. The Sun and Moon get the speed points only. Uranus, Neptune and Pluto get no score.',

  schemeLegend: 'Traditional scheme',
  schemeHint:
    'A named scheme sets the bound (term) table and orb scale together, as one coherent historical choice, rather than letting them be mixed arbitrarily. Choosing one here also sets the orb profile below; the two can still be adjusted independently afterward, which shows as Custom.',
  schemeLabel: 'Scheme',
  schemeOptions: { custom: 'Custom' },
  schemeNotes: { custom: 'Your own combination of bound table and orb scale, set independently below.' },

  aspectsLegend: 'Aspects and orbs',
  orbProfileLabel: 'Orb profile',
  orbProfileOptions: {
    custom: 'Custom',
    'standard-v1': 'Standard',
    'tight-v1': 'Tight',
    'wide-v1': 'Wide',
  },
  citedOrbPresetOptions: {
    'lilly-1647-first-v1': 'Lilly (1647), first column',
    'lilly-1647-second-v1': 'Lilly (1647), second column',
  },
  citedOrbPresetNotes: {
    'lilly-1647-first-v1':
      'William Lilly’s own orbs per planet, Christian Astrology (1647), Book I, p. 107: Saturn 10°, Jupiter 12°, Mars 7°30′, Sun 17°, Venus 8°, Mercury 7°, Moon 12°30′. Two planets are in aspect within half of each orb added together. Uranus, Neptune and Pluto have no orb of his, so they use the standard tiers. For the Ascendant, each planet’s contact uses that planet’s own half-orb (Lilly, Book II, p. 208: “within the moyity of his owne Orbs”). Astraya extends the same rule to the Midheaven, Vertex, Part of Fortune and Part of Spirit; that extension is not Lilly’s. A body without a half-orb uses the standard tiers for these points.',
    'lilly-1647-second-v1':
      'Lilly’s second set, same page: Saturn 9°, Jupiter 9°, Mars 7°, Sun 15°, Venus 7°, Mercury 7°, Moon 12°. Two planets are in aspect within half of each orb added together. Uranus, Neptune and Pluto use the standard tiers. For the Ascendant, each planet’s contact uses that planet’s own half-orb (Lilly, Book II, p. 208: “within the moyity of his owne Orbs”). Astraya extends the same rule to the Midheaven, Vertex, Part of Fortune and Part of Spirit; that extension is not Lilly’s. A body without a half-orb uses the standard tiers for these points.',
  },
  orbProfileNotes: {
    custom: 'Your own orb scale, set with the slider below.',
    'standard-v1': "This app's long-standing default tiers, unscaled.",
    'tight-v1': 'The standard tiers scaled down by half — only the closest, most clearly active contacts.',
    'wide-v1': 'The standard tiers scaled up by 40% — catches looser, still-forming contacts too.',
  },
  scaleLabel: 'Orb scale: ',
  orbScaleAriaLabel: 'Orb scale',
  orbPreview: (major: string, majorLuminary: string, sextile: string, sextileLuminary: string, minor: string) =>
    `Orbs now: major aspects ${major}° (${majorLuminary}° with a luminary), sextile ${sextile}° (${sextileLuminary}°), minor aspects ${minor}°.`,
  orbRulesInvalid:
    'Check the orb rules: each orb must be a number from 0° to 30°. Apply is unavailable until they are.',
  applyFailed:
    "These settings could not be saved, so the chart is unchanged. Try Apply again; if it keeps failing, check this device's storage.",
  minorAspectsLegend: 'Minor aspects',

  wheelLegend: 'Wheel colours',
  rainbowColorZodiac: 'Rainbow Color Zodiac',

  applyButton: 'Apply and redraw',
  nothingChanged: 'nothing has changed',
  saveAsDefaultButton: 'Save as my default',
  saveAsDefaultHint: 'Applies to every new chart on this device.',
  cancelButton: 'Cancel',
  resetToMyDefaultButton: 'Reset to my default',
  resetToAstrayaDefaultButton: 'Reset to Astraya default',

  summary: {
    tropical: 'Tropical',
    sidereal: (ayanamsa: string) => `Sidereal (${ayanamsa})`,
    orbs: (percent: string) => `Orbs ${percent}%`,
    orbRules: 'Own orb rules',
    boundsScheme: (scheme: string) => `${scheme} bounds`,
    minorAspects: (count: string) => `${count} minor aspects`,
    objectPolicies: 'Object visibility customized',
    midpoints: 'Midpoints',
    lilith: (model: string) => `Lilith ${model}`,
    node: (model: string) => `Nodes ${model}`,
    rainbow: 'Rainbow zodiac',
    stationWindow: (k: string) => `Station window k ${k} (Astraya convention)`,
    motionScore: 'Motion score',
  },
};

const nl: typeof en = {
  heading: 'Uitgebreide instellingen',
  triggerChanged: (count: string) => `${count} gewijzigd`,
  closeLabel: 'Sluiten zonder toe te passen',
  scopeNote:
    'Deze instellingen bepalen de geboortehoroscoop en de zonne- en maanterugkeer. Draconische en harmonische horoscopen, transits en synastrie gebruiken ze niet.',

  presetLabel: 'Berekeningsprofiel',
  presetOptions: {
    custom: 'Eigen keuze',
    'modern-western-v1': 'Modern westers',
    'traditional-western-v1': 'Traditioneel westers',
    'sidereal-lahiri-v1': 'Siderisch (Lahiri)',
  },
  presetNotes: {
    custom: 'Je eigen combinatie. Kies een ingebouwd profiel om elke waarde die het bepaalt in één keer te vervangen.',
    'modern-western-v1':
      'Tropische dierenriem, Placidus-huizen, moderne heersers, Chiron zichtbaar, Fortuna en Vertex verborgen, vijf hoofdaspecten, gemiddelde maansknoop en Lilith, standaardorbs.',
    'traditional-western-v1':
      'Tropische dierenriem, Whole Sign-huizen, traditionele heersers, het Fortuna-punt zichtbaar, geen Chiron, vijf hoofdaspecten, gemiddelde maansknoop en Lilith, standaardorbs.',
    'sidereal-lahiri-v1':
      'Siderische dierenriem met de Lahiri-ayanamsa, Whole Sign-huizen, traditionele heersers, geen Chiron of Fortuna, vijf hoofdaspecten, gemiddelde maansknoop en Lilith, standaardorbs.',
  },
  presetRulership: (scheme: string) => `Toepassen zet ook de planeetheersers op ${scheme}.`,
  rulershipNames: { modern: 'modern', traditional: 'traditioneel', both: 'beide' },

  appliesOnApply: 'Wordt toegepast met “Toepassen en opnieuw tekenen”.',
  devicePreview: 'Direct zichtbaar, behouden bij toepassen of opslaan en teruggezet door Annuleren.',

  zodiacHousesLegend: 'Grondvlak',
  houseSystemLegend: 'Huizensysteem',
  systemLabel: 'Huizensysteem',
  zodiacLegend: 'Dierenriem',
  tropical: 'Tropisch',
  sidereal: 'Siderisch',
  ayanamsaLabel: 'Ayanamsa',
  zodiacFrameSubtitle: 'Hoe de dierenriem en huizen worden berekend',
  tropicalDescription:
    'De Tropische dierenriem is vastgesteld aan de seizoenen. Het voorjaarsevenwicht (Lente) is altijd 0° Boogschutter, ongeacht waar de achtergrondsterren zijn verschoven. Dit is de standaard in westerse astrologie en de meeste populaire software.',
  siderealDescription:
    'De Siderische dierenriem is vastgesteld aan de achtergrondsterren zoals ze nu zijn. Omdat de sterren ongeveer 24° zijn voorgeprecessed sinds de tropische dierenriem werd gedefinieerd, je Zonneteken in siderische astrologie is meestal één teken eerder dan in tropische (bijv. westerse Boogschutter wordt Waterman in siderisch). Dit is de standaard in Vedische astrologie.',
  houseSystemDescription: (system: string) => {
    const descriptions: Record<string, string> = {
      placidus:
        'Placidus (de standaard) verdeelt de MC-naar-IC-meridiaan in drie gelijke tijden en projecteert die tijden dan op de ecliptica. Het is het meest traditionele en veel gebruikte systeem in westerse astrologie.',
      koch: 'Koch verdeelt de MC-naar-IC-meridiaan in tijd en ruimte samen, rekening houdend met de dagelijkse beweging op uw breedtegraad. Het is populair voor zeer noordelijke geboorten waar Placidus faalt.',
      whole_sign:
        'Whole Sign plaatst elke cusp aan het begin van een dierenriemteken, dus elk huis beslaat precies 30°. Het is het oude systeem dat in klassieke en Vedische astrologie wordt gebruikt.',
      equal_house:
        'Equal House verdeelt de ecliptica in 12 gelijke 30°-secties vanaf het ascendant. Het is eenvoudig en werd in klassieke astrologie gebruikt; populair bij moderne psychologische en esoterische beoefenaars.',
      regiomontanus:
        'Regiomontanus verdeelt de evenaar in 12 gelijke delen en projecteert op de ecliptica. Het is een oudere Europese traditie, nuttig op hoge breedtegraden, en de basis voor enkele klassieke interpretatieteksten.',
    };
    return (
      descriptions[system] ??
      'Dit huizensysteem berekent cuspen met behulp van een specifieke wiskundige methode. Raadpleeg de documentatie van het systeem voor details.'
    );
  },

  rulersLegend: 'Heersers & waardigheid',
  rulersSubtitle: 'Welke planeten heersen over welke dierenriemtekens',
  modernRulersDescription:
    'Moderne heersers omvatten de trans-Saturniaanse planeten (Uranus regeert Waterman, Neptunus regeert Vissen, Plutt regeert Schorpioen) ontdekt in de afgelopen 300 jaar. Dit is standaard in 20e/21e-eeuwse westerse astrologie. Beïnvloedt dispositors, essentiële waardigheid, profecties en grafiekinterpretatie.',
  traditionalRulersDescription:
    'Traditionele heersers gebruikt alleen de zeven klassieke planeten zichtbaar voor het blote oog (Zon, Maan, Mercurius, Venus, Mars, Jupiter, Saturnus). Waterman en Vissen worden door Saturnus meergekoppeld, en Schorpioen door Mars. Dit weerspiegelt astrologie vóór de telescoop en is fundamenteel voor middeleeuwse en klassieke systemen.',
  coRulersDescription:
    'Co-heersers toont zowel klassieke als moderne heersers tegelijkertijd - elk teken heeft twee heersers (bijv. Waterman heeft zowel Saturnus als Uranus). Deze hybride benadering stelt u in staat om te zien hoe heersers zich hebben ontwikkeld en traditionele en moderne interpretaties naast elkaar te vergelijken.',
  symbolsFrameSubtitle: 'Hoe planetaire en dierenriemrubrieken worden weergegeven',
  unicodeSymbolsDescription:
    'Symbolen weergeven als Unicode-teksttekens (♅, ♇, ☿, enz.). Dit gebruikt de ingebouwde glyphen van het lettertype en is snel en licht, maar het uiterlijk is afhankelijk van uw lettertype.',
  drawnSymbolsDescription:
    'Symbolen weergeven als SVG-paden met de hand getekend. Dit biedt een consistent uiterlijk op alle apparaten en maakt fijnafstelling van lijngewicht en formvarianten mogelijk (bijv. Uranus en Plutt hebben alternatieve vormen).',
  textSymbolsDescription:
    "Symbolen weergeven als lettercodes (♅ wordt 'U', ♇ wordt 'P', enz.). Dit is compact en altijd leesbaar, maar verliest visuele distinctiviteit.",
  lineWeightLabel: 'Lijngewicht',
  lineWeightAvailableWhen: '(Alleen beschikbaar als Symbolen is ingesteld op "Getekend")',
  fineWeightDescription:
    'Fijne lijnen: delicaat, minimaal visueel gewicht. Goed voor dichte grafieken of kleine schermen.',
  regularWeightDescription: 'Normale lijnen (standaard): gebalanceerd tussen zichtbaarheid en elegantie.',
  boldWeightDescription:
    'Vette lijnen: dikke, opvallende lijnen. Goed voor grote afgedrukte grafieken of toegankelijkheid voor slechtzienden.',

  bodiesLegend: 'Hemellichamen en punten',
  partOfFortune: 'Fortuna-punt',
  vertex: 'Vertex',
  spirit: 'Lot van de Geest',
  chiron: 'Chiron',
  // nl wording pending native review (#560)
  vertexHelp:
    'Het vertex is het punt waar de ecliptica de primaire verticaal in het westen snijdt. Het wordt vaak gelezen als een punt van ontmoeting met belangrijke anderen.',
  spiritHelp:
    'Ook wel het Lot van de Geest of Daemonisch Punt genoemd. Het wordt berekend als spiegel van het Lot van Fortuna en wordt in sommige praktijken als traditioneel lot gebruikt.',
  chironHelp:
    "Chiron is een klein hemellichaam, ontdekt in 1977, met een baan tussen Saturnus en Uranus. Astrologen gebruiken het vaak om thema's van wonden en heling te beschrijven.",
  midpoints: 'Middelpunten (ASC/MC, Zon/Maan)',
  objectVisibleLabel: (name: string) => `${name} — zichtbaar`,
  objectParticipatesLabel: (name: string) => `${name} — doet mee in aspecten`,
  objectInterpretedLabel: (name: string) => `${name} — opgenomen in het geschreven rapport`,
  groupAll: 'Alles',
  groupClear: 'Wissen',
  objectPresetLabel: 'Voorinstelling objectzichtbaarheid',
  objectPresetOptions: {
    custom: 'Aangepast',
    core: 'Kern',
    traditional: 'Traditioneel',
    all: 'Alles',
  },
  objectPresetNotes: {
    custom:
      'Uw eigen combinatie. Een voorinstelling kiezen vervangt in één keer de zichtbaarheid en aspectdeelname van elk object.',
    core: 'Toont en aspecteert alleen de Zon, Maan, Mercurius, Venus en Mars — een beknopte set voor een snelle blik.',
    traditional:
      'Toont en aspecteert de zeven klassieke planeten (Zon tot en met Saturnus) plus het Deel van Fortuin en het Deel van de Geest; al het andere verborgen en stil.',
    all: 'Toont en aspecteert elk ondersteund lichaam en punt.',
  },
  objectVisibleCount: (visible: string, total: string) => `${visible} van ${total} objecten zichtbaar.`,
  planetsGroupLabel: 'Planeten',
  pointsGroupLabel: 'Punten',
  lilithModelAriaLabel: 'Lilith-model',
  lilithLabel: 'Lilith (de maanapogeum):',
  lilithObjectName: 'Lilith (de maanapogeum)',
  lilithHelp:
    'Ook Zwarte Maan Lilith genoemd. Gemiddeld is de vloeiende gemiddelde stand, waar is de werkelijke stand van het apogeum, geïnterpoleerd is een gladgestreken versie van de ware stand.',
  mean: 'Gemiddeld',
  true: 'Waar',
  interpolated: 'Geïnterpoleerd',
  lunarNodeModelAriaLabel: 'Maansknoop-model',
  lunarNodesLabel: 'Maansknopen:',
  lunarNodesObjectName: 'Maansknopen',
  nodeHelp: 'Gemiddeld en waar verschillen tot ongeveer 1,5°.',
  minorPlanetsLegend: 'Kleine planeten (asteroïde-elementen van Swiss Ephemeris)',
  aspectsToHint:
    'De Ascendant en het Midheaven maken altijd aspecten met de lichamen. De Vertex en de twee punten doen dat hier, alleen met lichamen, nooit met elkaar of met de assen; een punt maakt geen aspect met het lichtgevend lichaam waaruit het is opgebouwd, omdat dat een Ascendant-aspect herhaalt.',
  antiscia: 'Antiscia en contra-antiscia op het wiel tonen',
  antisciaHint: 'Tekent één koord voor elk zichtbaar antiscion- of contra-antiscioncontact binnen de orb hieronder.',
  antisciaMaxOrbLabel: 'Antiscia-orb',
  antisciaMaxOrbDecreaseLabel: 'Antiscia-orb verkleinen',
  antisciaMaxOrbIncreaseLabel: 'Antiscia-orb vergroten',
  declination: 'Parallellen en contraparallellen op het wiel tonen',
  declinationHint:
    'Tekent één koord voor elk zichtbaar declinatiecontact binnen de orb hieronder. Niet beschikbaar voor synthetische horoscopen zonder reële declinatie.',
  declinationMaxOrbLabel: 'Declinatie-orb',
  declinationMaxOrbDecreaseLabel: 'Declinatie-orb verkleinen',
  declinationMaxOrbIncreaseLabel: 'Declinatie-orb vergroten',
  dial90: 'Middelpuntenboom (90°-dial)',
  dial90Hint:
    'Voegt een 90°-dial naast het wiel toe en toont elk lichaam dat binnen de orb hieronder op het middelpunt van een ander paar valt, samengevouwen zodat conjunctie, vierkant en oppositie allemaal worden gevonden.',
  midpointTreeOrbLabel: 'Orb voor de middelpuntenboom',
  midpointTreeOrbDecreaseLabel: 'Orb voor de middelpuntenboom verkleinen',
  midpointTreeOrbIncreaseLabel: 'Orb voor de middelpuntenboom vergroten',

  motionLegend: 'Stationsvenster en bewegingsscore',
  motionHint:
    'Beide staan standaard uit. Geen van beide verandert de almuten of een andere score, en ze voegen alleen iets toe aan de tabellen.',
  stationWindowLabel: 'Stationsvenster (Astraya-conventie)',
  stationWindowKLabel: 'Vensterfractie k',
  stationWindowKDecreaseLabel: 'Vensterfractie k verlagen',
  stationWindowKIncreaseLabel: 'Vensterfractie k verhogen',
  stationWindowHint:
    'Astraya-conventie, geen geciteerde regel: Avelar & Ribeiro geven de gemiddelde snelheden (blz. 59–60) maar geen drempel voor een station. Een planeet is stationair wanneer haar snelheid, zonder teken, hoogstens k keer haar gemiddelde dagsnelheid is. De standaard is 0,05. Stationaire planeten tonen St.1 voor een eerste station en St.2 voor een tweede.',
  motionScoreLabel: 'De bewegingsscore tonen in de condities-tabel',
  motionScoreHint:
    'Direct +4, retrograde −5, waarbij een eerste station als retrograde en een tweede als direct telt. Snel +2 en traag −2 ten opzichte van de gemiddelde snelheid. Avelar & Ribeiro, blz. 197. De zon en de maan krijgen alleen de snelheidspunten. Uranus, Neptunus en Pluto krijgen geen score.',

  schemeLegend: 'Traditioneel schema',
  schemeHint:
    'Een benoemd schema stelt de bound-tabel (term) en orb-schaal samen in, als één coherente historische keuze, in plaats van ze willekeurig te laten mengen. Het kiezen hier stelt ook het orb-profiel hieronder in; beide kunnen daarna nog onafhankelijk worden aangepast, wat als Eigen keuze wordt getoond.',
  schemeLabel: 'Schema',
  schemeOptions: { custom: 'Eigen keuze' },
  schemeNotes: { custom: 'Je eigen combinatie van bound-tabel en orb-schaal, apart hieronder ingesteld.' },

  aspectsLegend: 'Aspecten en orbs',
  orbProfileLabel: 'Orb-profiel',
  orbProfileOptions: {
    custom: 'Eigen keuze',
    'standard-v1': 'Standaard',
    'tight-v1': 'Strak',
    'wide-v1': 'Ruim',
  },
  citedOrbPresetOptions: {
    'lilly-1647-first-v1': 'Lilly (1647), eerste kolom',
    'lilly-1647-second-v1': 'Lilly (1647), tweede kolom',
  },
  citedOrbPresetNotes: {
    'lilly-1647-first-v1':
      'De eigen orbissen per planeet van William Lilly, Christian Astrology (1647), Boek I, p. 107: Saturnus 10°, Jupiter 12°, Mars 7°30′, Zon 17°, Venus 8°, Mercurius 7°, Maan 12°30′. Twee planeten staan in aspect binnen de helft van elke orbis bij elkaar opgeteld. Uranus, Neptunus en Pluto hebben geen orbis van hem, dus gebruiken ze de standaardtiers. Voor de Ascendant gebruikt het contact van elke planeet de eigen halve orbis van die planeet (Lilly, Boek II, p. 208: “within the moyity of his owne Orbs”). Astraya past dezelfde regel toe op het Midheaven, de Vertex, het Fortuinpunt en het Geestpunt; die uitbreiding is niet van Lilly. Een lichaam zonder halve orbis gebruikt voor deze punten de standaardtiers.',
    'lilly-1647-second-v1':
      'Lilly’s tweede reeks, zelfde pagina: Saturnus 9°, Jupiter 9°, Mars 7°, Zon 15°, Venus 7°, Mercurius 7°, Maan 12°. Twee planeten staan in aspect binnen de helft van elke orbis bij elkaar opgeteld. Uranus, Neptunus en Pluto gebruiken de standaardtiers. Voor de Ascendant gebruikt het contact van elke planeet de eigen halve orbis van die planeet (Lilly, Boek II, p. 208: “within the moyity of his owne Orbs”). Astraya past dezelfde regel toe op het Midheaven, de Vertex, het Fortuinpunt en het Geestpunt; die uitbreiding is niet van Lilly. Een lichaam zonder halve orbis gebruikt voor deze punten de standaardtiers.',
  },
  orbProfileNotes: {
    custom: 'Je eigen orb-schaal, ingesteld met de schuifregelaar hieronder.',
    'standard-v1': 'De langlopende standaardtiers van deze app, ongeschaald.',
    'tight-v1': 'De standaardtiers op de helft geschaald — alleen de dichtstbijzijnde, duidelijk actieve contacten.',
    'wide-v1': 'De standaardtiers met 40% opgeschaald — vangt ook lossere, nog vormende contacten.',
  },
  scaleLabel: 'Orb-schaal: ',
  orbScaleAriaLabel: 'Orb-schaal',
  orbPreview: (major: string, majorLuminary: string, sextile: string, sextileLuminary: string, minor: string) =>
    `Orbs nu: hoofdaspecten ${major}° (${majorLuminary}° met een lichtgever), sextiel ${sextile}° (${sextileLuminary}°), kleine aspecten ${minor}°.`,
  orbRulesInvalid:
    'Controleer de orbisregels: elke orbis moet een getal van 0° tot 30° zijn. Toepassen kan pas als ze kloppen.',
  applyFailed:
    'Deze instellingen konden niet worden opgeslagen, dus het horoscoop is niet veranderd. Probeer Toepassen opnieuw; lukt het nog steeds niet, controleer dan de opslag van dit apparaat.',
  minorAspectsLegend: 'Kleine aspecten',

  wheelLegend: 'Wielkleuren',
  rainbowColorZodiac: 'Regenboogkleuren-dierenriem',

  applyButton: 'Toepassen en opnieuw tekenen',
  nothingChanged: 'er is niets gewijzigd',
  saveAsDefaultButton: 'Opslaan als mijn standaard',
  saveAsDefaultHint: 'Geldt voor elke nieuwe grafiek op dit apparaat.',
  cancelButton: 'Annuleren',
  resetToMyDefaultButton: 'Terugzetten naar mijn standaard',
  resetToAstrayaDefaultButton: 'Terugzetten naar Astraya-standaard',

  summary: {
    tropical: 'Tropisch',
    sidereal: (ayanamsa: string) => `Siderisch (${ayanamsa})`,
    orbs: (percent: string) => `Orbs ${percent}%`,
    orbRules: 'Eigen orbisregels',
    boundsScheme: (scheme: string) => `${scheme} bounds`,
    minorAspects: (count: string) => `${count} kleine aspecten`,
    objectPolicies: 'Zichtbaarheid van objecten aangepast',
    midpoints: 'Middelpunten',
    lilith: (model: string) => `Lilith ${model}`,
    node: (model: string) => `Knopen ${model}`,
    rainbow: 'Regenboogdierenriem',
    stationWindow: (k: string) => `Stationsvenster k ${k} (Astraya-conventie)`,
    motionScore: 'Bewegingsscore',
  },
};

export const extendedSettingsPanelMessages = { en, nl };
