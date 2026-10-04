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

  zodiacHousesLegend: 'Zodiac and houses',
  houseSystemLegend: 'House system',
  systemLabel: 'House system',
  zodiacLegend: 'Zodiac',
  tropical: 'Tropical',
  sidereal: 'Sidereal',
  ayanamsaLabel: 'Ayanamsa',

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

  zodiacHousesLegend: 'Dierenriem en huizen',
  houseSystemLegend: 'Huizensysteem',
  systemLabel: 'Huizensysteem',
  zodiacLegend: 'Dierenriem',
  tropical: 'Tropisch',
  sidereal: 'Siderisch',
  ayanamsaLabel: 'Ayanamsa',

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
