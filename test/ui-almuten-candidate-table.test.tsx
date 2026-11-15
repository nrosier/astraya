// @vitest-environment jsdom
/**
 * The almuten candidate table shows Detriment, Fall and Mutual reception, and an almuten-less chart shows its
 * empty state (#1609). The empty state uses a stubbed `almutenOfAscendant`, because a real chart always has one.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import type * as ChartTables from '../src/domain/chart-tables.js';
import type { PointVisibilityOptions } from '../src/domain/chart-tables.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { renderPatternsView } from '../src/ui/ChartViewPatterns.js';
import { getEngine } from './engine-harness.js';

const stub = vi.hoisted(() => ({ empty: false }));

vi.mock('../src/domain/chart-tables.js', async (importOriginal) => {
  const original = await importOriginal<typeof ChartTables>();
  return {
    ...original,
    almutenOfAscendant: (...args: Parameters<typeof original.almutenOfAscendant>) => {
      const real = original.almutenOfAscendant(...args);
      return stub.empty && real !== undefined ? { ...real, almutens: [] } : real;
    },
  };
});

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
  stub.empty = false;
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

async function mount(locale: 'en' | 'nl'): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const visibility: PointVisibilityOptions = {};
  await act(async () => {
    root.render(
      renderPatternsView(data, 'Test', visibility, true, chartViewMessages[locale], locale, 'modern', 'egyptian'),
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

function almutenTable(container: HTMLElement, locale: 'en' | 'nl'): HTMLTableElement | undefined {
  // The caption is a sibling heading that the table points at with aria-labelledby (SortableTable).
  return Array.from(container.querySelectorAll('table')).find(
    (el) =>
      document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ===
      chartViewMessages[locale].almutenBreakdownCaption,
  );
}

describe('almuten candidate table columns (#1609)', () => {
  it.each(['en', 'nl'] as const)('shows Detriment, Fall and Mutual reception in %s', async (locale) => {
    const t = chartViewMessages[locale];
    const container = await mount(locale);
    const headers = Array.from(almutenTable(container, locale)?.querySelectorAll('th') ?? []).map(
      (th) => th.textContent,
    );
    expect(headers.some((h) => h.includes(t.detrimentLabel))).toBe(true);
    expect(headers.some((h) => h.includes(t.fallLabel))).toBe(true);
    expect(headers.some((h) => h.includes(t.mutualReceptionLabel))).toBe(true);
  });

  it('shows yes, no or a dash in the Mutual reception cells', async () => {
    const container = await mount('en');
    const table = almutenTable(container, 'en');
    const headers = Array.from(table?.querySelectorAll('thead th') ?? []);
    const index = headers.findIndex((th) => th.textContent.includes(chartViewMessages.en.mutualReceptionLabel));
    expect(index).toBeGreaterThan(-1);
    const cells = Array.from(table?.querySelectorAll('tbody tr') ?? []).map(
      (row) => row.querySelectorAll('td, th')[index]?.textContent.trim() ?? '',
    );
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(['Yes', 'No', '—']).toContain(cell);
  });
});

describe('almuten empty state (#1609)', () => {
  it.each(['en', 'nl'] as const)('shows the "No almuten" text in %s when no planet scores above 0', async (locale) => {
    stub.empty = true;
    const container = await mount(locale);
    expect(container.querySelector('.almuten-summary')?.textContent).toContain(chartViewMessages[locale].noAlmuten);
  });
});
