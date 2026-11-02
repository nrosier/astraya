// @vitest-environment jsdom
/**
 * Chart navigation vs page actions (#976). The view tab bar holds only view links (and the chart type select sits above
 * it); Export PDF, Overlay settings and Extended settings are page actions. Above 640px the Overlays trigger sits in the
 * PageHeader's action group; at 640px and below it moves into the "Chart actions" sheet of the tab row (#817).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { PageHeader } from '../src/ui/PageHeader.js';
import { PageActionsProvider } from '../src/ui/page-actions-slot.js';
import { setLocale } from '../src/ui/locale.js';
import { resetWheelCorpusCache } from '../src/ui/wheel-corpus.js';
import { getEngine } from './engine-harness.js';

const MOMENT = {
  civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
  coordinates: { latitude: 41.1833, longitude: -84.7333 },
  zoneOverride: 'America/New_York',
};

let data: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  data = await computeChartData(MOMENT, await getEngine());
}, 60_000);

/** The part of `MediaQueryList` the narrow-viewport hook reads; the deprecated `addListener` pair is deliberately absent. */
interface FakeMediaQueryList {
  readonly matches: boolean;
  readonly media: string;
  readonly addEventListener: () => void;
  readonly removeEventListener: () => void;
}

/** Stubs `matchMedia` so the 40rem (640px) narrow query matches or not. jsdom has no media queries of its own. */
function stubNarrow(narrow: boolean): void {
  vi.stubGlobal('matchMedia', (query: string): FakeMediaQueryList => ({
    matches: narrow && query === '(max-width: 40rem)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  resetWheelCorpusCache();
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = /\/corpus\/(en|nl)\.json$/.test(url) ? [] : { entries: [], results: [] };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const engine = await getEngine();
  await act(async () => {
    root.render(
      <PageActionsProvider>
        <PageHeader title="Natal chart">
          <a href="#/export">Export PDF</a>
        </PageHeader>
        <ChartDataView
          rulership="modern"
          load={{ kind: 'ready', data }}
          displayName="Test"
          showHouses
          buildViewHref={() => '#'}
          personId="p-abcdefghijklmnop"
          overlayContext={{ moment: MOMENT, provider: engine, baseLabel: 'Natal', baseSource: 'natal' }}
        />
      </PageActionsProvider>,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

describe('chart navigation vs page actions (#976)', () => {
  it('keeps the view tab row free of the Overlays trigger above 640px, and puts it in the PageHeader action group', async () => {
    stubNarrow(false);
    const container = await mount();
    const group = container.querySelector('.page-header-actions');
    expect(group).not.toBeNull();
    // Export PDF and Overlay settings share the PageHeader's top-right action group.
    expect(group?.querySelector('a')?.textContent).toBe('Export PDF');
    expect(group?.querySelector('button.chart-overlay-trigger')).not.toBeNull();
    // The tab row holds only view links: no pinned actions, no trigger, no sheet.
    expect(container.querySelector('.tab-row button.chart-overlay-trigger')).toBeNull();
    expect(container.querySelector('.tab-row__actions')).toBeNull();
    expect(container.querySelectorAll('.tab-row a.chart-view-link').length).toBeGreaterThan(0);
  });

  it('moves Overlays into the Chart actions sheet of the tab row at 640px and below (#817)', async () => {
    stubNarrow(true);
    const container = await mount();
    expect(container.querySelector('.page-header-actions button.chart-overlay-trigger')).toBeNull();
    expect(container.querySelector('.tab-row__actions-panel button.chart-overlay-trigger')).not.toBeNull();
    // The PDF link stays in the PageHeader on phones too.
    expect(container.querySelector('.page-header-actions a')?.textContent).toBe('Export PDF');
  });
});
