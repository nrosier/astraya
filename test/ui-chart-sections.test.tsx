// @vitest-environment jsdom
/**
 * The natal chart screen's sections (#430): Chart (the default), Chart shape, Positions, Houses,
 * Aspects, Dignities and Derived points, as real tabs — each panel opening with its own h2, the wheel
 * staying mounted while another section is open, the chart-shape section explaining the shape and
 * holding the Moon phase and sect, and a chart without houses showing only what it can.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { setLocale } from '../src/ui/locale.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { ExportRegistryProvider, useExportItems } from '../src/ui/export-registry.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { getEngine } from './engine-harness.js';

/** Stands in for the header's Export menu: lists what the chart registered as buttons. */
function ExportProbe(): React.JSX.Element {
  const items = useExportItems();
  return (
    <div className="export-probe">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => {
            void item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

let data: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  data = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    await getEngine(),
  );
}, 60_000);

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

async function mount(options: { showHouses?: boolean; locale?: 'en' | 'nl' } = {}): Promise<HTMLElement> {
  setLocale(options.locale ?? 'en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExportRegistryProvider>
        <ChartDataView load={{ kind: 'ready', data }} displayName="Test" showHouses={options.showHouses ?? true} />
        <ExportProbe />
      </ExportRegistryProvider>,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

const tabLabels = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent);
const selectedTab = (container: HTMLElement): string | undefined =>
  Array.from(container.querySelectorAll('[role="tab"]')).find((tab) => tab.getAttribute('aria-selected') === 'true')
    ?.id;
async function open(container: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(`#chart-tab-${key}`)?.click();
    await Promise.resolve();
  });
}

