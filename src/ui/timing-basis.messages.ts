/**
 * @module ui/timing-basis.messages
 * @purpose English/Dutch wording for the technique items a timing view appends to its calculation-basis line (#1059).
 * @conventions Each item names a choice the view itself offers (progression technique and MC method, primary-direction time key and semi-arc method); nothing here is a default the view does not read.
 * @exports timingBasisMessages
 */
import type { Locale } from '../interpretation/schema.js';

const en = {
  technique: { secondary: 'Secondary progression', tertiary: 'Tertiary progression', minor: 'Minor progression' },
  mcMethod: (method: string) => `${method} MC`,
  mcMethods: {
    quotidian: 'Quotidian',
    naibod: 'Naibod',
    solarArc: 'Solar arc',
    naibodRa: 'Naibod in RA',
    solarArcRa: 'True solar arc in RA',
  },
  angleMethods: {
    quotidian: 'angles recomputed at the progressed moment',
    naibod: 'angles shifted by the Naibod arc, in longitude',
    solarArc: 'angles shifted by the solar arc, in longitude',
    naibodRa: 'angles shifted by the Naibod arc, in right ascension',
    solarArcRa: 'angles shifted by the solar arc, in right ascension',
  },
  solarArc: 'Solar arc (the Sun’s progressed arc)',
  solarArcLongitude: 'directed in longitude only',
  solarArcDeclination: 'directed in declination',
  arcKinds: {
    solar: 'Solar arc (the Sun’s progressed arc)',
    ascendant: 'Ascendant arc (the progressed Ascendant’s arc)',
    vertex: 'Vertex arc (the progressed Vertex’s arc)',
  },
  arcMultipliers: { '1': '×1', '2': '×2', '0.5': '×0.5', '-1': '×−1', '-2': '×−2', '-0.5': '×−0.5' },
  arcConverse: 'converse (backwards in time)',
  arcAngleMc: 'MC by solar arc in longitude',
  directionWindow: '±1° of arc',
  directionKeys: { naibod: 'Naibod key', ptolemy: 'Ptolemy key', 'true-solar-arc': 'True solar arc in RA key' },
  directionMethods: { zodiacal: 'Placidus semi-arcs, in zodiaco', 'in-mundo': 'Placidus semi-arcs, in mundo' },
};

const nl: typeof en = {
  technique: { secondary: 'Secundaire progressie', tertiary: 'Tertiaire progressie', minor: 'Minorprogressie' },
  mcMethod: (method: string) => `${method} MC`,
  mcMethods: {
    quotidian: 'Quotidiaans',
    naibod: 'Naibod',
    solarArc: 'Zonneboog',
    naibodRa: 'Naibod in RK',
    solarArcRa: 'Ware zonneboog in RK',
  },
  angleMethods: {
    quotidian: 'hoeken herberekend op het progressieve moment',
    naibod: 'hoeken verschoven met de Naibod-boog, in lengte',
    solarArc: 'hoeken verschoven met de zonneboog, in lengte',
    naibodRa: 'hoeken verschoven met de Naibod-boog, in rechte klimming',
    solarArcRa: 'hoeken verschoven met de zonneboog, in rechte klimming',
  },
  solarArc: 'Zonneboog (de geprogresseerde boog van de Zon)',
  solarArcLongitude: 'alleen in lengte gedirigeerd',
  solarArcDeclination: 'in declinatie gedirigeerd',
  arcKinds: {
    solar: 'Zonneboog (de geprogresseerde boog van de Zon)',
    ascendant: 'Ascendantboog (de boog van de geprogresseerde Ascendant)',
    vertex: 'Vertexboog (de boog van de geprogresseerde Vertex)',
  },
  arcMultipliers: { '1': '×1', '2': '×2', '0.5': '×0,5', '-1': '×−1', '-2': '×−2', '-0.5': '×−0,5' },
  arcConverse: 'convers (terug in de tijd)',
  arcAngleMc: 'MC per zonneboog in lengte',
  directionWindow: '±1° boog',
  directionKeys: {
    naibod: 'Naibod-sleutel',
    ptolemy: 'Ptolemaeus-sleutel',
    'true-solar-arc': 'Ware zonneboog in RK-sleutel',
  },
  directionMethods: { zodiacal: 'Placidus-semiboog, in zodiaco', 'in-mundo': 'Placidus-semiboog, in mundo' },
};

export const timingBasisMessages: Record<Locale, typeof en> = { en, nl };
