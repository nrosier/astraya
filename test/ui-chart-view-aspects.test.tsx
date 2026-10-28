// @vitest-environment jsdom
/**
 * The Aspects view's tables (#815): Applying is a dot plus label on screen and plain text everywhere else, the family
 * is plain muted text rather than a Badge, the orb and family columns end-align, the table keeps its six columns, and
 * the formula editor is gone from every chart view.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AntisciaRow, AspectRow, DeclinationContactRow } from '../src/domain/chart-tables.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { antisciaColumns, aspectColumns, declinationColumns } from '../src/ui/ChartViewAspects.js';
import { SortableTable } from '../src/ui/SortableTable.js';
import { rowsToCsv, rowsToTsv, type TableColumn } from '../src/ui/table-sort.js';

const t = chartViewMessages.en;

const ROWS: readonly AspectRow[] = [
  {
    bodyAKey: 'sun',
    bodyAName: 'Sun',
    bodyBKey: 'moon',
    bodyBName: 'Moon',
    aspect: 'Trine',
    aspectKey: 'trine',
    angle: 120,
    separation: 121.2,
    orb: 1.2,
    applying: true,
  },
  {
    bodyAKey: 'sun',
    bodyAName: 'Sun',
    bodyBKey: 'saturn',
    bodyBName: 'Saturn',
    aspect: 'Square',
    aspectKey: 'square',
    angle: 90,
    separation: 92.6,
    orb: 2.6,
    applying: false,
  },
];

let root: Root | undefined;

function mount<T>(
  caption: string,
  columns: readonly TableColumn<T>[],
  rows: readonly T[],
  key: (row: T) => string,
): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<SortableTable caption={caption} columns={columns} rows={rows} getRowKey={key} />);
  });
  return container;
}

function headersOf(view: HTMLElement): string[] {
  return Array.from(view.querySelectorAll('th')).map(
    (th) => th.querySelector('button, .data-table-label')?.textContent ?? '',
  );
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
});

describe('the aspects table (#815)', () => {
  const columns = aspectColumns(t, 'en');
  const view = (): HTMLElement => mount('Aspects', columns, ROWS, (row) => `${row.bodyAKey}-${row.aspect}`);

  it('keeps the columns Body A, Aspect, Body B, Orb, Applying, Family in that order', () => {
    expect(headersOf(view())).toEqual(['Body A', 'Aspect', 'Body B', 'Orb', 'Applying', 'Family']);
  });

  it('shows Applying and Separating as a dot plus label, differing by modifier class', () => {
    const states = Array.from(view().querySelectorAll('.aspect-state'));
    expect(states.map((state) => state.textContent)).toEqual(['Applying', 'Separating']);
    expect(states[0]?.classList.contains('aspect-state--applying')).toBe(true);
    expect(states[0]?.classList.contains('aspect-state--separating')).toBe(false);
    expect(states[1]?.classList.contains('aspect-state--separating')).toBe(true);
    expect(states[1]?.classList.contains('aspect-state--applying')).toBe(false);
    for (const state of states) {
      expect(state.querySelector('.aspect-state-dot')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(view().querySelectorAll('td .primitive-badge')).toHaveLength(0);
  });

  it('shows the family as plain muted text, not a Badge', () => {
    const container = view();
    const cells = Array.from(container.querySelectorAll('tbody tr td:last-child'));
    expect(cells.map((cell) => cell.textContent)).toEqual(['H3', 'H4']);
    expect(container.querySelectorAll('td:last-child .primitive-badge')).toHaveLength(0);
    expect(container.querySelectorAll('td:last-child .data-table-muted')).toHaveLength(2);
  });

  it('end-aligns the orb and family columns, header and cells', () => {
    const container = view();
    expect(container.querySelectorAll('th[data-align="end"]')).toHaveLength(2);
    expect(container.querySelectorAll('td[data-align="end"]')).toHaveLength(4);
  });

  it('keeps copy and CSV plain text', () => {
    for (const text of [rowsToTsv(columns, ROWS), rowsToCsv(columns, ROWS)]) {
      expect(text).toContain('Applying');
      expect(text).toContain('Separating');
      expect(text).not.toContain('aspect-state');
      expect(text).toContain('H3');
      expect(text).not.toContain('<');
    }
  });

  it('keeps the table inside the horizontal scroll frame', () => {
    expect(view().querySelector('.data-table-scroll table')).not.toBeNull();
  });
});

describe('the antiscia and declination tables (#815)', () => {
  it('lists Body, Contact, Kind, Orb with the orb end-aligned', () => {
    const rows: readonly AntisciaRow[] = [
      { bodyKey: 'sun', bodyName: 'Sun', contactKey: 'mars', contactName: 'Mars', kind: 'antiscion', orb: 0.35 },
    ];
    const view = mount('Antiscia', antisciaColumns(t, 'en'), rows, (row) => row.bodyKey);
    expect(headersOf(view)).toEqual(['Body', 'Contact', 'Kind', 'Orb']);
    expect(view.querySelectorAll('th[data-align="end"]')).toHaveLength(1);
  });

  it('lists Body A, Body B, Kind, Orb with the orb end-aligned', () => {
    const rows: readonly DeclinationContactRow[] = [
      { bodyAKey: 'sun', bodyAName: 'Sun', bodyBKey: 'moon', bodyBName: 'Moon', kind: 'parallel', orb: 0.2 },
    ];
    const view = mount('Declinations', declinationColumns(t, 'en'), rows, (row) => row.bodyAKey);
    expect(headersOf(view)).toEqual(['Body A', 'Body B', 'Kind', 'Orb']);
    expect(view.querySelectorAll('th[data-align="end"]')).toHaveLength(1);
  });
});

describe('the formula editor removal (#815)', () => {
  it('leaves no CustomPointEditor in ChartView', () => {
    const chartView = readFileSync(join(import.meta.dirname, '../src/ui/ChartView.tsx'), 'utf8');
    expect(chartView).not.toContain('CustomPointEditor');
  });

  it('words the compare-mode drawer link in both locales', () => {
    expect(chartViewMessages.en.compareFormulaLink).not.toBe('');
    expect(chartViewMessages.nl.compareFormulaLink).not.toBe('');
    expect(chartViewMessages.nl.compareFormulaLink).not.toBe(chartViewMessages.en.compareFormulaLink);
  });
});