describe('the chart sections (#430)', () => {
  it('has seven tabs in reading order, opening on the Chart', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    expect(tabLabels(container)).toEqual([
      t.chartTabLabel,
      t.shapeTabLabel,
      t.positionsCaption,
      t.housesCaption,
      t.aspectsCaption,
      t.dignitiesCaption,
      t.derivedPointsCaption,
    ]);
    expect(selectedTab(container)).toBe('chart-tab-chart');
    expect(container.querySelector('div.chart-wheel')).not.toBeNull();
  });

  it('every open panel starts with an h2 naming it, and only the open table section is in the page', async () => {
    const container = await mount();
    expect(container.querySelector('#chart-tabpanel-chart h2')?.textContent).toBe('Chart wheel');
    expect(container.querySelector('#chart-tabpanel-aspects')).toBeNull();
    await open(container, 'aspects');
    expect(container.querySelector('#chart-tabpanel-aspects h2')?.textContent).toBe('Aspects');
    expect(container.querySelector('#chart-tabpanel-positions')).toBeNull();
    expect(container.querySelector('#chart-tabpanel-aspects table')).not.toBeNull();
  });

  it('keeps the wheel mounted, hidden, while another section is open', async () => {
    const container = await mount();
    const wheel = container.querySelector('div.chart-wheel');
    await open(container, 'positions');
    expect(container.querySelector('div.chart-wheel')).toBe(wheel);
    expect(container.querySelector('#chart-tabpanel-chart')?.hasAttribute('hidden')).toBe(true);
    await open(container, 'chart');
    expect(container.querySelector('#chart-tabpanel-chart')?.hasAttribute('hidden')).toBe(false);
  });

  it('moves the arrow keys, Home and End along the tabs', async () => {
    const container = await mount();
    const strip = container.querySelector('[role="tablist"]');
    const press = async (key: string): Promise<void> => {
      await act(async () => {
        strip?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await Promise.resolve();
      });
    };
    await press('ArrowRight');
    expect(selectedTab(container)).toBe('chart-tab-shape');
    await press('End');
    expect(selectedTab(container)).toBe('chart-tab-derived');
    await press('ArrowRight');
    expect(selectedTab(container)).toBe('chart-tab-chart');
    await press('ArrowLeft');
    expect(selectedTab(container)).toBe('chart-tab-derived');
    await press('Home');
    expect(selectedTab(container)).toBe('chart-tab-chart');
  });

  it('puts the shape, its explanation, the Moon phase and the sect in the Chart shape section, not in Positions or Derived points', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    await open(container, 'shape');
    const panel = container.querySelector('#chart-tabpanel-shape');
    expect(panel?.querySelector('h2')?.textContent).toBe(t.shapeTabLabel);
    expect(panel?.querySelector('.chart-shape-diagram-wrap svg')).not.toBeNull();
    expect(panel?.textContent).toContain(t.shapeSourceNote);
    expect(Object.values(t.jonesShapeExplanations).some((text) => panel?.textContent.includes(text))).toBe(true);
    expect(panel?.querySelector('.lunar-phase-summary')?.textContent).toContain('Last Quarter Moon');
    expect(panel?.textContent).toMatch(/Sect: (Day|Night) chart/);

    await open(container, 'positions');
    expect(container.querySelector('.lunar-phase-summary')).toBeNull();
    expect(container.querySelector('.chart-shape-summary')).toBeNull();
    await open(container, 'derived');
    expect(container.querySelector('#chart-tabpanel-derived')?.textContent).not.toContain('Sect:');
  });

  it('explains every shape in both languages, worded as a tendency', () => {
    for (const locale of ['en', 'nl'] as const) {
      const t = chartViewMessages[locale];
      for (const shape of Object.keys(t.jonesShapeLabels) as (keyof typeof t.jonesShapeLabels)[]) {
        expect(t.jonesShapeExplanations[shape].length).toBeGreaterThan(60);
      }
      expect(t.shapeSourceNote).toContain('Jones');
      expect(t.shapeSourceNote).toContain('1941');
    }
  });

  it('shows the section names in Dutch', async () => {
    const container = await mount({ locale: 'nl' });
    expect(tabLabels(container)[0]).toBe(chartViewMessages.nl.chartTabLabel);
    expect(tabLabels(container)[1]).toBe(chartViewMessages.nl.shapeTabLabel);
  });

  it('without houses (an unknown birth time) drops the Chart, Houses and Derived points, and opens on the Chart shape', async () => {
    const container = await mount({ showHouses: false });
    const t = chartViewMessages.en;
    expect(tabLabels(container)).toEqual([t.shapeTabLabel, t.positionsCaption, t.aspectsCaption, t.dignitiesCaption]);
    expect(selectedTab(container)).toBe('chart-tab-shape');
    expect(container.querySelector('div.chart-wheel')).toBeNull();
    // The sect needs the Ascendant, so it is not claimed here; the Moon phase does not.
    expect(container.querySelector('#chart-tabpanel-shape')?.textContent).not.toContain('Sect:');
    expect(container.querySelector('.lunar-phase-summary')).not.toBeNull();
  });

  it('prints every section in order, each under its own h2, when exporting to PDF (#67)', async () => {
    const container = await mount();
    const print = vi.fn();
    window.print = print;
    await act(async () => {
      Array.from(container.querySelectorAll('.export-probe button'))
        .find((button) => button.textContent === chartViewMessages.en.exportPdf)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const stacked = container.querySelector('.chart-print-all');
    expect(stacked).not.toBeNull();
    const t = chartViewMessages.en;
    expect(Array.from(stacked?.querySelectorAll('h2') ?? []).map((heading) => heading.textContent)).toEqual([
      t.chartTabLabel,
      t.shapeTabLabel,
      t.positionsCaption,
      t.housesCaption,
      t.aspectsCaption,
      t.dignitiesCaption,
      t.derivedPointsCaption,
    ]);
    expect(stacked?.querySelector('div.chart-wheel')).not.toBeNull();
    await vi.waitFor(() => {
      expect(print).toHaveBeenCalled();
    });
    // The print dialog closing restores the tabs.
    await act(async () => {
      window.dispatchEvent(new Event('afterprint'));
      await Promise.resolve();
    });
    expect(container.querySelector('.chart-print-all')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('offers the chart’s exports to the header menu instead of drawing buttons under the wheel', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    expect(container.querySelector('.chart-export-actions')).toBeNull();
    expect(Array.from(container.querySelectorAll('.export-probe button')).map((b) => b.textContent)).toEqual([
      t.exportSvg,
      t.exportPng(t.pngSmall),
      t.exportPng(t.pngMedium),
      t.exportPng(t.pngLarge),
      t.exportPdf,
    ]);
  });

  it('offers none without a wheel (an unknown birth time has no chart image to export)', async () => {
    const container = await mount({ showHouses: false });
    expect(container.querySelectorAll('.export-probe button')).toHaveLength(0);
  });
});
