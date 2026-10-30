// @vitest-environment jsdom
/**
 * #918: the transit and aspect state column is named "State" in every chart table (Dutch "Toestand"),
 * and the transit table shows the same AspectState dot as the Aspects and Consultation tables. The
 * PDF and CSV keep plain text, so the dot is a screen-only cell.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { AspectRow } from '../src/domain/chart-tables.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { contactColumns } from '../src/ui/TransitView.js';
import { transitViewMessages } from '../src/ui/TransitView.messages.js';
import { SortableTable } from '../src/ui/SortableTable.js';
import { rowsToCsv, type TableColumn } from '../src/ui/table-sort.js';

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
});

const APPLYING: AspectRow = {
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
};

const SEPARATING: AspectRow = {
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
};

const ROWS: readonly AspectRow[] = [APPLYING, SEPARATING];

function stateColumn(columns: readonly TableColumn<AspectRow>[]): TableColumn<AspectRow> {
  const column = columns.find((candidate) => candidate.key === 'applying');
  if (column === undefined) throw new Error('fixture bug: no state column');
  return column;
}

describe('transit state column (#918)', () => {
  it('names the column State in en and Toestand in nl, matching the Aspects and Consultation tables', () => {
    expect(transitViewMessages.en.applyingLabel).toBe('State');
    expect(transitViewMessages.nl.applyingLabel).toBe('Toestand');
    expect(chartViewMessages.en.applyingLabel).toBe('State');
    expect(chartViewMessages.nl.applyingLabel).toBe('Toestand');
  });

  it('renders the dot and label on screen for applying and separating rows', () => {
    const t = transitViewMessages.en;
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <SortableTable
          caption="Transits"
          columns={contactColumns(t, 'en')}
          rows={ROWS}
          getRowKey={(row) => row.aspectKey + row.bodyBKey}
        />,
      );
    });

    const headers = [...container.querySelectorAll('th')].map((th) => th.textContent);
    expect(headers).toContain('State');

    const states = [...container.querySelectorAll('.aspect-state')];
    expect(states.map((state) => state.textContent)).toEqual(['Applying', 'Separating']);
    expect(states[0]?.classList.contains('aspect-state--applying')).toBe(true);
    expect(states[1]?.classList.contains('aspect-state--separating')).toBe(true);
    expect(states[0]?.querySelector('.aspect-state-dot')).not.toBeNull();
  });

  it('keeps plain text for the PDF and CSV, without the dot', () => {
    const columns = contactColumns(transitViewMessages.en, 'en');
    const state = stateColumn(columns);
    expect(state.render?.(APPLYING)).toBe('Applying');
    expect(state.render?.(SEPARATING)).toBe('Separating');
    expect(rowsToCsv(columns, ROWS)).toContain('Applying');
    expect(rowsToCsv(columns, ROWS)).not.toContain('aspect-state');
  });
});
