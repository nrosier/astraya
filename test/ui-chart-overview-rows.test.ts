/** Wording the chart overview (#691) the same way for the Report, the PDF and the consultation page. */
import { describe, expect, it } from 'vitest';
import type { ChartOverview } from '../src/domain/chart-overview.js';
import { chartOverviewRows } from '../src/ui/chart-overview-rows.js';

const OVERVIEW: ChartOverview = {
  sun: { sign: 2, longitude: 60 + 24 + 12 / 60 },
  moon: { sign: 7, longitude: 210 + 3 + 5 / 60 },
  ascendant: { sign: 10, longitude: 300 + 1 + 30 / 60 },
  chartRulers: ['saturn', 'uranus'],
  sect: 'day',
  elements: { fire: 2, earth: 3, air: 6, water: 4 },
  dominantElement: 'air',
  modalities: { cardinal: 4, fixed: 6, mutable: 5 },
  dominantModality: 'fixed',
  temperament: 'sanguine',
  dominantPlanet: 'saturn',
  dispositors: { chain: ['saturn', 'mercury', 'venus'], finalDispositor: undefined },
};

describe('chartOverviewRows (#691)', () => {
  it('words every fact in English, a cycle included', () => {
    expect(chartOverviewRows(OVERVIEW, 'en')).toEqual([
      { term: 'Sun', value: 'Gemini 24°12′' },
      { term: 'Moon', value: 'Scorpio 3°05′' },
      { term: 'Ascendant', value: 'Aquarius 1°30′' },
      { term: 'Chart ruler', value: 'Saturn and Uranus' },
      { term: 'Sect', value: 'Day chart' },
      { term: 'Elements', value: 'Fire 2, Earth 3, Air 6, Water 4; air leads' },
      { term: 'Modalities', value: 'Cardinal 4, Fixed 6, Mutable 5; fixed leads' },
      { term: 'Temperament', value: 'Sanguine' },
      { term: 'Dominant planet', value: 'Saturn' },
      { term: 'Final dispositor', value: 'None: the chain closes in a cycle' },
    ]);
  });

  it('words them in Dutch', () => {
    const rows = chartOverviewRows(OVERVIEW, 'nl');
    expect(rows.find((row) => row.term === 'Zon')?.value).toBe('Tweelingen 24°12′');
    expect(rows.find((row) => row.term === 'Horoscoopheerser')?.value).toBe('Saturnus en Uranus');
    expect(rows.find((row) => row.term === 'Sect')?.value).toBe('Daghoroscoop');
    expect(rows.find((row) => row.term === 'Temperament')?.value).toBe('Sanguinisch');
  });

  it('leaves out what an untimed chart cannot know, rather than showing it empty', () => {
    const untimed: ChartOverview = {
      ...OVERVIEW,
      ascendant: undefined,
      chartRulers: [],
      sect: undefined,
      dispositors: undefined,
    };
    const terms = chartOverviewRows(untimed, 'en').map((row) => row.term);
    expect(terms).not.toContain('Ascendant');
    expect(terms).not.toContain('Chart ruler');
    expect(terms).not.toContain('Sect');
    expect(terms).not.toContain('Final dispositor');
    expect(terms).toContain('Temperament');
  });
});
