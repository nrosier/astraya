// @vitest-environment jsdom
/**
 * FilterSummary, Notice and the SortableTable options added for #615: the primitives' own behaviour, and the guards
 * that stop a screen going back to its own copy (a hand-built `<table>`, a hand-rolled filter count, a bare
 * `.warning` paragraph).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterSummary } from '../src/ui/primitives/FilterSummary.js';
import { Notice } from '../src/ui/primitives/Notice.js';
import { SortableTable } from '../src/ui/SortableTable.js';
import type { TableColumn } from '../src/ui/table-sort.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
});

function mount(node: React.ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

describe('FilterSummary', () => {
  it('announces its sentence politely and offers the action that changes the filter', () => {
    const change = vi.fn();
    const container = mount(
      <FilterSummary summary="Important · 12 of 87 shown" changeLabel="Change filters" onChange={change} />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Important · 12 of 87 shown');
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Change filters');
    act(() => {
      button?.click();
    });
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('is only the sentence, drawn as a hint, when there is nothing to change', () => {
    const container = mount(<FilterSummary summary="3 of 9 shown" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('p')?.className).toContain('hint');
  });
});

describe('Notice', () => {
  it('is the warning panel by default and plain muted text as info, and is not a live region', () => {
    const container = mount(
      <>
        <Notice>careful</Notice>
        <Notice tone="info">for your information</Notice>
      </>,
    );
    const [warning, info] = Array.from(container.querySelectorAll('p'));
    expect(warning?.className).toBe('warning');
    expect(info?.className).toBe('hint');
    expect(container.querySelector('[role]')).toBeNull();
  });
});

interface Row {
  readonly id: string;
  readonly name: string;
}
const ROWS: readonly Row[] = [
  { id: 'b', name: 'Beta' },
  { id: 'a', name: 'Alpha' },
];
const COLUMNS: readonly TableColumn<Row>[] = [
  { key: 'name', label: 'Name', valueOf: (row) => row.name },
  {
    key: 'act',
    label: 'Actions',
    sortable: false,
    valueOf: () => '',
    renderCell: (row) => <button type="button">{`Edit ${row.name}`}</button>,
  },
];

describe('SortableTable options', () => {
  it('has no Copy or CSV buttons without a download filename', () => {
    const container = mount(
      <SortableTable caption="People" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />,
    );
    expect(container.querySelector('.data-table-actions')).toBeNull();
  });

  it('keeps them with one', () => {
    const container = mount(
      <SortableTable
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowKey={(row) => row.id}
        downloadFilename="people.csv"
      />,
    );
    expect(container.querySelectorAll('.data-table-actions button')).toHaveLength(2);
  });

  it('draws a column of controls with a plain header, not a sort button, and still sorts the others', () => {
    const container = mount(
      <SortableTable caption="People" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />,
    );
    const headers = Array.from(container.querySelectorAll('th'));
    expect(headers[0]?.querySelector('button')?.textContent).toBe('Name');
    expect(headers[1]?.querySelector('button')).toBeNull();
    expect(headers[1]?.textContent).toBe('Actions');
    act(() => {
      headers[0]?.querySelector('button')?.click();
    });
    const names = Array.from(container.querySelectorAll('tbody tr td:first-child')).map((cell) => cell.textContent);
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('wraps its cells only when asked', () => {
    const plain = mount(<SortableTable caption="A" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);
    expect(plain.querySelector('section')?.className).toBe('data-table');
    act(() => {
      root?.unmount();
    });
    const wrapped = mount(<SortableTable wrap caption="A" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} />);
    expect(wrapped.querySelector('section')?.className).toBe('data-table data-table-wrap');
  });
});

function screens(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return screens(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}
const code = (path: string): string =>
  readFileSync(path, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('screens use the shared pieces (#615)', () => {
  it('draw no table of their own: SortableTable is the only file with a <table>', () => {
    const offenders = screens('src/ui').filter(
      (file) => /<table\b/.test(code(file)) && !file.endsWith('SortableTable.tsx'),
    );
    expect(offenders).toEqual([]);
  });

  it('write no bare warning paragraph: a persistent caveat is a Notice', () => {
    const offenders = screens('src/ui').filter(
      (file) => !file.includes('primitives') && /<p className="warning[ "]/.test(code(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('write no filter count of their own: it is a FilterSummary', () => {
    const offenders = screens('src/ui').filter((file) => code(file).includes('className="transit-filter-count"'));
    expect(offenders).toEqual([]);
  });
});
