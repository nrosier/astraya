// @vitest-environment jsdom
/**
 * Leaving natal comparison for a chart type without comparison drops `?compare=` and tells the user (#1810, owner decision
 * "Drop compare, say so"): the chart-type selector sets a one-shot flag, and the next selector to mount shows the note once,
 * in en and nl, also under StrictMode (main.tsx renders in StrictMode, which runs initializers and effects twice). The natal
 * `ChartView` in comparison mode tells its selector it is comparing; the plain natal chart does not. Real Swiss Ephemeris via
 * the engine harness and a real store (fake-indexeddb via test/setup.ts).
 */
import { act, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { ChartTypeSelector } from '../src/ui/ChartTypeSelector.js';
import { chartTypesMessages } from '../src/ui/ChartTypes.messages.js';
import { ChartView } from '../src/ui/ChartView.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { setLocale } from '../src/ui/locale.js';
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

const mounted: { root: Root; container: HTMLElement }[] = [];

function mount(node: ReactNode, strict = false): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(strict ? <StrictMode>{node}</StrictMode> : node);
  });
  mounted.push({ root, container });
  return container;
}

function unmountAll(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
}

/** Opens the chart-type pill and picks the option with this label. */
function choose(container: HTMLElement, label: string): void {
  const pill = container.querySelector<HTMLButtonElement>('.primitive-pill-select-pill');
  act(() => {
    pill?.click();
  });
  const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
    (radio) => radio.textContent === label,
  );
  expect(option).toBeDefined();
  act(() => {
    option?.click();
  });
}

function selector(type: ChartType, comparing?: boolean): ReactNode {
  return comparing === undefined ? (
    <ChartTypeSelector personId="p1" type={type} view="wheel" />
  ) : (
    <ChartTypeSelector personId="p1" type={type} view="wheel" comparing={comparing} />
  );
}

function noteIn(container: HTMLElement): string | undefined {
  return container.querySelector('[data-kind="empty"]')?.textContent ?? undefined;
}

beforeEach(() => {
  setLocale('en');
  window.location.hash = '';
});

afterEach(() => {
  unmountAll();
  // Mount once more so a flag a test left set cannot leak into the next test.
  mount(selector('natal'));
  unmountAll();
  setLocale('en');
});

describe('the compare note when a natal comparison is left (#1810)', () => {
  for (const locale of ['en', 'nl'] as const) {
    it(`shows the note once on the next chart, in ${locale}`, () => {
      setLocale(locale);
      const t = chartTypesMessages[locale];
      const natal = mount(selector('natal', true));
      expect(noteIn(natal)).toBeUndefined();
      choose(natal, t.typeLabels.draconic);
      expect(window.location.hash).toBe('#/people/p1/charts/draconic/wheel');
      unmountAll();

      const draconic = mount(selector('draconic'));
      expect(noteIn(draconic)).toBe(t.compareNatalOnly);
      unmountAll();

      const again = mount(selector('draconic'));
      expect(noteIn(again)).toBeUndefined();
    });
  }

  it('keeps the note under StrictMode, and still shows it only once', () => {
    const t = chartTypesMessages.en;
    const natal = mount(selector('natal', true), true);
    choose(natal, t.typeLabels.harmonic);
    unmountAll();

    const harmonic = mount(selector('harmonic'), true);
    expect(noteIn(harmonic)).toBe(t.compareNatalOnly);
    unmountAll();

    expect(noteIn(mount(selector('harmonic'), true))).toBeUndefined();
  });

  it('sets no note when not comparing', () => {
    const t = chartTypesMessages.en;
    const natal = mount(selector('natal', false));
    choose(natal, t.typeLabels.draconic);
    unmountAll();
    expect(noteIn(mount(selector('draconic')))).toBeUndefined();
  });

  it('sets no note when the chosen type is natal', () => {
    const t = chartTypesMessages.en;
    const harmonic = mount(selector('harmonic', true));
    choose(harmonic, t.typeLabels.natal);
    expect(window.location.hash).toBe('#/people/p1/charts/natal/wheel');
    unmountAll();
    expect(noteIn(mount(selector('natal')))).toBeUndefined();
  });

  it('has the note in both locales', () => {
    expect(chartTypesMessages.en.compareNatalOnly).toBe('Comparison is available on the natal chart only.');
    expect(chartTypesMessages.nl.compareNatalOnly).toBe('Vergelijken kan alleen bij de geboortehoroscoop.');
  });
});

describe('the natal ChartView tells its selector when it is comparing (#1810)', () => {
  let counter = 0;
  let store: Store;

  beforeEach(async () => {
    counter += 1;
    localStorage.clear();
    store = await openStore({ name: `astraya-chart-compare-note-${String(counter)}` });
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

  /** Mounts the natal chart and waits for its chart-type pill, which appears once the chart has loaded. */
  async function mountNatal(compareType?: ChartType): Promise<HTMLElement> {
    const container = mount(
      <StoreProvider store={store}>
        <ExportRegistryProvider>
          <ChartView personId="p1" compareType={compareType} />
        </ExportRegistryProvider>
      </StoreProvider>,
    );
    await vi.waitFor(
      () => {
        expect(container.querySelector('.chart-type-select .primitive-pill-select-pill')).not.toBeNull();
      },
      { timeout: 20_000 },
    );
    return container;
  }

  it('comparison mode: choosing draconic leaves the note for the draconic chart', async () => {
    const t = chartTypesMessages.en;
    const natal = await mountNatal('draconic');
    choose(natal, t.typeLabels.draconic);
    expect(window.location.hash).toBe('#/people/p1/charts/draconic/wheel');
    unmountAll();
    expect(noteIn(mount(selector('draconic')))).toBe(t.compareNatalOnly);
  }, 30_000);

  it('plain natal: choosing draconic leaves no note', async () => {
    const t = chartTypesMessages.en;
    const natal = await mountNatal();
    choose(natal, t.typeLabels.draconic);
    unmountAll();
    expect(noteIn(mount(selector('draconic')))).toBeUndefined();
  }, 30_000);
});
