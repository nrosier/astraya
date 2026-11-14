/**
 * @module AspectFamilyControls.messages
 * @purpose English/Dutch strings for the aspect-family filter above the wheel and the matrix (#1063).
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`.
 * @exports aspectFamilyControlsMessages
 */
import { aspectByKey } from '../astrology/aspects.js';
import { ASPECT_FAMILIES, type AspectFamilyKey } from './aspect-family-filter.js';

/** The `ASPECT_FAMILIES` keys of one group, so the group label names what the filter holds (#1532). */
function groupKeys(key: AspectFamilyKey): readonly string[] {
  return ASPECT_FAMILIES.find((family) => family.key === key)?.aspectKeys ?? [];
}

/** Dutch names of the aspects, keyed by `ASPECTS` key. */
const dutchNames: Readonly<Record<string, string>> = {
  conjunction: 'conjunctie',
  sextile: 'sextiel',
  square: 'kwadraat',
  trine: 'driehoek',
  opposition: 'oppositie',
  semisquare: 'halfkwadraat',
  sesquiquadrate: 'anderhalfkwadraat',
  quincunx: 'quincunx',
  semisextile: 'halfsextiel',
  quintile: 'quintiel',
  biquintile: 'biquintiel',
  decile: 'deciel',
  septile: 'septiel',
  novile: 'noniel',
};

const englishName = (key: string): string => aspectByKey(key)?.name.toLowerCase() ?? key;
const dutchName = (key: string): string => dutchNames[key] ?? key;

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
    major: `Major: ${groupKeys('major').map(englishName).join(', ')}`,
    hardMinor: `Hard minor: ${groupKeys('hardMinor').map(englishName).join(', ')}`,
    softMinor: `Soft minor: ${groupKeys('softMinor').map(englishName).join(', ')}`,
    higherHarmonic: `Higher harmonic: ${groupKeys('higherHarmonic').map(englishName).join(', ')}`,
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
    major: `Hoofdaspecten: ${groupKeys('major').map(dutchName).join(', ')}`,
    hardMinor: `Harde nevenaspecten: ${groupKeys('hardMinor').map(dutchName).join(', ')}`,
    softMinor: `Zachte nevenaspecten: ${groupKeys('softMinor').map(dutchName).join(', ')}`,
    higherHarmonic: `Hogere harmonieken: ${groupKeys('higherHarmonic').map(dutchName).join(', ')}`,
    nodalAngular: 'Knopen en hoeken: contacten met de knopen, hoeken, Vertex en Fortuin',
  },
};

export const aspectFamilyControlsMessages = { en, nl };
