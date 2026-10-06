/**
 * Message catalogue for `ExtendedSettingsPanel.tsx` (#158, #442).
 */
const en = {
  heading: 'Extended settings',
  triggerChanged: (count: string) => `${count} changed`,
  closeLabel: 'Close without applying',
  scopeNote:
    'These settings draw the natal chart and the solar and lunar returns. Draconic and harmonic charts, transits and synastry do not use them.',

  presetLabel: 'Starting point',
  presetOptions: {
    custom: 'Custom',
    modern: 'Modern Western',
    traditional: 'Traditional / Hellenistic',
    vedic: 'Vedic (Jyotish)',
  },
  presetNotes: {
    custom: 'Your own combination. Choose a starting point to fill the zodiac, houses, points and rulers in one go.',
    modern: 'Tropical zodiac, Placidus houses, modern rulers, the default points and aspects.',
    traditional:
      'Tropical zodiac, Whole Sign houses, traditional rulers, the Part of Fortune shown, no Chiron and no minor aspects. Orbs are left as they are: traditional orbs depend on the planet and are not set here.',
    vedic:
      'Sidereal zodiac with the Lahiri ayanamsa, Whole Sign houses, traditional rulers, no Chiron and no minor aspects. The node model and the orbs are left as they are.',
  },
  presetRulership: (scheme: string) => `Applying it also sets the planetary rulers to ${scheme} on this device.`,
  rulershipNames: { modern: 'Modern', traditional: 'Traditional', both: 'Both' },

  appliesOnApply: 'Applies when you choose “Apply and redraw”.',
  savedOnDevice: 'Saved on this device and applied at once.',

  zodiacHousesLegend: 'Chart frame',
  houseSystemLegend: 'House system',
  systemLabel: 'House system',
  zodiacLegend: 'Starting point',
  tropical: 'Tropical',
  sidereal: 'Sidereal',
  ayanamsaLabel: 'Ayanamsa',
  zodiacFrameSubtitle: 'How the zodiac and houses are calculated',
  tropicalDescription:
    'The Tropical zodiac is fixed to the seasons. The vernal equinox (Spring) is always at 0° Aries, regardless of where the background stars have moved. This is the standard in Western astrology and most popular software.',
  siderealDescription:
    'The Sidereal zodiac is fixed to the background stars as they are now. Because the stars have precessed about 24° since the tropical zodiac was defined, your Sun sign in sidereal astrology is typically one sign earlier than in tropical (e.g., Western Aries becomes Pisces in sidereal). This is the standard in Vedic astrology.',
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
  chiron: 'Chiron',
  midpoints: 'Midpoints (ASC/MC, Sun/Moon)',
  aspectsToChiron: 'Draw aspects to Chiron',
  lilithModelAriaLabel: 'Lilith model',
  lilithLabel: 'Lilith (the lunar apogee):',
  lilithHelp:
    'Also called Black Moon Lilith. Mean is the smooth average position, true is the actual position of the apogee, interpolated is a smoothed version of the true one.',
  aspectsToLilith: 'Draw aspects to Lilith',
  mean: 'Mean',
  true: 'True',
  interpolated: 'Interpolated',
  lunarNodeModelAriaLabel: 'Lunar node model',
  lunarNodesLabel: 'Lunar nodes:',
  nodeHelp: 'Mean and true differ by up to about 1.5°.',
  aspectsToLunarNodes: 'Draw aspects to the lunar nodes',
  aspectsToHint: "Aspects to the Part of Fortune, Vertex, Ascendant and Midheaven aren't supported yet.",

  aspectsLegend: 'Aspects and orbs',
  scaleLabel: 'Orb scale: ',
  orbScaleAriaLabel: 'Orb scale',
  orbPreview: (major: string, majorLuminary: string, sextile: string, sextileLuminary: string, minor: string) =>
    `Orbs now: major aspects ${major}° (${majorLuminary}° with a luminary), sextile ${sextile}° (${sextileLuminary}°), minor aspects ${minor}°.`,
  minorAspectsLegend: 'Minor aspects',

  wheelLegend: 'Wheel colours',
  rainbowColorZodiac: 'Rainbow Color Zodiac',

  deviceLegend: 'On this device',

  applyButton: 'Apply and redraw',
  nothingChanged: 'nothing has changed',
  cancelButton: 'Cancel',
  resetToDefaultsButton: 'Reset to defaults',

  summary: {
    tropical: 'Tropical',
    sidereal: (ayanamsa: string) => `Sidereal (${ayanamsa})`,
    orbs: (percent: string) => `Orbs ${percent}%`,
    minorAspects: (count: string) => `${count} minor aspects`,
    fortune: 'Part of Fortune',
    vertex: 'Vertex',
    chironHidden: 'Chiron hidden',
    midpoints: 'Midpoints',
    lilith: (model: string) => `Lilith ${model}`,
    node: (model: string) => `Nodes ${model}`,
    aspectsTo: 'Extra aspects',
    rainbow: 'Rainbow zodiac',
  },
};

