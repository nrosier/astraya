// @vitest-environment jsdom
/**
 * #888 — the Chart result region carries `aria-busy` while the chart calculates and drops it once the
 * calculation has ended, the same lifecycle the Astrocartography map uses. Driven through `ChartDataView`'s
 * `load` prop (loading, then error), so it needs no ephemeris engine; the ready state clears the same
 * `load.kind === 'loading'` condition.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { setLocale } from '../src/ui/locale.js';
import { getEngine } from './engine-harness.js';

type LoadProp = Parameters<typeof ChartDataView>[0]['load'];

let readyChart: ChartData;

beforeAll(async () => {
  readyChart = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      offsetOverrideMinutes: 0,
    },
    await getEngine(),
  );
}, 60_000);

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

async function render(load: LoadProp): Promise<HTMLElement> {
  if (mounted === undefined) {
    const container = document.createElement('div');
    document.body.append(container);
    mounted = { container, root: createRoot(container) };
  }
  const { container, root } = mounted;
  await act(async () => {
    root.render(
      <ExportRegistryProvider>
        <ChartDataView rulership="modern" load={load} displayName="Test" showHouses={true} buildViewHref={() => '#'} />
      </ExportRegistryProvider>,
    );
    await Promise.resolve();
  });
  return container;
}

const busyRegions = (container: HTMLElement): readonly string[] =>
  Array.from(container.querySelectorAll('div[aria-busy]')).map((el) => el.getAttribute('aria-busy') ?? '');

describe('the chart result region (#888)', () => {
  it('is aria-busy while calculating and cleared once the calculation ends', async () => {
    const container = await render({ kind: 'loading' });
    expect(busyRegions(container)).toEqual(['true']);

    await render({ kind: 'error', message: 'boom' });
    expect(busyRegions(container)).toEqual(['false']);
  });

  it('is cleared once the chart is ready', async () => {
    const container = await render({ kind: 'loading' });
    expect(busyRegions(container)).toEqual(['true']);

    const ready = await render(readyLoad());
    expect(ready.querySelector('.chart-wheel')).not.toBeNull();
    expect(busyRegions(ready)).toEqual(['false']);
  });
});

/** A `ready` load built from the real engine, so the chart renders as it does on screen. */
function readyLoad(): LoadProp {
  return { kind: 'ready', data: readyChart };
}
