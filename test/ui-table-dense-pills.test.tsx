// @vitest-environment jsdom
/**
 * Buttons inside dense table rows are compact pills (#1650, owner answer 3): Copy CSV, Download CSV and
 * "Show X on the wheel" carry the capsule shape with the compact size, and none of them takes the 2.75rem
 * form-action class. The height is set by the shared compact rules, so this test checks the classes only.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { SortableTable } from '../src/ui/SortableTable.js';
import { selectColumn, type TableSelection } from '../src/ui/table-selection.js';
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

function mount(element: React.JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const mounted = root;
  act(() => {
    mounted.render(element);
  });
  return container;
}

function buttonNamed(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === text);
  if (button === undefined) throw new Error(`no button "${text}"`);
  return button;
}

function expectCompactPill(button: HTMLButtonElement): void {
  expect(button.classList.contains('primitive-button-capsule')).toBe(true);
  expect(button.classList.contains('primitive-button-compact')).toBe(true);
  expect(button.classList.contains('primitive-button-form-action')).toBe(false);
}

const t = chartViewMessages.en;

describe('table dense-row buttons are compact pills (#1650)', () => {
  it('gives Copy CSV and Download CSV the compact capsule classes', () => {
    const container = mount(
      <SortableTable
        caption="T"
        columns={COLUMNS}
        rows={ROWS}
        getRowKey={(row) => row.id}
        downloadFilename="table.csv"
      />,
    );
    expectCompactPill(buttonNamed(container, 'Copy'));
    expectCompactPill(buttonNamed(container, 'Download CSV'));
  });

  it('gives "Show X on the wheel" the compact capsule classes', () => {
    const selection: TableSelection = {
      selectedKey: undefined,
      onToggle: () => undefined,
      onShowOnWheel: () => undefined,
      selectableBodies: new Set(),
    };
    const column = selectColumn<Row>(
      t,
      selection,
      (row) => row.id,
      (row) => row.name,
      undefined,
      true,
    );
    const row = ROWS[0];
    if (row === undefined || column.renderCell === undefined) throw new Error('no row or cell renderer');
    const container = mount(<>{column.renderCell(row)}</>);
    expectCompactPill(buttonNamed(container, t.showOnChartButton));
  });
});