const nl: typeof en = {
  heading: 'Uitgebreide instellingen',
  triggerChanged: (count: string) => `${count} gewijzigd`,
  closeLabel: 'Sluiten zonder toe te passen',
  scopeNote:
    'Deze instellingen bepalen de geboortehoroscoop en de zonne- en maanterugkeer. Draconische en harmonische horoscopen, transits en synastrie gebruiken ze niet.',

  presetLabel: 'Beginpunt',
  presetOptions: {
    custom: 'Eigen keuze',
    modern: 'Modern westers',
    traditional: 'Traditioneel / Hellenistisch',
    vedic: 'Vedisch (Jyotish)',
  },
  presetNotes: {
    custom:
      'Je eigen combinatie. Kies een beginpunt om dierenriem, huizen, punten en heersers in één keer in te vullen.',
    modern: 'Tropische dierenriem, Placidus-huizen, moderne heersers, de standaardpunten en -aspecten.',
    traditional:
      'Tropische dierenriem, Whole Sign-huizen, traditionele heersers, het Fortuna-punt zichtbaar, geen Chiron en geen kleine aspecten. De orbs blijven zoals ze zijn: traditionele orbs hangen af van de planeet en worden hier niet ingesteld.',
    vedic:
      'Siderische dierenriem met de Lahiri-ayanamsa, Whole Sign-huizen, traditionele heersers, geen Chiron en geen kleine aspecten. Het knoopmodel en de orbs blijven zoals ze zijn.',
  },
  presetRulership: (scheme: string) => `Toepassen zet ook de planeetheersers op ${scheme} op dit apparaat.`,
  rulershipNames: { modern: 'modern', traditional: 'traditioneel', both: 'beide' },

  appliesOnApply: 'Wordt toegepast met “Toepassen en opnieuw tekenen”.',
  savedOnDevice: 'Opgeslagen op dit apparaat en direct toegepast.',

  zodiacHousesLegend: 'Grondvlak',
  houseSystemLegend: 'Huizensysteem',
  systemLabel: 'Huizensysteem',
  zodiacLegend: 'Beginpunt',
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
  chiron: 'Chiron',
  midpoints: 'Middelpunten (ASC/MC, Zon/Maan)',
  aspectsToChiron: 'Aspecten naar Chiron tekenen',
  lilithModelAriaLabel: 'Lilith-model',
  lilithLabel: 'Lilith (de maanapogeum):',
  lilithHelp:
    'Ook Zwarte Maan Lilith genoemd. Gemiddeld is de vloeiende gemiddelde stand, waar is de werkelijke stand van het apogeum, geïnterpoleerd is een gladgestreken versie van de ware stand.',
  aspectsToLilith: 'Aspecten naar Lilith tekenen',
  mean: 'Gemiddeld',
  true: 'Waar',
  interpolated: 'Geïnterpoleerd',
  lunarNodeModelAriaLabel: 'Maansknoop-model',
  lunarNodesLabel: 'Maansknopen:',
  nodeHelp: 'Gemiddeld en waar verschillen tot ongeveer 1,5°.',
  aspectsToLunarNodes: 'Aspecten naar de maansknopen tekenen',
  aspectsToHint: 'Aspecten naar het Fortuna-punt, Vertex, Ascendant en Midheaven worden nog niet ondersteund.',

  aspectsLegend: 'Aspecten en orbs',
  scaleLabel: 'Orb-schaal: ',
  orbScaleAriaLabel: 'Orb-schaal',
  orbPreview: (major: string, majorLuminary: string, sextile: string, sextileLuminary: string, minor: string) =>
    `Orbs nu: hoofdaspecten ${major}° (${majorLuminary}° met een lichtgever), sextiel ${sextile}° (${sextileLuminary}°), kleine aspecten ${minor}°.`,
  minorAspectsLegend: 'Kleine aspecten',

  wheelLegend: 'Wielkleuren',
  rainbowColorZodiac: 'Regenboogkleuren-dierenriem',

  deviceLegend: 'Op dit apparaat',

  applyButton: 'Toepassen en opnieuw tekenen',
  nothingChanged: 'er is niets gewijzigd',
  cancelButton: 'Annuleren',
  resetToDefaultsButton: 'Terugzetten naar standaard',

  summary: {
    tropical: 'Tropisch',
    sidereal: (ayanamsa: string) => `Siderisch (${ayanamsa})`,
    orbs: (percent: string) => `Orbs ${percent}%`,
    minorAspects: (count: string) => `${count} kleine aspecten`,
    fortune: 'Fortuna-punt',
    vertex: 'Vertex',
    chironHidden: 'Chiron verborgen',
    midpoints: 'Middelpunten',
    lilith: (model: string) => `Lilith ${model}`,
    node: (model: string) => `Knopen ${model}`,
    aspectsTo: 'Extra aspecten',
    rainbow: 'Regenboogdierenriem',
  },
};

export const extendedSettingsPanelMessages = { en, nl };
