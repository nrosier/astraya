/**
 * Message catalogue for the Charts page's chart types (`chart-sections.ts`'s `CHART_TYPES`): the names in
 * the type selector on the page.
 */
/**
 * @module ChartTypes.messages
 * @purpose English/Dutch i18n strings naming each chart type (natal, draconic, harmonic, heliocentric, solar/lunar return, relocated) for the type selector.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages(chartTypesMessages)`; `nl` is typed as `typeof en`.
 * @exports chartTypesMessages
 */
import type { ChartType } from './chart-sections.js';

const en = {
  typeSelectorLabel: 'Chart type',
  compareNatalOnly: 'Comparison is available on the natal chart only.',
  typeLabels: {
    natal: 'Natal',
    draconic: 'Draconic',
    harmonic: 'Harmonic',
    heliocentric: 'Heliocentric',
    'solar-return': 'Solar return',
    'lunar-return': 'Lunar return',
    'lunar-phase-return': 'Lunar phase return',
    'rise-set': 'Rise/set',
    relocated: 'Relocated',
  } satisfies Record<ChartType, string>,
};

const nl: typeof en = {
  typeSelectorLabel: 'Soort horoscoop',
  compareNatalOnly: 'Vergelijken kan alleen bij de geboortehoroscoop.',
  typeLabels: {
    natal: 'Geboortehoroscoop',
    draconic: 'Draconisch',
    harmonic: 'Harmonisch',
    heliocentric: 'Heliocentrisch',
    'solar-return': 'Zonneterugkeer',
    'lunar-return': 'Maanterugkeer',
    'lunar-phase-return': 'Maanfaseterugkeer',
    'rise-set': 'Op- en ondergang',
    relocated: 'Verplaatst',
  } satisfies Record<ChartType, string>,
};

export const chartTypesMessages = { en, nl };
