// @vitest-environment jsdom
/**
 * The prenatal syzygy row (#1798) is a natal-chart fact: a non-natal chart type (here, the
 * relocated chart) does not get it. Against a real computed chart and the real Patterns view.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { getEngine } from './engine-harness.js';

const BIRTH = {
  civil: { year: 1879, month: 3, day: 14, hour: 11, minute: 30, second: 0 },
  coordinates: { latitude: 48.4, longitude: 9.99 },
  zoneOverride: 'Europe/Berlin',
};

let data: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  data = await computeChartData(BIRTH, await getEngine());
}, 60_000);

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

/** Mounts the Patterns view for a chart of `chartType`, with a known birth time and an overlay context. */
async function mountPatterns(chartType: 'natal' | 'relocated' | undefined): Promise<HTMLElement> {
  const engine = await getEngine();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChartDataView
        rulership="modern"
        load={{ kind: 'ready', data }}
        displayName="Test"
        showHouses
        chartType={chartType}
        overlayContext={{ moment: BIRTH, provider: engine, baseLabel: 'Natal' }}
        buildViewHref={() => '#'}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLAnchorElement>('.chart-view-link'))
      .find((link) => link.textContent === chartViewMessages.en.patternsViewLabel)
      ?.click();
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

/** Lets the prenatal syzygy effect (an async ephemeris call) settle before reading the DOM. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
}

describe('prenatal syzygy row is natal-only (#1798)', () => {
  it('a natal chart shows the row', async () => {
    const container = await mountPatterns('natal');
    await settle();
    expect(container.textContent).toContain(chartViewMessages.en.prenatalSyzygyKeyLabel);
  });

  it('a relocated (non-natal) chart does not show the row', async () => {
    const container = await mountPatterns('relocated');
    await settle();
    expect(container.textContent).not.toContain(chartViewMessages.en.prenatalSyzygyKeyLabel);
  });
});
