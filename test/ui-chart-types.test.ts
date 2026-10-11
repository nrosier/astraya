/** The Charts page's types and views as the URL carries them (`chart-sections.ts`, #511). */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { CHART_TYPES, isChartType } from '../src/ui/chart-sections.js';
import { chartHref, parseRoute } from '../src/ui/route.js';
import { chartTypesMessages } from '../src/ui/ChartTypes.messages.js';

const ID = newId('p');

describe('chartHref', () => {
  it('names the type and the view in the path, natal and wheel by default', () => {
    expect(chartHref(ID)).toBe(`#/people/${ID}/charts/natal/wheel`);
    expect(chartHref(ID, 'wheel', 'natal')).toBe(`#/people/${ID}/charts/natal/wheel`);
    expect(chartHref(ID, undefined, 'draconic')).toBe(`#/people/${ID}/charts/draconic/wheel`);
    expect(chartHref(ID, 'aspects')).toBe(`#/people/${ID}/charts/natal/aspects`);
    expect(chartHref(ID, 'aspects', 'solar-return')).toBe(`#/people/${ID}/charts/solar-return/aspects`);
  });

  it('reads back what it wrote', () => {
    for (const type of CHART_TYPES) {
      const route = parseRoute(chartHref(ID, 'placements', type));
      expect(route).toEqual({ kind: 'chart', personId: ID, chartType: type, view: 'placements' });
    }
  });
});

describe('chart types', () => {
  it('recognises only the known ones', () => {
    expect(isChartType('harmonic')).toBe(true);
    expect(isChartType('composite')).toBe(false);
  });

  it('has a label in both languages for every type', () => {
    for (const locale of ['en', 'nl'] as const) {
      for (const type of CHART_TYPES) expect(chartTypesMessages[locale].typeLabels[type]).not.toBe('');
    }
  });
});
