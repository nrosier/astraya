// @vitest-environment jsdom
/**
 * The Selection card's Sabian tier and motion badge (#817). The Sabian (degree-symbol) entry is shown only while the
 * device's degree-symbol setting is on (D-817b, 2026-10-29), in its own compact container; the primary header carries a
 * Direct or Rx badge from the primitive. Mounted through the real chart screen, with the corpus fetch stubbed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import type { CorpusEntry } from '../src/interpretation/schema.js';
import { setLocale } from '../src/ui/locale.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { DEGREE_SYMBOL_KEY } from '../src/ui/degree-symbol-setting.js';
import { resetWheelCorpusCache } from '../src/ui/wheel-corpus.js';
import { getEngine } from './engine-harness.js';

const corpus = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../src/interpretation/corpus/en.json'), 'utf8'),
) as CorpusEntry[];

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

beforeEach(() => {
  localStorage.clear();
  resetWheelCorpusCache();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\/corpus\/en\.json$/.exec(url) !== null) {
        return Promise.resolve(new Response(JSON.stringify(corpus), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
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
  setLocale('en');
});

async function mount(): Promise<HTMLElement> {
  setLocale('en');
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
  mounted = { container, root };
  return container;
}

async function click(container: HTMLElement, selector: string): Promise<void> {
  const hit = container.querySelector(`.chart-wheel-interactive ${selector} .chart-hit-area`);
  if (hit === null) throw new Error(`test fixture bug: no hit area under ${selector}`);
  act(() => {
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  });
}

const sabian = (container: HTMLElement): HTMLElement | null => container.querySelector('.selection-sabian');

describe('Selection card Sabian tier (#817, D-817b)', () => {
  it('shows the Sabian container for a selected body while the degree-symbol setting is on (the default)', async () => {
    const container = await mount();
    await click(container, '.chart-point[data-body="sun"]');
    expect(sabian(container)).not.toBeNull();
    expect(sabian(container)?.querySelector('h5')?.textContent).toBe('Degree or Sabian symbol');
  });

  it('hides the Sabian container while the degree-symbol setting is off, and keeps the other sections', async () => {
    localStorage.setItem(DEGREE_SYMBOL_KEY, 'false');
    const container = await mount();
    await click(container, '.chart-point[data-body="sun"]');
    expect(sabian(container)).toBeNull();
    // The sign section still shows: only the Sabian tier is removed.
    expect(container.querySelector('.chart-isolation-interpretation')?.textContent).toContain('Sun — Capricorn');
  });
});

describe('Selection card motion badge (#817)', () => {
  it('labels a direct body Direct, and a retrograde body Rx, with the primitive badge', async () => {
    const container = await mount();
    await click(container, '.chart-point[data-body="sun"]');
    const badges = [...container.querySelectorAll('.selection-inspector-badges .primitive-badge')].map(
      (node) => node.textContent,
    );
    expect(badges).toContain('Direct');
    // The Sun is never retrograde, so its badge carries no accent tone.
    const motion = [...container.querySelectorAll('.selection-inspector-badges .primitive-badge')].find(
      (node) => node.textContent === 'Direct',
    );
    expect(motion?.getAttribute('data-tone')).toBeNull();
  });
});
