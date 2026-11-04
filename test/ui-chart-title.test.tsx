// @vitest-environment jsdom
/**
 * The Charts page title names the chart type as well as the person (#885): "Name’s Natal Chart" for the
 * natal chart (person first, title case, #1140), "Name’s Natal and Harmonic Charts" when two charts are compared, in both locales, in the h1 and in
 * document.title, which adds the app name (#1078). Real store (fake-indexeddb via test/setup.ts). The draconic, harmonic, return and
 * relocated charts are separate screens whose own headings already name their type.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { chartTypesMessages } from '../src/ui/ChartTypes.messages.js';
import { ChartView } from '../src/ui/ChartView.js';
import { draconicViewMessages } from '../src/ui/DraconicView.messages.js';
import { harmonicViewMessages } from '../src/ui/HarmonicView.messages.js';
import { relocatedChartViewMessages } from '../src/ui/RelocatedChartView.messages.js';
import { returnViewMessages } from '../src/ui/ReturnView.messages.js';
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
  it('natal: the h1 and document.title read "Ada’s Natal Chart"', async () => {
    const host = await mountChart();
    expect(host.querySelector('h1')?.textContent).toBe('Ada’s Natal Chart');
    expect(document.title).toBe('Ada’s Natal Chart – Astraya');
  });

  it('comparison: the h1 and document.title read "Ada’s Natal and Harmonic Charts"', async () => {
    const host = await mountChart('draconic');
    expect(host.querySelector('h1')?.textContent).toBe(chartViewMessages.en.comparisonChartTitle('Ada'));
    expect(host.querySelector('h1')?.textContent).toBe('Ada’s Natal and Harmonic Charts');
    expect(document.title).toBe('Ada’s Natal and Harmonic Charts – Astraya');
  });

  it('Dutch: reads "Geboortehoroscoop van Ada"', async () => {
    setLocale('nl');
    const host = await mountChart();
    expect(host.querySelector('h1')?.textContent).toBe('Geboortehoroscoop van Ada');
  });

  it('Dutch comparison: the h1 and document.title read the Dutch comparison title', async () => {
    setLocale('nl');
    const host = await mountChart('draconic');
    expect(host.querySelector('h1')?.textContent).toBe(chartViewMessages.nl.comparisonChartTitle('Ada'));
    expect(host.querySelector('h1')?.textContent).toBe('Geboorte- en harmonische horoscopen van Ada');
    expect(document.title).toBe('Geboorte- en harmonische horoscopen van Ada – Astraya');
  });

  it('without a name the natal title drops the possessive and keeps the capitalised kind, in both locales', async () => {
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'displayName', value: '' }]);
    const host = await mountChart();
    expect(host.querySelector('h1')?.textContent).toBe('Natal Chart');
    act(() => {
      root?.unmount();
    });
    container?.remove();
    setLocale('nl');
    const hostNl = await mountChart();
    expect(hostNl.querySelector('h1')?.textContent).toBe('Geboortehoroscoop');
  });
});

describe('every chart type title is person-first and capitalised (#1140)', () => {
  it('English: Nick Rosier’s <Kind> for all six chart types', () => {
    const name = 'Nick Rosier';
    const titles = [
      chartViewMessages.en.chartTitle(chartTypesMessages.en.typeLabels.natal, name),
      draconicViewMessages.en.heading(name),
      harmonicViewMessages.en.heading(name),
      returnViewMessages.en.solarHeading(name),
      returnViewMessages.en.lunarHeading(name),
      relocatedChartViewMessages.en.heading(name),
    ];
    expect(titles).toEqual([
      'Nick Rosier’s Natal Chart',
      'Nick Rosier’s Draconic Chart',
      'Nick Rosier’s Harmonic Chart',
      'Nick Rosier’s Solar Return',
      'Nick Rosier’s Lunar Return',
      'Nick Rosier’s Relocated Chart',
    ]);
  });

  it('English fallbacks are the capitalised kind alone', () => {
    expect([
      chartViewMessages.en.chartTitleFallback(chartTypesMessages.en.typeLabels.natal),
      draconicViewMessages.en.headingFallback,
      harmonicViewMessages.en.headingFallback,
      returnViewMessages.en.solarHeadingFallback,
      returnViewMessages.en.lunarHeadingFallback,
      relocatedChartViewMessages.en.headingFallback,
    ]).toEqual(['Natal Chart', 'Draconic Chart', 'Harmonic Chart', 'Solar Return', 'Lunar Return', 'Relocated Chart']);
  });

  it('Dutch: capitalised kind followed by "van <name>" for all six chart types', () => {
    const name = 'Nick Rosier';
    expect([
      chartViewMessages.nl.chartTitle(chartTypesMessages.nl.typeLabels.natal, name),
      draconicViewMessages.nl.heading(name),
      harmonicViewMessages.nl.heading(name),
      returnViewMessages.nl.solarHeading(name),
      returnViewMessages.nl.lunarHeading(name),
      relocatedChartViewMessages.nl.heading(name),
    ]).toEqual([
      'Geboortehoroscoop van Nick Rosier',
      'Draconische horoscoop van Nick Rosier',
      'Harmonische horoscoop van Nick Rosier',
      'Zonneterugkeer van Nick Rosier',
      'Maanterugkeer van Nick Rosier',
      'Verplaatste horoscoop van Nick Rosier',
    ]);
  });
});
