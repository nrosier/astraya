// @vitest-environment jsdom
/**
 * #887 (2026-10-30 export registration) — through the real PageHeader Export menu, a screen's CSV tables
 * list one item per table in source order, run a download of the rows as given (not as sorted on screen),
 * carry the nl label, and add nothing for a table the screen does not register.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { PageHeader } from '../src/ui/PageHeader.js';
import { SortableTable, csvExportTable, useCsvExports, type CsvExportTable } from '../src/ui/SortableTable.js';
import { setLocale } from '../src/ui/locale.js';
import type { TableColumn } from '../src/ui/table-sort.js';

const download = vi.hoisted(() => vi.fn<(filename: string, text: string, mime: string) => void>());
vi.mock('../src/ui/download.js', () => ({ downloadText: download, downloadBlob: vi.fn() }));

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  download.mockClear();
  setLocale('en');
});

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

interface Row {
  readonly name: string;
  readonly value: number;
}

const columns: readonly TableColumn<Row>[] = [
  { key: 'name', label: 'Name', valueOf: (row) => row.name },
  { key: 'value', label: 'Value', valueOf: (row) => row.value },
];

/** Source order is 'b' then 'a'; sorting by Name ascending would put 'a' first on screen. */
const rows: readonly Row[] = [
  { name: 'b', value: 2 },
  { name: 'a', value: 1 },
];

/** A screen: registers its CSV tables with the header, then renders its tables (as the CSV screens do). */
function Screen({
  tables,
  headerTable,
}: {
  readonly tables: readonly CsvExportTable[] | undefined;
  readonly headerTable?: boolean;
}): React.JSX.Element {
  useCsvExports(tables);
  return (
    <>
      <PageHeader title="Screen" />
      <SortableTable
        caption="Contacts"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.name}
        downloadFilename={headerTable === false ? undefined : 'contacts.csv'}
      />
    </>
  );
}

/** Opens the header's Export menu and returns its item buttons, in the order the menu lists them. */
async function menuItems(container: HTMLElement): Promise<HTMLButtonElement[]> {
  const toggle = container.querySelector<HTMLButtonElement>('.page-header-export-toggle');
  if (toggle === null) return [];
  await act(async () => {
    toggle.click();
    await Promise.resolve();
  });
  return [...container.querySelectorAll<HTMLButtonElement>('.page-header-export-item')];
}

describe('PageHeader Export menu for CSV tables (#887)', () => {
  it('lists one item per registered table, in source order, labelled "<caption> (CSV)"', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <Screen
          tables={[
            csvExportTable('positions', 'Positions', 'positions.csv', columns, rows),
            csvExportTable('houses', 'Houses', 'houses.csv', columns, rows),
          ]}
        />
      </ExportRegistryProvider>,
    );
    const items = await menuItems(container);
    expect(items.map((item) => item.textContent)).toEqual(['Positions (CSV)', 'Houses (CSV)']);
  });

  it('downloads the rows in source order even when the on-screen table is sorted', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <Screen tables={[csvExportTable('contacts', 'Contacts', 'contacts.csv', columns, rows)]} />
      </ExportRegistryProvider>,
    );

    // Sort the on-screen table by Name ascending: 'a' now renders first.
    const sortButton = [...container.querySelectorAll<HTMLButtonElement>('th button')].find((button) =>
      button.textContent.startsWith('Name'),
    );
    await act(async () => {
      sortButton?.click();
      await Promise.resolve();
    });
    const onScreenFirst = container.querySelector('tbody tr')?.getAttribute('data-row-key');
    expect(onScreenFirst).toBe('a');

    const items = await menuItems(container);
    await act(async () => {
      items[0]?.click();
      await Promise.resolve();
    });
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, text] = download.mock.calls[0] ?? [];
    expect(filename).toBe('contacts.csv');
    expect(text?.split('\r\n')[1]?.startsWith('b,')).toBe(true);
  });

  it('labels the menu item in Dutch under the nl locale', async () => {
    setLocale('nl');
    const container = await mount(
      <ExportRegistryProvider>
        <Screen tables={[csvExportTable('contacts', 'Contacten', 'contacten.csv', columns, rows)]} />
      </ExportRegistryProvider>,
    );
    const items = await menuItems(container);
    expect(items.map((item) => item.textContent)).toEqual(['Contacten (CSV)']);
  });

  it('adds no header item for a table without downloadFilename, nor when the screen registers no table', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <Screen tables={undefined} headerTable={false} />
      </ExportRegistryProvider>,
    );
    // The table renders without Copy or CSV buttons, and the header shows no Export control at all.
    expect(container.querySelector('.data-table-actions')).toBeNull();
    expect(container.querySelector('.page-header-export-toggle')).toBeNull();
  });
});
