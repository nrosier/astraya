// @vitest-environment jsdom
/**
 * The "Hyleg and alcocoden" card on the Patterns view (#1799): it names the hyleg point and the alcocoden planet with the
 * rule that chose each, says so when no hyleg is found, and is absent without a prenatal syzygy. Against a real computed chart.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import type { PointVisibilityOptions } from '../src/domain/chart-tables.js';
import type { PrenatalSyzygy } from '../src/domain/prenatal-syzygy.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { renderPatternsView } from '../src/ui/ChartViewPatterns.js';
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

const syzygy: PrenatalSyzygy = {
  kind: 'prevention',
  jd: 2_440_000,
  sunLongitude: 150.5667,
  moonLongitude: 330.5667,
  degree: 150.5667,
};

async function mount(locale: 'en' | 'nl', given: PrenatalSyzygy | undefined): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const visibility: PointVisibilityOptions = {};
  await act(async () => {
    root.render(
      renderPatternsView(
        data,
        'Test',
        visibility,
        true,
        chartViewMessages[locale],
        locale,
        'modern',
        'egyptian',
        true,
        given,
      ),
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

describe('hyleg card (#1799)', () => {
  it.each(['en', 'nl'] as const)('is shown in %s with the hyleg and its rule, or the no-hyleg line', async (locale) => {
    const t = chartViewMessages[locale];
    const container = await mount(locale, syzygy);
    const card = container.querySelector('.hyleg-card');
    expect(card?.textContent).toContain(t.hylegHeading);
    expect(card?.textContent).toContain(t.hylegSourceNote);
    const none = container.querySelector('.hyleg-none');
    if (none === null) {
      expect(container.querySelector('.hyleg-point')?.textContent).toContain('°');
    } else {
      expect(none.textContent).toBe(t.noHyleg);
    }
  });

  it('is absent without a prenatal syzygy', async () => {
    const container = await mount('en', undefined);
    expect(container.querySelector('.hyleg-card')).toBeNull();
  });

  it('words the no-hyleg line as the brief requires', () => {
    expect(chartViewMessages.en.noHyleg).toBe('No hyleg found by this procedure');
    expect(chartViewMessages.nl.noHyleg).toBe('Geen hyleg gevonden met deze methode');
  });

  it('words the Dutch only-aspecting and lord-order alcocoden rules with grens, not bound (#1799)', () => {
    for (const key of ['only-aspecting', 'lord-order'] as const) {
      const label = chartViewMessages.nl.alcocodenRuleLabels[key];
      expect(label).toContain('grens');
      expect(label).not.toContain('bound');
    }
  });
});
