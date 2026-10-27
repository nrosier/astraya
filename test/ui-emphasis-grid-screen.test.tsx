// @vitest-environment jsdom
/**
 * #821: the Elements & modalities view on screen. The grid carries row totals (right-aligned) and column totals
 * (bottom-aligned), the three modality columns of the breakdown table read from the start while TOTAL reads from the
 * end, empty cells show an em dash, and the new CSS block uses semantic tokens only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EmphasisGridInput } from '../src/chart/emphasis-grid.js';
import type { EmphasisRow } from '../src/domain/chart-tables.js';
import { EmphasisGrid } from '../src/ui/EmphasisGrid.tsx';
import { emphasisColumns } from '../src/ui/ChartView.tsx';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { columnAlign } from '../src/ui/table-sort.js';

const css = readFileSync(join(process.cwd(), 'src', 'ui', 'app.css'), 'utf8');
const t = chartViewMessages.en;

// Sun 10 Aries (fire cardinal), Moon 100 Cancer (water cardinal), Chiron 50 Taurus (earth fixed).
const input: EmphasisGridInput = {
  bodies: [
    { body: 1, key: 'sun', longitude: 10 },
    { body: 2, key: 'moon', longitude: 100 },
    { body: 3, key: 'chiron', longitude: 50 },
  ],
};

describe('EmphasisGrid on screen (#821)', () => {
  const html = renderToStaticMarkup(
    <EmphasisGrid input={input} labels={{ elements: t.elementNames, modalities: t.modalityNames }} />,
  );

  it('draws twelve bordered cells and a glyph per body', () => {
    expect(html.split('class="emphasis-screen-cell"').length - 1).toBe(12);
    expect(html.split('emphasis-screen-glyph').length - 1).toBe(3);
  });

  it('puts a right-aligned total on each element row and a bottom-aligned total under each modality', () => {
    expect(html.split('emphasis-screen-row-total').length - 1).toBe(4);
    expect(html.split('emphasis-screen-column-total').length - 1).toBe(3);
    expect(css).toMatch(/\.emphasis-screen-row-total\s*\{[^}]*text-align:\s*right/);
    expect(css).toMatch(/\.emphasis-screen-column-total\s*\{[^}]*align-self:\s*end/);
  });

  it('shows the margins: element totals down the right, modality totals along the bottom', () => {
    const totals = [...html.matchAll(/emphasis-screen-total emphasis-screen-(row|column)-total">([^<]*)</g)].map(
      (m) => `${m[1] ?? ''}:${m[2] ?? ''}`,
    );
    expect(totals).toEqual(['row:1', 'row:1', 'row:0', 'row:1', 'column:2', 'column:1', 'column:0']);
  });
});

describe('Elements breakdown table columns (#821)', () => {
  const columns = emphasisColumns(t, 'en');
  const rows: readonly EmphasisRow[] = [
    {
      rowKey: 'fire',
      bodies: { cardinal: ['sun'], fixed: [], mutable: [] },
      counts: { cardinal: 1, fixed: 0, mutable: 0 },
      total: 1,
    },
  ];

  it('keeps Cardinal, Fixed and Mutable left-aligned and TOTAL right-aligned', () => {
    const aligns = columns.map((column) => columnAlign(column, rows));
    expect(aligns).toEqual(['start', 'start', 'start', 'start', 'end']);
  });

  it('shows an em dash in an empty cell', () => {
    const fixed = columns.find((column) => column.key === 'fixed');
    const row = rows[0];
    if (fixed?.render === undefined || row === undefined) throw new Error('fixed column missing');
    expect(fixed.render(row)).toBe('—');
  });
});

describe('Elements grid CSS (#821)', () => {
  const block = [...css.matchAll(/\.emphasis-screen-[^{]*\{[^}]*\}/g)].map((m) => m[0]).join('\n');

  it('has a block, with the 1px --line border on a low-opacity --surface fill', () => {
    expect(block).not.toBe('');
    expect(block).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(block).toMatch(/color-mix\(in oklab, var\(--surface\) \d+%, transparent\)/);
  });

  it('uses tokens only: no hex, rgb or hsl literals and no monospace family', () => {
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(block).not.toMatch(/monospace/i);
  });
});
