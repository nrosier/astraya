/**
 * @module ui/chart-overview.messages
 * @purpose English/Dutch terms for the chart overview (#691) shown by the Report, the PDF and the consultation page.
 * @conventions Co-located `{ en, nl }` catalogue with exact key parity; element, modality and day/night words come from ChartView.messages so every screen names them alike.
 * @exports chartOverviewMessages
 */
const en = {
  heading: 'At a glance',
  sun: 'Sun',
  moon: 'Moon',
  ascendant: 'Ascendant',
  chartRuler: 'Chart ruler',
  sect: 'Sect',
  elements: 'Elements',
  modalities: 'Modalities',
  temperament: 'Temperament',
  temperaments: { choleric: 'Choleric', melancholic: 'Melancholic', sanguine: 'Sanguine', phlegmatic: 'Phlegmatic' },
  dominantPlanet: 'Dominant planet',
  finalDispositor: 'Final dispositor',
  noFinalDispositor: 'None: the chain closes in a cycle',
  placement: (sign: string, degree: string) => `${sign} ${degree}`,
  balance: (counts: string, leading: string) => `${counts}; ${leading} leads`,
  listSeparator: ', ',
  rulerSeparator: ' and ',
};

const nl: typeof en = {
  heading: 'In één oogopslag',
  sun: 'Zon',
  moon: 'Maan',
  ascendant: 'Ascendant',
  chartRuler: 'Horoscoopheerser',
  sect: 'Sect',
  elements: 'Elementen',
  modalities: 'Modaliteiten',
  temperament: 'Temperament',
  temperaments: {
    choleric: 'Cholerisch',
    melancholic: 'Melancholisch',
    sanguine: 'Sanguinisch',
    phlegmatic: 'Flegmatisch',
  },
  dominantPlanet: 'Dominante planeet',
  finalDispositor: 'Uiteindelijke dispositor',
  noFinalDispositor: 'Geen: de keten sluit in een kringloop',
  placement: (sign, degree) => `${sign} ${degree}`,
  balance: (counts, leading) => `${counts}; ${leading} overheerst`,
  listSeparator: ', ',
  rulerSeparator: ' en ',
};

export const chartOverviewMessages = { en, nl };
