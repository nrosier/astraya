/** The Charts page's types and views as the URL carries them (`chart-sections.ts`, #511). */
import { describe, expect, it } from 'vitest';
import { CHART_TYPES, chartHref, chartTypeFromHash, chartViewFromHash, isChartType } from '../src/ui/chart-sections.js';
import { chartTypesMessages } from '../src/ui/ChartTypes.messages.js';

const ID = 'p-abc';

describe('chartHref', () => {
  it('needs no query for the natal wheel', () => {
    expect(chartHref(ID)).toBe(`#/chart/${ID}`);
    expect(chartHref(ID, 'wheel', 'natal')).toBe(`#/chart/${ID}`);
  });

  it('carries the type and the view, in that order, leaving out the defaults', () => {
    expect(chartHref(ID, undefined, 'draconic')).toBe(`#/chart/${ID}?type=draconic`);
    expect(chartHref(ID, 'aspects')).toBe(`#/chart/${ID}?view=aspects`);
    expect(chartHref(ID, 'aspects', 'solar-return')).toBe(`#/chart/${ID}?type=solar-return&view=aspects`);
  });

  it('reads back what it wrote', () => {
    for (const type of CHART_TYPES) {
      const hash = chartHref(ID, 'placements', type);
      expect(chartViewFromHash(hash)).toBe('placements');
      expect(chartTypeFromHash(hash)).toBe(type === 'natal' ? undefined : type);
    }
  });
});

describe('chart types', () => {
  it('recognises only the known ones', () => {
    expect(isChartType('harmonic')).toBe(true);
    expect(isChartType('composite')).toBe(false);
    expect(chartTypeFromHash(`#/chart/${ID}?type=composite`)).toBeUndefined();
    expect(chartTypeFromHash(`#/chart/${ID}`)).toBeUndefined();
  });

  it('has a label in both languages for every type', () => {
    for (const locale of ['en', 'nl'] as const) {
      for (const type of CHART_TYPES) expect(chartTypesMessages[locale].typeLabels[type]).not.toBe('');
    }
  });
});
