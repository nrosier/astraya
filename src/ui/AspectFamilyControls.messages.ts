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
  families: {
    major: 'Major: conjunction, sextile, square, trine, opposition',
    hardMinor: 'Hard minor: semisquare, sesquiquadrate, quincunx, semisextile',
    softMinor: 'Soft minor: quintile, biquintile',
    nodalAngular: 'Nodal and angular: contacts to the nodes, angles, Vertex and Fortune',
  },
};

const nl: typeof en = {
  familyLabel: 'Getoonde aspecten',
  allAspects: 'Alle aspecten',
  customFamilies: 'Gekozen families',
  families: {
    major: 'Hoofdaspecten: conjunctie, sextiel, kwadraat, driehoek, oppositie',
    hardMinor: 'Harde nevenaspecten: halfkwadraat, anderhalfkwadraat, quincunx, halfsextiel',
    softMinor: 'Zachte nevenaspecten: quintiel, biquintiel',
    nodalAngular: 'Knopen en hoeken: contacten met de knopen, hoeken, Vertex en Fortuin',
  },
};

export const aspectFamilyControlsMessages = { en, nl };
