/**
 * @module ui/calculation-basis.messages
 * @purpose English/Dutch wording for the calculation-basis line on calculated pages.
 * @conventions Ruler and orb-profile names come from the rulership and Extended settings messages, not repeated here.
 * @exports calculationBasisMessages
 */
import type { Locale } from '../interpretation/schema.js';

const en = {
  line: (zodiac: string, houses: string, node: string, rulers: string, orbs: string) =>
    `${zodiac} · ${houses} · ${node} · ${rulers} · ${orbs}`,
  wholeSign: 'Whole-sign houses',
  meanNode: 'Mean node',
  trueNode: 'True node',
  tropical: 'Tropical',
  sidereal: 'Sidereal',
  siderealUser: 'Sidereal (user-defined)',
  rulers: (title: string) => `${title} rulers`,
  orbs: (title: string) => `${title} orbs`,
  draconic: 'Draconic',
  relocatedTo: (place: string) => `Relocated to ${place}`,
  midpointMethod: 'Midpoint method',
  davisonMethod: 'Davison method',
};

const nl: typeof en = {
  line: (zodiac: string, houses: string, node: string, rulers: string, orbs: string) =>
    `${zodiac} · ${houses} · ${node} · ${rulers} · ${orbs}`,
  wholeSign: 'Hele-tekenhuizen',
  meanNode: 'Gemiddelde maansknoop',
  trueNode: 'Ware maansknoop',
  tropical: 'Tropisch',
  sidereal: 'Siderisch',
  siderealUser: 'Siderisch (zelf bepaald)',
  rulers: (title: string) => `${title} heersers`,
  orbs: (title: string) => `${title} orbs`,
  draconic: 'Draconisch',
  relocatedTo: (place: string) => `Verplaatst naar ${place}`,
  midpointMethod: 'Middelpuntmethode',
  davisonMethod: 'Davison-methode',
};

export const calculationBasisMessages: Record<Locale, typeof en> = { en, nl };
