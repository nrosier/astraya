// @vitest-environment jsdom
/**
 * #887 — each CSV table on a screen is also offered in the screen's page-header Export menu, one item
 * per table, in source order. Covers the helper the screens use (`csvExportTable`, `useCsvExports`)
 * and the nl/en label parity of the one new string it adds. The in-table Copy and CSV buttons are
 * unchanged and are covered by their own tests.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { ExportRegistryProvider, useExportItems, type ExportItem } from '../src/ui/export-registry.js';
import { csvExportTable, useCsvExports, type CsvExportTable } from '../src/ui/SortableTable.js';
import { sortableTableMessages } from '../src/ui/SortableTable.messages.js';
import type { TableColumn } from '../src/ui/table-sort.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mount(node: React.ReactNode): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  mounted = { container, root };
}

interface Row {
  readonly name: string;
  readonly degree: number;
}

const columns: readonly TableColumn<Row>[] = [
  { key: 'name', label: 'Name', valueOf: (row) => row.name },
  { key: 'degree', label: 'Degree', valueOf: (row) => row.degree },
];

const rows: readonly Row[] = [
  { name: 'Sun', degree: 12 },
  { name: 'Moon', degree: 3 },
];

/** Stands in for a screen: it registers its tables with the header, as the nine CSV screens do. */
function Screen({ tables }: { readonly tables: readonly CsvExportTable[] | undefined }): React.JSX.Element {
  useCsvExports(tables);
  return <></>;
}

let seen: readonly ExportItem[] = [];

/** Reads back what the header's registry holds, so each assertion sees the same list the Export menu lists. */
function ItemsProbe(): React.JSX.Element {
  seen = useExportItems();
  return <></>;
}

describe('csvExportTable (#887)', () => {
  it('serialises the rows in the order given, not in any sorted order', () => {
    const table = csvExportTable('k', 'Caption', 'file.csv', columns, rows);
    expect(table.csv()).toBe('Name,Degree\r\nSun,12\r\nMoon,3');
  });

  it('keeps its key, caption and filename as given', () => {
    const table = csvExportTable('contacts', 'Contacts', 'person-contacts.csv', columns, rows);
    expect(table.key).toBe('contacts');
    expect(table.caption).toBe('Contacts');
    expect(table.filename).toBe('person-contacts.csv');
  });
});

describe('useCsvExports (#887)', () => {
  it('registers one header item per table, labelled "<caption> (CSV)", in the order given', async () => {
    const tables = [
      csvExportTable('first', 'First table', 'a.csv', columns, rows),
      csvExportTable('second', 'Second table', 'b.csv', columns, rows),
    ];
    await mount(
      <ExportRegistryProvider>
        <Screen tables={tables} />
        <ItemsProbe />
      </ExportRegistryProvider>,
    );
    expect(seen.map((item) => item.key)).toEqual(['first', 'second']);
    expect(seen.map((item) => item.label)).toEqual(['First table (CSV)', 'Second table (CSV)']);
  });

  it('registers nothing while the screen has no table', async () => {
    await mount(
      <ExportRegistryProvider>
        <Screen tables={undefined} />
        <ItemsProbe />
      </ExportRegistryProvider>,
    );
    expect(seen).toEqual([]);
  });
});

describe('sortableTableMessages.csvLabel (#887)', () => {
  it('has the same keys in en and nl', () => {
    expect(Object.keys(sortableTableMessages.nl).sort()).toEqual(Object.keys(sortableTableMessages.en).sort());
  });

  it('appends "(CSV)" to the caption in both locales', () => {
    expect(sortableTableMessages.en.csvLabel('Contacts')).toBe('Contacts (CSV)');
    expect(sortableTableMessages.nl.csvLabel('Contacten')).toBe('Contacten (CSV)');
  });
});
