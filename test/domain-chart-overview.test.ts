/** One chart overview for the consultation page, the Report and the PDF (#691), against the real ephemeris. */
import { describe, expect, it } from 'vitest';
import { bodyById, bodyByKey } from '../src/astrology/bodies.js';
import { dispositorChain } from '../src/astrology/dispositors.js';
import { primaryRulerOf, rulersOf } from '../src/astrology/rulership.js';
import { signIndex } from '../src/astrology/signs.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { chartOverview, dominantOf, ELEMENT_ORDER } from '../src/domain/chart-overview.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const keyOf = (id: number): string => bodyById(id)?.key ?? '';

describe('chartOverview (#691)', () => {
  it('states the big three, chart ruler, sect and dispositor chain from the chart itself', async () => {
    const chart = await computeChartData(NATAL, await getEngine());
    const overview = chartOverview(chart, 'traditional');
    const sun = chart.positions.find((position) => position.body === bodyByKey('sun')?.id);
    expect(overview.sun).toEqual({ sign: signIndex(sun?.longitude ?? NaN), longitude: sun?.longitude });
    expect(overview.ascendant?.sign).toBe(signIndex(chart.houses.ascendant));
    const ascendantSign = signIndex(chart.houses.ascendant);
    expect(overview.chartRulers).toEqual(rulersOf(ascendantSign, 'traditional').map(keyOf));
    expect(overview.sect).toBe(chart.sect);
    const positions = new Map(chart.positions.map((position) => [position.body, position.longitude]));
    const chain = dispositorChain(primaryRulerOf(ascendantSign, 'traditional'), positions, 'traditional');
    expect(overview.dispositors?.chain).toEqual(chain.chain.map(keyOf));
  });

  it('counts every position once per element and modality and names the humour of the dominant element', async () => {
    const chart = await computeChartData(NATAL, await getEngine());
    const overview = chartOverview(chart, 'modern');
    const total = (balance: Readonly<Record<string, number>>): number =>
      Object.values(balance).reduce((sum, value) => sum + value, 0);
    expect(total(overview.elements)).toBe(chart.positions.length);
    expect(total(overview.modalities)).toBe(chart.positions.length);
    expect(overview.dominantElement).toBe(dominantOf(overview.elements, ELEMENT_ORDER));
    const humour = { fire: 'choleric', earth: 'melancholic', air: 'sanguine', water: 'phlegmatic' } as const;
    expect(overview.temperament).toBe(humour[overview.dominantElement]);
  });

  it('breaks a tie toward the earlier element, as the Report always has', () => {
    expect(dominantOf({ fire: 3, earth: 3, air: 1, water: 3 }, ELEMENT_ORDER)).toBe('fire');
    expect(dominantOf({ fire: 1, earth: 2, air: 4, water: 4 }, ELEMENT_ORDER)).toBe('air');
  });

  it('leaves the time-dependent facts out without a usable birth time', async () => {
    const chart = await computeChartData(NATAL, await getEngine());
    const untimed = { ...chart, houses: { ...chart.houses, ascendant: Number.NaN } };
    const overview = chartOverview(untimed, 'modern');
    expect(overview.ascendant).toBeUndefined();
    expect(overview.chartRulers).toEqual([]);
    expect(overview.sect).toBeUndefined();
    expect(overview.dispositors).toBeUndefined();
    expect(overview.sun).toBeDefined();
  });
});
