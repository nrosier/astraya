/**
 * Message catalogue for the Charts page's chart types (`chart-sections.ts`'s `CHART_TYPES`): the names in
 * the header's Charts menu and in the type selector on the page.
 */
import type { ChartType } from './chart-sections.js';

const en = {
  chartsLabel: 'Charts',
  typeSelectorAriaLabel: 'Chart type',
  typeLabels: {
    natal: 'Natal',
    draconic: 'Draconic',
    harmonic: 'Harmonic',
    'solar-return': 'Solar return',
    'lunar-return': 'Lunar return',
  } satisfies Record<ChartType, string>,
};

const nl: typeof en = {
  chartsLabel: 'Horoscopen',
  typeSelectorAriaLabel: 'Soort horoscoop',
  typeLabels: {
    natal: 'Geboortehoroscoop',
    draconic: 'Draconisch',
    harmonic: 'Harmonisch',
    'solar-return': 'Zonneterugkeer',
    'lunar-return': 'Maanterugkeer',
  } satisfies Record<ChartType, string>,
};

export const chartTypesMessages = { en, nl };
