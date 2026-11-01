// @vitest-environment jsdom
/**
 * #887 (2026-10-30 export registration) — through the real PageHeader Export menu, a screen's CSV tables
 * list one item per table in source order, run a download of the rows as given (not as sorted on screen),
 * carry the nl label, and add nothing for a table the screen does not register.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { PageHeader } from '../src/ui/PageHeader.js';
import { SortableTable, csvExportTable, useCsvExports, type CsvExportTable } from '../src/ui/SortableTable.js';
import { setLocale } from '../src/ui/locale.js';
import type { TableColumn } from '../src/ui/table-sort.js';

const download = vi.hoisted(() => vi.fn<(filename: string, text: string, mime: string) => void>());
vi.mock('../src/ui/download.js', () => ({ downloadText: download, downloadBlob: vi.fn() }));

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

// The real Swiss Ephemeris engine (no mocked calculation) and one stored person, as ui-aria-busy-results does.
vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => {
  const person = {
    id: 'p1',
    displayName: 'Test',
    timeAccuracy: 'exact',
    moment: {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      offsetOverrideMinutes: 0,
    },
    placeLabel: 'Fort Wayne, IN',
    notes: '',
    missing: [],
    customPoints: [],
  };
  const state = { people: new Map([[person.id, person]]) };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { CyclesView } = await import('../src/ui/CyclesView.js');
const { EclipsesView } = await import('../src/ui/EclipsesView.js');
const { ProfectionsView } = await import('../src/ui/ProfectionsView.js');
const { ProgressionsView } = await import('../src/ui/ProgressionsView.js');
const { RelocatedChartView } = await import('../src/ui/RelocatedChartView.js');
const { EventSearchView } = await import('../src/ui/EventSearchView.js');
const { eventSearchViewMessages } = await import('../src/ui/EventSearchView.messages.js');
const { CorpusOverridesPanel } = await import('../src/ui/CorpusOverridesPanel.js');
const { corpusOverridesPanelMessages } = await import('../src/ui/CorpusOverridesPanel.messages.js');
const { PreferencesView } = await import('../src/ui/PreferencesView.js');
const { preferencesViewMessages } = await import('../src/ui/PreferencesView.messages.js');
const { PersonForm } = await import('../src/ui/PersonForm.js');
const { personFileActionsMessages } = await import('../src/ui/PersonFileActions.messages.js');

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

/** Waits (up to about 30 seconds) until the header's Export menu offers `count` items, then returns their labels. */
async function untilExportLabels(container: HTMLElement, count: number): Promise<string[]> {
  let labels: string[] = [];
  for (let i = 0; i < 600; i++) {
    const toggle = container.querySelector<HTMLButtonElement>('.page-header-export-toggle');
    if (toggle !== null) {
      if (container.querySelector('.page-header-export-menu') === null) {
        await act(async () => {
          toggle.click();
          await Promise.resolve();
        });
      }
      labels = [...container.querySelectorAll('.page-header-export-item')].map((item) => item.textContent);
      if (labels.length >= count) return labels;
    }
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
  }
  return labels;
}

/** Sets an input's value the way typing does, so React's change handler sees it. */
function typeInto(element: HTMLInputElement | undefined, value: string): void {
  if (element === undefined) throw new Error('test fixture bug: missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the Cycles, Eclipses, Profections, Progressions and Relocated screens register their CSV tables (#887)', () => {
  it('Cycles lists "Exact aspects (CSV)" in the header Export menu', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <CyclesView />
      </ExportRegistryProvider>,
    );
    expect(await untilExportLabels(container, 1)).toEqual(['Exact aspects (CSV)']);
  }, 60_000);

  it('Eclipses lists "Eclipses (CSV)" in the header Export menu', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <EclipsesView />
      </ExportRegistryProvider>,
    );
    expect(await untilExportLabels(container, 1)).toEqual(['Eclipses (CSV)']);
  }, 60_000);

  it('Profections lists "Profections (CSV)" in the header Export menu', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <ProfectionsView personId="p1" />
      </ExportRegistryProvider>,
    );
    expect(await untilExportLabels(container, 1)).toEqual(['Profections (CSV)']);
  }, 60_000);

  it('Progressions lists its positions table, then its contacts table, in source order', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <ProgressionsView personId="p1" />
      </ExportRegistryProvider>,
    );
    expect(await untilExportLabels(container, 2)).toEqual([
      'Progressed positions (CSV)',
      'Progressed-to-natal contacts (CSV)',
    ]);
  }, 60_000);

  it('Relocated lists "Natal vs. relocated (CSV)" once a place is chosen', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <RelocatedChartView personId="p1" />
      </ExportRegistryProvider>,
    );
    // No place yet: nothing to export, so no Export control.
    expect(container.querySelector('.page-header-export-toggle')).toBeNull();

    const [latitude, longitude] = container.querySelectorAll<HTMLInputElement>('.field-grid input[type="number"]');
    await act(async () => {
      typeInto(latitude, '51.5072');
      typeInto(longitude, '-0.1276');
      await Promise.resolve();
    });
    expect(await untilExportLabels(container, 1)).toEqual(['Natal vs. relocated (CSV)']);
  }, 60_000);
});

describe('the body exports of Event Search, Corpus Overrides, Preferences and the birth record are in the header Export menu (#887)', () => {
  it('Event Search lists its body CSV and ICS downloads once a search has results', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <EventSearchView />
      </ExportRegistryProvider>,
    );
    // A one-week range keeps the real search quick; the body buttons appear with the results.
    const [from, to] = container.querySelectorAll<HTMLInputElement>('input[placeholder="YYYY-MM-DD"]');
    await act(async () => {
      typeInto(from, '2026-01-01');
      typeInto(to, '2026-01-07');
      await Promise.resolve();
    });
    const search = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === eventSearchViewMessages.en.searchButton,
    );
    await act(async () => {
      search?.click();
      await Promise.resolve();
    });
    expect(await untilExportLabels(container, 2)).toEqual([
      eventSearchViewMessages.en.downloadCsv,
      eventSearchViewMessages.en.downloadIcs,
    ]);
  }, 60_000);

  it('Corpus Overrides lists its "Export corrections" download', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <CorpusOverridesPanel />
      </ExportRegistryProvider>,
    );
    expect(await untilExportLabels(container, 1)).toEqual([corpusOverridesPanelMessages.en.exportButton]);
  }, 60_000);

  it('Preferences lists full JSON, people CSV and people AAF, in the body order', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <PreferencesView />
      </ExportRegistryProvider>,
    );
    const m = preferencesViewMessages.en;
    expect(await untilExportLabels(container, 3)).toEqual([m.exportEverything, m.exportPeopleCsv, m.exportPeopleAaf]);
  }, 60_000);

  it('the birth record has no header Export menu: its AAF, JSON and CSV stay in the EXPORT card (#896)', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <PersonForm personId="p1" />
      </ExportRegistryProvider>,
    );
    expect(container.querySelector('.page-header-export-toggle')).toBeNull();
    const m = personFileActionsMessages.en;
    const labels = [...container.querySelectorAll<HTMLButtonElement>('.birth-record-export-row button')].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual([m.exportAaf, m.exportJson, m.exportCsv]);
  }, 60_000);
});
