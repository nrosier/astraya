/**
 * @module AspectFamilyControls.messages
 * @purpose English/Dutch strings for the aspect-family filter above the wheel and the matrix (#1063).
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`.
 * @exports aspectFamilyControlsMessages
 */
const en = {
  familyLabel: 'Aspects shown',
  allAspects: 'All aspects',
  customFamilies: 'Chosen families',
  presetLabel: 'Consultation preset',
  noPreset: 'No preset (default view)',
  presets: {
    standardOverview: 'Standard overview: major and nodal and angular, orbs 8 and 6',
    natalCore: 'Natal and core temperament: major and parallels, orbs 7 and 5',
    predictiveTiming: 'Predictive and timing: major and hard minor',
    dynamicSynastry: 'Dynamic synastry: major and nodal and angular, orb 6',
  },
  families: {
    major: 'Major: conjunction, sextile, square, trine, opposition',
    hardMinor: 'Hard minor: semisquare, sesquiquadrate, quincunx, semisextile',
    softMinor: 'Soft minor: quintile, biquintile',
    higherHarmonic: 'Higher harmonic: decile, septile, novile',
    nodalAngular: 'Nodal and angular: contacts to the nodes, angles, Vertex and Fortune',
  },
};

const nl: typeof en = {
  familyLabel: 'Getoonde aspecten',
  allAspects: 'Alle aspecten',
  customFamilies: 'Gekozen families',
  presetLabel: 'Consultatiepreset',
  noPreset: 'Geen preset (standaardweergave)',
  presets: {
    standardOverview: 'Standaardoverzicht: hoofdaspecten en knopen en hoeken, orbs 8 en 6',
    natalCore: 'Geboortehoroscoop en kerntemperament: hoofdaspecten en parallellen, orbs 7 en 5',
    predictiveTiming: 'Voorspelling en timing: hoofdaspecten en harde nevenaspecten',
    dynamicSynastry: 'Dynamische synastrie: hoofdaspecten en knopen en hoeken, orb 6',
  },
  families: {
    major: 'Hoofdaspecten: conjunctie, sextiel, kwadraat, driehoek, oppositie',
    hardMinor: 'Harde nevenaspecten: halfkwadraat, anderhalfkwadraat, quincunx, halfsextiel',
    softMinor: 'Zachte nevenaspecten: quintiel, biquintiel',
    higherHarmonic: 'Hogere harmonieken: deciel, septiel, noniel',
    nodalAngular: 'Knopen en hoeken: contacten met de knopen, hoeken, Vertex en Fortuin',
  },
};

export const aspectFamilyControlsMessages = { en, nl };
