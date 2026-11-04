/**
 * @module ui/calculation-basis.messages
 * @purpose English/Dutch wording for the calculation-basis line on calculated pages.
 * @conventions Ruler and orb-profile names come from the rulership and Extended settings messages, not repeated here. `sources` words the saved-default comparison of `calculationSource`.
 * @exports calculationBasisMessages
 */
import type { Locale } from '../interpretation/schema.js';

const en = {
  line: (zodiac: string, houses: string, rulers: string, orbs: string) => `${zodiac} · ${houses} · ${rulers} · ${orbs}`,
  wholeSign: 'Whole-sign houses',
  tropical: 'Tropical',
  sidereal: 'Sidereal',
  rulers: (title: string) => `${title} rulers`,
  orbs: (title: string) => `${title} orbs`,
  draconic: 'Draconic',
  relocatedTo: (place: string) => `Relocated to ${place}`,
  midpointMethod: 'Midpoint method',
  sources: {
    'astraya-default': 'Astraya default',
    'my-default': 'your saved default',
    'this-chart': 'changed for this chart',
  },
};

const nl: typeof en = {
  line: (zodiac: string, houses: string, rulers: string, orbs: string) => `${zodiac} · ${houses} · ${rulers} · ${orbs}`,
  wholeSign: 'Hele-tekenhuizen',
  tropical: 'Tropisch',
  sidereal: 'Siderisch',
  rulers: (title: string) => `${title} heersers`,
  orbs: (title: string) => `${title} orbs`,
  draconic: 'Draconisch',
  relocatedTo: (place: string) => `Verplaatst naar ${place}`,
  midpointMethod: 'Middelpuntmethode',
  sources: {
    'astraya-default': 'Astraya-standaard',
    'my-default': 'jouw opgeslagen standaard',
    'this-chart': 'aangepast voor deze horoscoop',
  },
};

export const calculationBasisMessages: Record<Locale, typeof en> = { en, nl };
