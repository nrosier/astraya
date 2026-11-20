// @vitest-environment jsdom
/**
 * #1797: the Hermetic lots card on the Placements view. Rows come from the real Swiss Ephemeris (no mocks): five
 * rows in Paulus's order with en and nl names, the formula for the chart's own sect, the source line as the lot
 * formula's verbatim `authority`, and no card when no lot has a position.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lotFormulaByKey } from '../src/astrology/arabic-parts.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { renderHermeticLotsTable } from '../src/ui/ChartViewPlacements.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

/** London, 15 June 1990, the same day and night moments as the existing Paulus lot test (#740). */
const DAY_MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 60,
};
const NIGHT_MOMENT: BirthMomentInput = {
  ...DAY_MOMENT,
  civil: { year: 1990, month: 6, day: 15, hour: 2, minute: 30, second: 0 },
};

const LOT_KEYS = ['lot-of-eros', 'lot-of-necessity', 'lot-of-courage', 'lot-of-victory', 'lot-of-nemesis'] as const;

/** The card's markup inside a wrapper, so a card that renders nothing gives an empty wrapper. */
function cardMarkup(data: ChartData, locale: 'en' | 'nl'): string {
  const t = chartViewMessages[locale];
  return renderToStaticMarkup(createElement('div', null, renderHermeticLotsTable(data, 'Chart', t, locale)));
}

describe('Hermetic lots card (#1797)', () => {
  it('shows the five lots in Paulus order, with en and nl names', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const en = cardMarkup(day, 'en');
    const nl = cardMarkup(day, 'nl');
    const enNames = LOT_KEYS.map((key) => chartViewMessages.en.hermeticLotNames[key]);
    const nlNames = LOT_KEYS.map((key) => chartViewMessages.nl.hermeticLotNames[key]);
    expect(enNames).toEqual(['Lot of Eros', 'Lot of Necessity', 'Lot of Courage', 'Lot of Victory', 'Lot of Nemesis']);
    expect(nlNames).toEqual([
      'Lot van Eros',
      'Lot van Noodzaak',
      'Lot van Moed',
      'Lot van Overwinning',
      'Lot van Nemesis',
    ]);
    const enIndices = enNames.map((name) => en.indexOf(name));
    const nlIndices = nlNames.map((name) => nl.indexOf(name));
    expect(enIndices.every((index) => index >= 0)).toBe(true);
    expect(nlIndices.every((index) => index >= 0)).toBe(true);
    expect([...enIndices].sort((a, b) => a - b)).toEqual(enIndices);
    expect([...nlIndices].sort((a, b) => a - b)).toEqual(nlIndices);
    expect(en).toContain('Hermetic lots');
    expect(nl).toContain('Hermetische loten');
  });

  it('shows the night formula for a night chart and the day formula for a day chart', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const night = await computeChartData(NIGHT_MOMENT, engine);
    expect(day.sect).toBe('day');
    expect(night.sect).toBe('night');
    const eros = lotFormulaByKey('lot-of-eros');
    expect(eros).toBeDefined();
    if (eros === undefined) return;
    const dayMarkup = cardMarkup(day, 'en');
    const nightMarkup = cardMarkup(night, 'en');
    expect(dayMarkup).toContain(eros.dayFormula);
    expect(dayMarkup).not.toContain(eros.nightFormula);
    expect(nightMarkup).toContain(eros.nightFormula);
    expect(nightMarkup).not.toContain(eros.dayFormula);
  });

  it('uses the lot formula authority verbatim as the source line', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const authority = lotFormulaByKey('lot-of-eros')?.authority;
    expect(authority).toBe('Paulus, Introduction 23 (via Hellenistic astrology, Chapter 16, pp. 525–526)');
    expect(cardMarkup(day, 'en')).toContain(`<p class="hint">${authority ?? ''}</p>`);
  });

  it('renders no card when no lot has a position', async () => {
    const day = await computeChartData(DAY_MOMENT, engine);
    const bare: ChartData = { ...day, positions: [] };
    expect(cardMarkup(bare, 'en')).toBe('<div></div>');
  });
});
