// @vitest-environment jsdom
/**
 * The Patterns view shows a "Prenatal syzygy" row beside lunar phase and sect when it is given one (#1798). The
 * row is absent without the argument, and its position is left out when the degree is undefined.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import type { PointVisibilityOptions } from '../src/domain/chart-tables.js';
import type { PrenatalSyzygy } from '../src/domain/prenatal-syzygy.js';
import { signDisplayName } from '../src/ui/astro-names.messages.js';
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

/** A hand-built syzygy: the row shows its kind and degree, so the test needs no ephemeris call. */
const fullMoon: PrenatalSyzygy = {
  kind: 'prevention',
  jd: 2_440_000,
  sunLongitude: 150.5667,
  moonLongitude: 330.5667,
  degree: 150.5667,
};

const newMoonNoDegree: PrenatalSyzygy = {
  kind: 'conjunction',
  jd: 2_440_000,
  sunLongitude: 60,
  moonLongitude: 60,
  degree: undefined,
};

async function mount(locale: 'en' | 'nl', syzygy: PrenatalSyzygy | undefined): Promise<HTMLElement> {
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
        syzygy,
      ),
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

function syzygyRow(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.prenatal-syzygy-summary');
}

describe('prenatal syzygy row (#1798)', () => {
  it.each(['en', 'nl'] as const)('shows the kind and degree of a prevention in %s', async (locale) => {
    const t = chartViewMessages[locale];
    const container = await mount(locale, fullMoon);
    const row = syzygyRow(container);
    // 150.5667° is 0°34′ Virgo, so the position names Virgo (in the locale's name) and carries a degree sign.
    expect(row?.textContent).toContain(t.prenatalSyzygyKindLabels.prevention);
    expect(row?.textContent).toContain(signDisplayName('Virgo', locale));
    expect(row?.textContent).toContain('°');
    expect(container.textContent).toContain(t.prenatalSyzygyKeyLabel);
  });

  it.each(['en', 'nl'] as const)('labels a conjunction in %s', async (locale) => {
    const t = chartViewMessages[locale];
    const container = await mount(locale, newMoonNoDegree);
    expect(syzygyRow(container)?.textContent).toBe(t.prenatalSyzygyKindLabels.conjunction);
  });

  it('shows the English labels for the English locale', () => {
    expect(chartViewMessages.en.prenatalSyzygyKeyLabel).toBe('Prenatal syzygy');
    expect(chartViewMessages.en.prenatalSyzygyKindLabels.conjunction).toBe('New Moon (conjunction)');
    expect(chartViewMessages.en.prenatalSyzygyKindLabels.prevention).toBe('Full Moon (prevention)');
  });

  it('renders no syzygy row when the argument is absent', async () => {
    const container = await mount('en', undefined);
    expect(syzygyRow(container)).toBeNull();
    expect(container.textContent).not.toContain(chartViewMessages.en.prenatalSyzygyKeyLabel);
  });

  it('omits the position when the degree is undefined', async () => {
    const t = chartViewMessages.en;
    const container = await mount('en', newMoonNoDegree);
    const text = syzygyRow(container)?.textContent ?? '';
    expect(text).toBe(t.prenatalSyzygyKindLabels.conjunction);
    expect(text).not.toContain('°');
  });
});
