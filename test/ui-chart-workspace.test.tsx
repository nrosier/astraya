// @vitest-environment jsdom
/**
 * The chart workspace layout (#801): the sender-side share UI is gone in both languages, the view links
 * sit under the title behind a plain "Extended settings:" prefix, and the selection panel carries its
 * three named sections, placement badges, and an AI button that waits for consent.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { setLocale } from '../src/ui/locale.js';
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
  setLocale('en');
});

async function mount(locale: 'en' | 'nl'): Promise<HTMLElement> {
  setLocale(locale);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChartDataView load={{ kind: 'ready', data }} displayName="Test" showHouses buildViewHref={() => '#'} />,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
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
});
