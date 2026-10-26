// @vitest-environment jsdom
/**
 * The chart workspace layout (#801): the sender-side share UI is gone in both languages, the view links
 * sit under the title behind a plain "Extended settings:" prefix, and the selection panel carries its
 * three named sections, placement badges, and an AI button that waits for consent.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { focusInterpretationMessages } from '../src/ui/FocusInterpretation.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { resetWheelCorpusCache } from '../src/ui/wheel-corpus.js';
import { getEngine } from './engine-harness.js';

// A signed-in viewer, so the AI button's only remaining gate is the consent box.
// One stable object, as the real session gives: a new one per render would re-run effects keyed on it.
const USER = { id: 'u1', username: 'alice', isAdmin: false };
vi.mock('../src/ui/session-context.js', () => ({
  useSessionUserOrUndefined: () => USER,
}));

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
  resetWheelCorpusCache();
  // An empty corpus: every placement falls back to its mechanical sentence, which is enough to group.
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
  setLocale('en');
});

async function mount(locale: 'en' | 'nl'): Promise<HTMLElement> {
  setLocale(locale);
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
        personId="p-abcdefghijklmnop"
      />,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

async function select(container: HTMLElement, selector: string): Promise<void> {
  const hit = container.querySelector(`.chart-wheel-interactive ${selector} .chart-hit-area`);
  if (hit === null) throw new Error(`fixture bug: no hit area under ${selector}`);
  act(() => {
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // The interpretation corpus arrives asynchronously.
  await act(async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  });
}

describe('the chart workspace (#801)', () => {
  it.each(['en', 'nl'] as const)('has no share link text or "Chart wheel" heading in %s', async (locale) => {
    const container = await mount(locale);
    const text = container.textContent;
    for (const key of ['copyShareLink', 'linkCopied', 'shareLinkHint', 'shareLinkWarning', 'chartTabLabel']) {
      expect(chartViewMessages[locale]).not.toHaveProperty(key);
    }
    expect(text).not.toMatch(/share link|deellink/i);
    expect(container.querySelector('#chart-view-wheel h2')).toBeNull();
    expect(readFileSync('src/ui/ChartView.tsx', 'utf-8')).not.toMatch(/ShareLink|encodeChartShareLink/);
  });

  it.each(['en', 'nl'] as const)('puts a plain "%s" prefix before the six view links', async (locale) => {
    const container = await mount(locale);
    const prefix = container.querySelector('.chart-view-prefix');
    expect(prefix?.textContent).toBe(chartViewMessages[locale].extendedSettingsPrefix);
    expect(prefix?.closest('a, button')).toBeNull();
    expect(container.querySelectorAll('.chart-view-link')).toHaveLength(6);
    expect(container.querySelectorAll('[role="tab"], [role="tablist"]')).toHaveLength(0);
  });

  it('shows the three section headings once each for a body selection', async () => {
    const container = await mount('en');
    await select(container, '.chart-point[data-body="sun"]');
    const t = chartViewMessages.en;
    const headings = [...container.querySelectorAll('.selection-inspector h5')].map((h) => h.textContent);
    expect(headings).toEqual([t.signSectionHeading, t.houseSectionHeading, t.degreeSectionHeading]);
  });

  it("keeps 'Interpret tensions' disabled until the consent box is ticked", async () => {
    const container = await mount('en');
    await select(container, '.chart-point[data-body="sun"]');
    const inspector = container.querySelector('.selection-inspector');
    const generate = [...(inspector?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === focusInterpretationMessages.en.generate,
    );
    const consent = inspector?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (generate === undefined || consent === null || consent === undefined) throw new Error('no AI block');
    expect(generate.disabled).toBe(true);
    await act(async () => {
      consent.click();
      await Promise.resolve();
    });
    expect(generate.disabled).toBe(false);
  });
});
