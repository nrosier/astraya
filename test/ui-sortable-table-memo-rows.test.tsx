// @vitest-environment jsdom
/**
 * #1440: with `memoizeRows`, a playback step that hands the table new row objects re-renders only the rows whose
 * displayed text changed, and keeps every row's DOM node.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SortableTable } from '../src/ui/SortableTable.js';
import type { TableColumn } from '../src/ui/table-sort.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  readonly name: string;
  readonly orb: number;
}

let root: Root | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
});

function mountWith(rowsAt: (step: number) => readonly Row[], memoizeRows: boolean) {
  const drawn: string[] = [];
  const columns: readonly TableColumn<Row>[] = [
    { key: 'name', label: 'Name', valueOf: (row) => row.name },
    {
      key: 'orb',
      label: 'Orb',
      valueOf: (row) => row.orb,
      render: (row) => row.orb.toFixed(1),
      renderCell: (row) => {
        drawn.push(row.name);
        return row.orb.toFixed(1);
      },
    },
  ];
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const draw = (step: number): void => {
    act(() => {
      root?.render(
        <SortableTable
          caption="Contacts"
          columns={columns}
          rows={rowsAt(step)}
          getRowKey={(row) => row.name}
          memoizeRows={memoizeRows}
        />,
      );
    });
  };
  return { container, drawn, draw };
}

// Row "a" moves a whole 0.1 each step; row "b" moves 0.001, which rounds to the same text.
const rowsAt = (step: number): readonly Row[] => [
  { name: 'a', orb: 1 + step * 0.1 },
  { name: 'b', orb: 2 + step * 0.001 },
];

describe('memoized table rows (#1440)', () => {
  it('re-renders only the rows whose displayed text changed, and keeps every row node', () => {
    const { container, drawn, draw } = mountWith(rowsAt, true);
    draw(0);
    const firstRows = [...container.querySelectorAll('tbody tr')];
    drawn.length = 0;
    for (let step = 1; step <= 5; step++) draw(step);
    expect(drawn.filter((name) => name === 'b')).toHaveLength(0);
    expect(drawn.filter((name) => name === 'a').length).toBeGreaterThan(0);
    expect([...container.querySelectorAll('tbody tr')]).toEqual(firstRows);
    expect(container.querySelector('tbody tr:first-child td:last-child')?.textContent).toBe('1.5');
  });

  it('baseline: without memoizeRows every row renders on every step', () => {
    const { drawn, draw } = mountWith(rowsAt, false);
    draw(0);
    drawn.length = 0;
    for (let step = 1; step <= 5; step++) draw(step);
    // At least once per step (the cell callback also runs when the table measures itself).
    expect(drawn.filter((name) => name === 'b').length).toBeGreaterThanOrEqual(5);
  });
});
