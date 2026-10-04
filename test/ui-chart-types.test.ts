/** The Charts page's types and sections as the URL carries them (`chart-sections.ts`). */
import { describe, expect, it } from 'vitest';
import {
  CHART_TYPES,
  chartHref,
  chartSectionFromHash,
  chartTypeFromHash,
  isChartType,
} from '../src/ui/chart-sections.js';
import { chartTypesMessages } from '../src/ui/ChartTypes.messages.js';

const ID = 'p-abc';

describe('chartHref', () => {
  it('needs no query for the natal wheel', () => {
    expect(chartHref(ID)).toBe(`#/chart/${ID}`);
    expect(chartHref(ID, 'chart', 'natal')).toBe(`#/chart/${ID}`);
  });

  it('carries the type and the section, in that order, leaving out the defaults', () => {
    expect(chartHref(ID, undefined, 'draconic')).toBe(`#/chart/${ID}?type=draconic`);
    expect(chartHref(ID, 'aspects')).toBe(`#/chart/${ID}?section=aspects`);
    expect(chartHref(ID, 'aspects', 'solar-return')).toBe(`#/chart/${ID}?type=solar-return&section=aspects`);
  });

  it('reads back what it wrote', () => {
    for (const type of CHART_TYPES) {
      const hash = chartHref(ID, 'houses', type);
      expect(chartSectionFromHash(hash)).toBe('houses');
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
