/**
 * Message catalogue for the Charts page's chart types (`chart-sections.ts`'s `CHART_TYPES`): the names in
 * the header's Charts menu and in the type selector on the page.
 */
/**
 * @module ChartTypes.messages
 * @purpose English/Dutch i18n strings naming each chart type (natal, draconic, harmonic, solar/lunar return) for the Charts menu and type selector.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages(chartTypesMessages)`; `nl` is typed as `typeof en`.
 * @exports chartTypesMessages
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
