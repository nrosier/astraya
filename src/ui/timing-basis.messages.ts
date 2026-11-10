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
  mcMethods: { quotidian: 'Quotidian', naibod: 'Naibod', solarArc: 'Solar arc' },
  angleMethods: {
    quotidian: 'angles recomputed at the progressed moment',
    naibod: 'angles shifted by the Naibod arc, in longitude',
    solarArc: 'angles shifted by the solar arc, in longitude',
  },
  solarArc: 'Solar arc (the Sun’s progressed arc)',
  solarArcLongitude: 'directed in longitude only',
  directionWindow: '±1° of arc',
  directionKeys: { naibod: 'Naibod key', ptolemy: 'Ptolemy key' },
  directionMethods: { zodiacal: 'Placidus semi-arcs, in zodiaco', 'in-mundo': 'Placidus semi-arcs, in mundo' },
};

const nl: typeof en = {
  technique: { secondary: 'Secundaire progressie', tertiary: 'Tertiaire progressie', minor: 'Minorprogressie' },
  mcMethod: (method: string) => `${method} MC`,
  mcMethods: { quotidian: 'Quotidiaans', naibod: 'Naibod', solarArc: 'Zonneboog' },
  angleMethods: {
    quotidian: 'hoeken herberekend op het progressieve moment',
    naibod: 'hoeken verschoven met de Naibod-boog, in lengte',
    solarArc: 'hoeken verschoven met de zonneboog, in lengte',
  },
  solarArc: 'Zonneboog (de geprogresseerde boog van de Zon)',
  solarArcLongitude: 'alleen in lengte gedirigeerd',
  directionWindow: '±1° boog',
  directionKeys: { naibod: 'Naibod-sleutel', ptolemy: 'Ptolemaeus-sleutel' },
  directionMethods: { zodiacal: 'Placidus-semiboog, in zodiaco', 'in-mundo': 'Placidus-semiboog, in mundo' },
};

export const timingBasisMessages: Record<Locale, typeof en> = { en, nl };
