// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { lotFormulaFor } from '../src/astrology/arabic-parts.js';
import type { DerivedPointRow } from '../src/domain/chart-tables.js';
import { degreeParts } from '../src/domain/degree-parts.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { derivedPointColumns } from '../src/ui/ChartViewPlacements.js';
import { cellText } from '../src/ui/table-sort.js';

/**
 * The Derived points formula column follows the chart's Part of Fortune formula (#1794). Fixed longitudes, no
 * ephemeris: only the formula text is under test. Screen and PDF share `derivedPointColumns`, so one check covers both.
 */
const t = chartViewMessages.en;

function row(pointKey: DerivedPointRow['pointKey'], label: string): DerivedPointRow {
  const longitude = 100;
  return { pointKey, label, longitude, ...degreeParts(longitude) };
}

function formulaText(r: DerivedPointRow, fortuneFormula?: 'sect-reversed' | 'same-day-and-night'): string {
  const column = derivedPointColumns(t, 'en', undefined, fortuneFormula).find((c) => c.key === 'formula');
  if (column === undefined) throw new Error('no formula column');
  return cellText(column, r);
}

describe('derived points formula column (#1794)', () => {
  const fortune = row('part-of-fortune', 'Part of Fortune');
  const spirit = row('part-of-spirit', 'Part of Spirit');

  it('shows the day and night formulas for the default setting, as before', () => {
    const formula = lotFormulaFor('part-of-fortune', 'sect-reversed');
    expect(formulaText(fortune)).toBe(`${formula?.dayFormula} / ${formula?.nightFormula}`);
    expect(formulaText(fortune, 'sect-reversed')).toBe(formulaText(fortune));
  });

  it('shows one formula, not a day / night pair, for the modern Part of Fortune', () => {
    const text = formulaText(fortune, 'same-day-and-night');
    expect(text).toBe(lotFormulaFor('part-of-fortune', 'same-day-and-night')?.dayFormula);
    expect(text).not.toContain(' / ');
    expect(text).not.toBe(formulaText(fortune));
  });

  it('shows one formula, not a day / night pair, for the modern Part of Spirit', () => {
    const text = formulaText(spirit, 'same-day-and-night');
    expect(text).toBe(lotFormulaFor('part-of-spirit', 'same-day-and-night')?.dayFormula);
    expect(text).not.toContain(' / ');
    expect(formulaText(spirit)).not.toBe(formulaText(spirit, 'same-day-and-night'));
  });

  it('leaves the other derived points unchanged under the modern setting', () => {
    const other = row(undefined, 'ASC/MC Midpoint');
    expect(formulaText(other, 'same-day-and-night')).toBe(formulaText(other));
  });
});
