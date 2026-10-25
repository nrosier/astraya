// @vitest-environment jsdom
/**
 * The natal chart screen's views (#511): Wheel (the default), Aspects, Placements, and Patterns &
 * condition — route-level links, not ARIA tabs (`docs/ui/UI-UX_GUIDELINES.md` §2) — each panel opening
 * with its own h2, the wheel staying mounted while another view is open, Patterns & condition holding
 * the chart shape explanation, the Moon phase and the sect, and a chart without houses showing only
 * what it can.
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
        <ChartDataView
          load={{ kind: 'ready', data }}
          displayName="Test"
          showHouses={options.showHouses ?? true}
          buildViewHref={() => '#'}
        />
        <ExportProbe />
      </ExportRegistryProvider>,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

const viewLabels = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('.chart-view-link')).map((link) => link.textContent);
const activeViewLabel = (container: HTMLElement): string | undefined =>
  container.querySelector('.chart-view-link.active')?.textContent ?? undefined;
async function open(container: HTMLElement, label: string): Promise<void> {
  const link = Array.from(container.querySelectorAll<HTMLAnchorElement>('.chart-view-link')).find(
    (candidate) => candidate.textContent === label,
  );
  await act(async () => {
    link?.click();
    await Promise.resolve();
  });
}

describe('the chart views (#511)', () => {
  it('has six views in reading order, opening on Wheel', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    expect(viewLabels(container)).toEqual([
      t.wheelViewLabel,
      t.aspectsViewLabel,
      t.matrixViewLabel,
      t.elementsViewLabel,
      t.placementsViewLabel,
      t.patternsViewLabel,
    ]);
    expect(activeViewLabel(container)).toBe(t.wheelViewLabel);
    expect(container.querySelector('div.chart-wheel')).not.toBeNull();
  });

  it('every open table panel starts with an h2 naming it, and only the open view is in the page', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    // The wheel view no longer opens on a "Chart wheel" heading (#801): the view links name it.
    expect(container.querySelector('#chart-view-wheel h2')).toBeNull();
    expect(container.querySelector('#chart-view-aspects')).toBeNull();
    await open(container, t.aspectsViewLabel);
    expect(container.querySelector('#chart-view-aspects h2')?.textContent).toBe(t.aspectsViewLabel);
    expect(container.querySelector('#chart-view-placements')).toBeNull();
    expect(container.querySelector('#chart-view-aspects table')).not.toBeNull();
  });

  it('keeps the wheel mounted, hidden, while another view is open', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    const wheel = container.querySelector('div.chart-wheel');
    await open(container, t.placementsViewLabel);
    expect(container.querySelector('div.chart-wheel')).toBe(wheel);
    expect(container.querySelector('#chart-view-wheel')?.hasAttribute('hidden')).toBe(true);
    await open(container, t.wheelViewLabel);
    expect(container.querySelector('#chart-view-wheel')?.hasAttribute('hidden')).toBe(false);
  });

  it('is not an ARIA tablist (#511): the views are ordinary links', async () => {
    const container = await mount();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('nav.chart-view-nav')).not.toBeNull();
    expect(container.querySelector('.chart-view-link')?.tagName).toBe('A');
  });

  it('puts the shape, its explanation, the Moon phase and the sect in Patterns & condition, not in Placements', async () => {
    const container = await mount();
    const t = chartViewMessages.en;
    await open(container, t.patternsViewLabel);
    const panel = container.querySelector('#chart-view-patterns');
    expect(panel?.querySelector('h3')?.textContent).toBe(t.shapeTabLabel);
    expect(panel?.querySelector('.chart-shape-diagram-wrap svg')).not.toBeNull();
    expect(panel?.textContent).toContain(t.shapeSourceNote);
    expect(Object.values(t.jonesShapeExplanations).some((text) => panel?.textContent.includes(text))).toBe(true);
    expect(panel?.querySelector('.lunar-phase-summary')?.textContent).toContain('Last Quarter Moon');
    expect(panel?.textContent).toMatch(/Sect: (Day|Night) chart/);

    await open(container, t.placementsViewLabel);
    expect(container.querySelector('.lunar-phase-summary')).toBeNull();
    expect(container.querySelector('.chart-shape-summary')).toBeNull();
    expect(container.querySelector('#chart-view-placements')?.textContent).not.toContain('Sect:');
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

  it('shows the view names in Dutch', async () => {
    const container = await mount({ locale: 'nl' });
    expect(viewLabels(container)[0]).toBe(chartViewMessages.nl.wheelViewLabel);
    expect(viewLabels(container)[2]).toBe(chartViewMessages.nl.matrixViewLabel);
    expect(viewLabels(container)[3]).toBe(chartViewMessages.nl.elementsViewLabel);
    expect(viewLabels(container)[5]).toBe(chartViewMessages.nl.patternsViewLabel);
  });

  it('without houses (an unknown birth time) drops Wheel and opens on Aspects; Placements and Patterns skip their houses-dependent parts', async () => {
    const container = await mount({ showHouses: false });
    const t = chartViewMessages.en;
    expect(viewLabels(container)).toEqual([
      t.aspectsViewLabel,
      t.matrixViewLabel,
      t.elementsViewLabel,
      t.placementsViewLabel,
      t.patternsViewLabel,
    ]);
    expect(activeViewLabel(container)).toBe(t.aspectsViewLabel);
    expect(container.querySelector('div.chart-wheel')).toBeNull();

    await open(container, t.placementsViewLabel);
    expect(container.querySelector('#chart-view-placements')?.textContent).not.toContain(t.housesCaption);
    expect(container.querySelector('#chart-view-placements')?.textContent).not.toContain(t.derivedPointsCaption);

    await open(container, t.patternsViewLabel);
    // The sect needs the Ascendant, so it is not claimed here; the Moon phase does not.
    expect(container.querySelector('#chart-view-patterns')?.textContent).not.toContain('Sect:');
    expect(container.querySelector('.lunar-phase-summary')).not.toBeNull();
  });

  it('prints every view in order, each under its own h2, when exporting to PDF (#67)', async () => {
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
      t.aspectsViewLabel,
      t.matrixViewLabel,
      t.elementsViewLabel,
      t.placementsViewLabel,
      t.patternsViewLabel,
    ]);
    expect(stacked?.querySelector('div.chart-wheel')).not.toBeNull();
    await vi.waitFor(() => {
      expect(print).toHaveBeenCalled();
    });
    // The print dialog closing restores the views.
    await act(async () => {
      window.dispatchEvent(new Event('afterprint'));
      await Promise.resolve();
    });
    expect(container.querySelector('.chart-print-all')).toBeNull();
    expect(container.querySelector('nav.chart-view-nav')).not.toBeNull();
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
