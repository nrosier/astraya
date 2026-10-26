// @vitest-environment jsdom
/**
 * The shared empty-cell rule in SortableTable (#825): an on-screen cell with an empty value draws the em dash, while
 * the copied and downloaded text (cellText in table-sort.ts) is left exactly as the view's render gives it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SortableTable } from '../src/ui/SortableTable.js';
import { cellText, type TableColumn } from '../src/ui/table-sort.js';

interface Row {
  readonly id: string;
  readonly house: number | undefined;
  readonly note: string | null;
  readonly flag: boolean;
}

const ROWS: readonly Row[] = [
  { id: 'a', house: undefined, note: null, flag: false },
  { id: 'b', house: 3, note: 'Seen', flag: true },
];

const COLUMNS: readonly TableColumn<Row>[] = [
  {
    key: 'house',
    label: 'House',
    valueOf: (row) => row.house ?? '',
    render: (row) => (row.house === undefined ? '—' : String(row.house)),
  },
  { key: 'note', label: 'Note', valueOf: (row) => row.note ?? '' },
  {
    key: 'flag',
    label: 'Flag',
    valueOf: (row) => row.flag,
    render: (row) => (row.flag ? '✓' : ''),
  },
];

let root: Root | undefined;

function mount(node: React.ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
});

function cellsOf(container: HTMLElement, rowKey: string): string[] {
  const row = container.querySelector(`tr[data-row-key="${rowKey}"]`);
  return Array.from(row?.querySelectorAll('td') ?? []).map((cell) => cell.textContent);
}

describe('SortableTable empty-cell rule (#825)', () => {
  it('draws the em dash for an empty value whose view text is blank or already the dash', () => {
    const container = mount(<SortableTable caption="Demo" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);
    // Row a: the house is undefined, so the view draws '—' and the rule keeps it.
    expect(cellsOf(container, 'a')[0]).toBe('—');
    // Row a: the note is null and has no render, so the view text is blank and the rule draws the dash.
    expect(cellsOf(container, 'a')[1]).toBe('—');
  });

  it('keeps a blank cell blank when its value is not empty (a boolean check column)', () => {
    const container = mount(<SortableTable caption="Demo" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);
    expect(cellsOf(container, 'a')[2]).toBe('');
    expect(cellsOf(container, 'b')[2]).toBe('✓');
  });

  it('leaves non-empty text exactly as the view drew it', () => {
    const container = mount(<SortableTable caption="Demo" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);
    expect(cellsOf(container, 'b')[0]).toBe('3');
    expect(cellsOf(container, 'b')[1]).toBe('Seen');
  });

  it('does not change the export text, which still reads the view render', () => {
    const [house, note, flag] = COLUMNS;
    const row = ROWS[0];
    if (house === undefined || note === undefined || flag === undefined || row === undefined)
      throw new Error('fixture');
    expect(cellText(house, row)).toBe('—');
    expect(cellText(note, row)).toBe('');
    expect(cellText(flag, row)).toBe('');
  });
});
