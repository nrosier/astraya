// @vitest-environment jsdom
/**
 * The Charts page title names the chart type as well as the person (#885): "Natal · Name" for the
 * natal chart, the comparison label when two charts are compared, in both locales, in the h1 and in
 * document.title. Real store (fake-indexeddb via test/setup.ts). The draconic, harmonic, return and
 * relocated charts are separate screens whose own headings already name their type.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { chartTypesMessages } from '../src/ui/ChartTypes.messages.js';
import { ChartView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { StoreProvider } from '../src/ui/store-context.js';
import type { ChartType } from '../src/ui/chart-sections.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

async function mountChart(compareType?: ChartType): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <ExportRegistryProvider>
          <ChartView personId="p1" compareType={compareType} />
        </ExportRegistryProvider>
      </StoreProvider>,
    );
    await Promise.resolve();
  });
  return container;
}

beforeEach(async () => {
  counter += 1;
  localStorage.clear();
  setLocale('en');
  store = await openStore({ name: `astraya-chart-title-${String(counter)}` });
  await store.mutate([
    { entity: 'person', entityId: 'p1', field: 'displayName', value: 'Ada' },
    {
      entity: 'person',
      entityId: 'p1',
      field: 'civil',
      value: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    },
    { entity: 'person', entityId: 'p1', field: 'coordinates', value: { latitude: 41.1833, longitude: -84.7333 } },
  ]);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
  setLocale('en');
});

describe('chart title names the chart type (#885)', () => {
  it('natal: the h1 and document.title read "Natal · Ada"', async () => {
    const host = await mountChart();
    expect(host.querySelector('h1')?.textContent).toBe(`${chartTypesMessages.en.typeLabels.natal} · Ada`);
    expect(document.title).toBe('Natal · Ada');
  });

  it('comparison: the h1 uses the existing comparison label', async () => {
    const host = await mountChart('draconic');
    expect(host.querySelector('h1')?.textContent).toBe(`${chartViewMessages.en.comparisonLabel} · Ada`);
    expect(document.title).toBe('Comparison · Ada');
  });

  it('Dutch: uses the existing Dutch natal label', async () => {
    setLocale('nl');
    const host = await mountChart();
    expect(host.querySelector('h1')?.textContent).toBe(`${chartTypesMessages.nl.typeLabels.natal} · Ada`);
  });
});
