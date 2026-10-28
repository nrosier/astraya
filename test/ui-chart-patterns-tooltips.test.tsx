// @vitest-environment jsdom
/**
 * The almuten and dispositors "?" markers on the Patterns & condition view are real disclosures
 * (#456): hovering, clicking or focusing them opens the same visible explanation, not a native
 * `title` tooltip (invisible to a keyboard user) or an unwired button that "does literally nothing"
 * when clicked. Against a real computed chart.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { getEngine } from './engine-harness.js';

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
});

async function mountOnPatterns(): Promise<HTMLElement> {
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
        buildViewHref={() => '#'}
      />,
    );
    await Promise.resolve();
  });
  // Patterns & condition isn't the view ChartDataView opens on by default, so switch to it the
  // same way a reader clicking the nav would (#511's view names: ChartViewNav links by label).
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLAnchorElement>('.chart-view-link'))
      .find((link) => link.textContent === chartViewMessages.en.patternsViewLabel)
      ?.click();
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

describe('almuten and dispositors tooltips on Patterns & condition (#456)', () => {
  it('are real Tooltip triggers, not a bare title span or an unwired button', async () => {
    const container = await mountOnPatterns();
    const panel = container.querySelector('#chart-view-patterns');
    expect(panel).not.toBeNull();

    const almuten = panel?.querySelector(`button[aria-label="${chartViewMessages.en.almutenTooltipLabel}"]`);
    const dispositors = panel?.querySelector(`button[aria-label="${chartViewMessages.en.dispositorsTooltipLabel}"]`);
    expect(almuten).not.toBeNull();
    expect(dispositors).not.toBeNull();
    // Neither carries a native `title` — that's the broken, invisible-to-keyboard mechanism this
    // replaces, so its presence here would mean the migration didn't actually happen.
    expect(almuten?.hasAttribute('title')).toBe(false);
    expect(dispositors?.hasAttribute('title')).toBe(false);
    expect(almuten?.getAttribute('aria-expanded')).toBe('false');
    expect(dispositors?.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking the dispositors "?" opens its popup — the exact click that used to do nothing', async () => {
    const container = await mountOnPatterns();
    const button = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${chartViewMessages.en.dispositorsTooltipLabel}"]`,
    );
    expect(button).not.toBeNull();
    expect(container.querySelector('[role="tooltip"]')).toBeNull();

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(button?.getAttribute('aria-expanded')).toBe('true');
    const popup = container.querySelector('[role="tooltip"]');
    expect(popup?.textContent).toBe(chartViewMessages.en.dispositorsTooltip);
  });

  it('focusing the almuten "?" opens its popup, for a keyboard user with no mouse to hover with', async () => {
    const container = await mountOnPatterns();
    const button = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${chartViewMessages.en.almutenTooltipLabel}"]`,
    );
    expect(button).not.toBeNull();

    await act(async () => {
      button?.focus();
      await Promise.resolve();
    });

    expect(button?.getAttribute('aria-expanded')).toBe('true');
    const popup = container.querySelector('[role="tooltip"]');
    expect(popup?.textContent).toBe(chartViewMessages.en.almutenTooltip);
  });
});

describe('the Dispositors chain on Patterns & condition (#870)', () => {
  it('shows the arrows between bodies in a muted token, and keeps the chain text whole', async () => {
    const container = await mountOnPatterns();
    const panel = container.querySelector('#chart-view-patterns');
    const dispositors = panel?.querySelector('.dispositors-section-header')?.closest('section') ?? panel;
    const muted = dispositors?.querySelectorAll('.data-table-muted');
    const arrows = Array.from(muted ?? []).filter((el) => el.textContent.trim() === '→');
    expect(arrows.length).toBeGreaterThan(0);
    // Every chain has at least one arrow once it runs past its first body.
    expect(dispositors?.textContent).not.toContain('→→');
  });
});

describe('column alignment on Patterns & condition (#870)', () => {
  const t = chartViewMessages.en;
  const alignIn = (panel: Element | null | undefined, caption: string, label: string): string | null | undefined => {
    const section = [...(panel?.querySelectorAll('section.data-table') ?? [])].find(
      (candidate) => candidate.querySelector('h2, h3, h4')?.textContent.startsWith(caption) === true,
    );
    return [...(section?.querySelectorAll('thead th') ?? [])]
      .find((th) => th.textContent.trim().startsWith(label))
      ?.getAttribute('data-align');
  };

  it('right-aligns POINTS, left-aligns the BODY columns and centres the flag columns', async () => {
    const container = await mountOnPatterns();
    const panel = container.querySelector('#chart-view-patterns');
    expect(alignIn(panel, t.dignitiesCaption, t.dignityPointsLabel)).toBe('end');
    expect(alignIn(panel, t.dignitiesCaption, t.bodyLabel)).toBe('start');
    expect(alignIn(panel, t.dignitiesCaption, t.rulerLabel)).toBe('center');
    expect(alignIn(panel, t.receptionCaption, t.bodyALabel)).toBe('start');
    expect(alignIn(panel, t.receptionCaption, t.bodyBLabel)).toBe('start');
    expect(alignIn(panel, t.receptionCaption, t.receptionSameTypeLabel)).toBe('center');
  });
});

describe('the Patterns key-value metrics (#870)', () => {
  it('shows Lunar phase, Sect and Almuten of Ascendant as flat key-value cards', async () => {
    const container = await mountOnPatterns();
    const cards = container.querySelectorAll('#chart-view-patterns dl.metric-cards > .flat-card');
    expect([...cards].map((card) => card.querySelector('dt')?.textContent)).toEqual([
      chartViewMessages.en.lunarPhaseKeyLabel,
      chartViewMessages.en.sectKeyLabel,
      chartViewMessages.en.almutenKeyLabel,
    ]);
  });
});
