// @vitest-environment jsdom
/**
 * Resizable data-table columns (#1301): the width arithmetic, the shared SortableTable's resize handle driven by
 * the keyboard and by a pointer drag, and the Reset action that appears beside Copy/Download CSV only once a
 * column has been resized. Widths are not stored anywhere, so a fresh mount starts unresized.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SortableTable } from '../src/ui/SortableTable.js';
import {
  clampColumnWidth,
  COLUMN_STEP,
  COLUMN_STEP_LARGE,
  dragColumnWidth,
  keyboardColumnWidth,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
} from '../src/ui/table-column-width.js';
import type { TableColumn } from '../src/ui/table-sort.js';

interface Row {
  readonly id: string;
  readonly name: string;
}

const COLUMNS: readonly TableColumn<Row>[] = [
  { key: 'id', label: 'Id', valueOf: (row) => row.id },
  { key: 'name', label: 'Name', valueOf: (row) => row.name },
];
const ROWS: readonly Row[] = [{ id: 'a', name: 'Alpha' }];

let root: Root | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.innerHTML = '';
});

/** jsdom has no layout: every header measures 100px wide, as a browser would report for a laid-out column. */
HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<SortableTable caption="T" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);
  });
  return container;
}

function handle(container: HTMLElement, name: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[role="separator"][aria-label="${name}"]`);
  if (el === null) throw new Error(`no handle ${name}`);
  return el;
}

function colWidths(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('col')].map((col) => col.style.width);
}

describe('column width arithmetic', () => {
  it('clamps and steps', () => {
    expect(clampColumnWidth(1)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(99999)).toBe(MAX_COLUMN_WIDTH);
    expect(keyboardColumnWidth(100, 'ArrowRight', false)).toBe(100 + COLUMN_STEP);
    expect(keyboardColumnWidth(200, 'ArrowLeft', true)).toBe(200 - COLUMN_STEP_LARGE);
    expect(keyboardColumnWidth(100, 'Home', false)).toBe(MIN_COLUMN_WIDTH);
    expect(keyboardColumnWidth(100, 'a', false)).toBeUndefined();
    expect(dragColumnWidth(100, 10, 40)).toBe(130);
  });
});

describe('SortableTable resize handle', () => {
  it('has a named, focusable handle per column and no fixed widths at first', () => {
    const container = mount();
    expect(handle(container, 'Resize Id column').tabIndex).toBe(0);
    expect(handle(container, 'Resize Name column').tabIndex).toBe(0);
    expect(container.querySelector('col')).toBeNull();
  });

  it('widens a column with the arrow key and by a larger step with Shift', () => {
    const container = mount();
    const el = handle(container, 'Resize Id column');
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const first = colWidths(container)[0];
    expect(first).toBe(`${String(100 + COLUMN_STEP)}px`);
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    });
    expect(colWidths(container)[0]).toBe(`${String(100 + COLUMN_STEP + COLUMN_STEP_LARGE)}px`);
  });

  it('resizes by dragging', () => {
    const container = mount();
    const el = handle(container, 'Resize Name column');
    el.setPointerCapture = () => undefined;
    el.releasePointerCapture = () => undefined;
    act(() => {
      el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
    });
    act(() => {
      el.dispatchEvent(new MouseEvent('pointermove', { clientX: 180, bubbles: true }));
    });
    expect(colWidths(container)[1]).toBe(`${String(100 + 80)}px`);
  });

  it('starts unresized on a fresh mount', () => {
    mount();
    act(() => {
      root?.unmount();
    });
    expect(mount().querySelector('col')).toBeNull();
  });
});

/** The table-level action buttons (Copy/Download CSV/Reset), excluding each column's sort button. */
function actionLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('.data-table-actions button')].map((b) => b.textContent);
}

describe('Reset widths action (#1301)', () => {
  it('is absent before any resize, appears after one, and clears every column width when clicked', () => {
    const container = mount();
    expect(container.querySelector('.data-table-actions')).toBeNull();

    const el = handle(container, 'Resize Id column');
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(actionLabels(container)).toEqual(['Reset widths']);
    expect(container.querySelector('col')).not.toBeNull();

    const reset = container.querySelector<HTMLElement>('.data-table-actions button');
    if (reset === null) throw new Error('no Reset button after resize');
    act(() => {
      reset.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('col')).toBeNull();
    expect(container.querySelector('.data-table-actions')).toBeNull();
  });

  it('shows beside Copy/Download CSV once resized, even when the table has a CSV download', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <SortableTable
          caption="T"
          columns={COLUMNS}
          rows={ROWS}
          getRowKey={(row) => row.id}
          downloadFilename="t.csv"
        />,
      );
    });
    expect(actionLabels(container)).toEqual(['Copy', 'Download CSV']);

    const el = handle(container, 'Resize Name column');
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(actionLabels(container)).toEqual(['Copy', 'Download CSV', 'Reset widths']);
  });
});
