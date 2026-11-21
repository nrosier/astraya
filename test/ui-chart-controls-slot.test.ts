/**
 * #1853 — every page that hosts ChartDataView must provide the shared controls slot (a ChartTypeSelector or a
 * ChartControlsOnly row). ChartDataView portals the aspect-family controls into `.chart-controls-slot`; without a slot
 * the controls had no row and fell onto the instrument bar. This source scan stops a new chart page losing the row.
 * ChartView.tsx is excluded: it defines ChartDataView and the natal page passes its own typeSelector.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const uiDir = new URL('../src/ui/', import.meta.url);
const SLOT_MARKERS = ['typeSelector=', '<ChartTypeSelector', '<ChartControlsOnly'];

function uiTsxFiles(): string[] {
  return readdirSync(uiDir, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.tsx') && !entry.endsWith('/ChartView.tsx') && entry !== 'ChartView.tsx');
}

describe('ChartDataView hosts provide the controls slot (#1853)', () => {
  it('finds ChartDataView host pages to check', () => {
    const hosts = uiTsxFiles().filter((file) => readFileSync(new URL(file, uiDir), 'utf8').includes('<ChartDataView'));
    expect(hosts).toContain('HoraryView.tsx');
    expect(hosts).toContain('SharedChartView.tsx');
    expect(hosts).toContain('CompositeView.tsx');
  });

  it('gives every ChartDataView host a typeSelector, ChartTypeSelector or ChartControlsOnly row', () => {
    const missing = uiTsxFiles().filter((file) => {
      const source = readFileSync(new URL(file, uiDir), 'utf8');
      if (!source.includes('<ChartDataView')) return false;
      return !SLOT_MARKERS.some((marker) => source.includes(marker));
    });
    expect(missing, `ChartDataView host(s) without a controls slot: ${missing.join(', ')}`).toEqual([]);
  });
});
