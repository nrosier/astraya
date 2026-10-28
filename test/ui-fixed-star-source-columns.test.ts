// @vitest-environment jsdom
/**
 * The chart's fixed-star table shows each chosen star's stored designation and the first 8 hex characters of its
 * source SHA-256 (#803); a preset chart keeps its three columns.
 */
import { describe, expect, it } from 'vitest';
import type { FixedStarRow } from '../src/domain/chart-tables.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { fixedStarColumns, hasStarSources } from '../src/ui/ChartViewAspects.js';

const SHA = 'ab12cd34ef56'.padEnd(64, '0');
const chosen: FixedStarRow = {
  star: 'Regulus',
  bodyKey: 'sun',
  bodyName: 'Sun',
  orb: 0.4,
  designation: 'alLeo',
  sourceSha256: SHA,
};
const preset: FixedStarRow = { star: 'Regulus', bodyKey: 'sun', bodyName: 'Sun', orb: 0.4 };

describe('fixedStarColumns (#803)', () => {
  it('shows the stored designation and the 8-character hash prefix for chosen stars', () => {
    const t = chartViewMessages.en;
    expect(hasStarSources([chosen])).toBe(true);
    const columns = fixedStarColumns(t, 'en', true);
    expect(columns.map((c) => c.label)).toEqual(['Star', 'Body', 'Orb', 'Designation', 'Source version']);
    const designation = columns.find((c) => c.key === 'designation');
    const version = columns.find((c) => c.key === 'sourceVersion');
    expect(designation?.valueOf(chosen)).toBe('alLeo');
    expect(version?.render?.(chosen)).toBe('SHA-256 ab12cd34');
  });

  it('adds no column for a preset chart', () => {
    expect(hasStarSources([preset])).toBe(false);
    const columns = fixedStarColumns(chartViewMessages.en, 'en', hasStarSources([preset]));
    expect(columns.map((c) => c.key)).toEqual(['star', 'bodyName', 'orb']);
  });

  it('has Dutch labels', () => {
    const labels = fixedStarColumns(chartViewMessages.nl, 'nl', true).map((c) => c.label);
    expect(labels.slice(-2)).toEqual(['Aanduiding', 'Bronversie']);
  });
});
