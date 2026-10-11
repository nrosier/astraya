/**
 * @module ui/calculation-basis.messages
 * @purpose English/Dutch wording for the calculation-basis line on chart pages.
 * @conventions Profile names come from the Extended settings messages, not repeated here.
 * @exports calculationBasisMessages
 */
import type { Locale } from '../interpretation/schema.js';

const en = {
  line: (profile: string, source: string) => `Calculation profile: ${profile} — ${source}`,
  sources: {
    'astraya-default': 'Astraya default',
    'my-default': 'your saved default',
    'this-chart': 'changed for this chart',
  },
};

const nl: typeof en = {
  line: (profile: string, source: string) => `Berekeningsprofiel: ${profile} — ${source}`,
  sources: {
    'astraya-default': 'Astraya-standaard',
    'my-default': 'jouw opgeslagen standaard',
    'this-chart': 'aangepast voor deze horoscoop',
  },
};

export const calculationBasisMessages: Record<Locale, typeof en> = { en, nl };
