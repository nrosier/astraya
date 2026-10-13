// @vitest-environment jsdom
/**
 * End-to-end regression for #541, against the real engine: a shared chart recomputes under
 * the *sender's* settings, carried in the link, not this viewer's own ambient device rulership
 * preference — even when the two genuinely disagree. Spies on the real `computeChartData`
 * (never replacing it) so the assertion is on the exact options it was called with, rather
 * than a fragile match against rendered DOM text.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as ChartComputeModule from '../src/domain/chart-compute.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

vi.mock('../src/domain/chart-compute.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ChartComputeModule>();
  return { ...actual, computeChartData: vi.fn(actual.computeChartData) };
});

const { SharedChartView } = await import('../src/ui/SharedChartView.js');
const { encodeChartShareLink } = await import('../src/domain/chart-share.js');
const { buildCalculationSnapshot, calculationSnapshotToJson } = await import('../src/domain/calculation-snapshot.js');
const { DEFAULT_EXTENDED_SETTINGS } = await import('../src/chart/extended-settings.js');
const { writeRulershipChoice } = await import('../src/ui/rulership-setting.js');
const { computeChartData } = await import('../src/domain/chart-compute.js');

const MOMENT = {
  civil: { year: 1990, month: 10, day: 23, hour: 1, minute: 0, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

afterEach(() => {
  localStorage.clear();
  vi.mocked(computeChartData).mockClear();
});

async function mountWithHash(hash: string): Promise<{ container: HTMLElement; root: Root }> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SharedChartView />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

describe('a shared chart recomputes under the sender’s own settings, not the viewer’s (#541)', () => {
  it('calls computeChartData with the link’s own settings, ignoring the viewer’s ambient rulership choice', async () => {
    // The viewer's own device is set to modern — if the old bug were still present, this is
    // exactly what SharedChartView would pass to computeChartData instead of the link's own.
    writeRulershipChoice('modern');

    const sent = buildCalculationSnapshot(
      { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W', orbScalePercent: -40 },
      'traditional',
    );
    const query = encodeChartShareLink({
      moment: MOMENT,
      settings: calculationSnapshotToJson(sent),
      housesKnown: true,
    }).toString();

    const { container, root } = await mountWithHash(`#/shared?${query}`);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(computeChartData).toHaveBeenCalledTimes(1);
      const options = vi.mocked(computeChartData).mock.calls[0]?.[2];
      expect(options?.rulership).toBe('traditional');
      expect(options?.houseSystem).toBe('W');
      expect(options?.orbConfig?.scalePercent).toBe(-40);
      // The ambient device setting itself was never touched by any of this.
      expect(localStorage.getItem('astraya:rulershipChoice')).toBe('modern');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('a pre-#541 link with an empty settings bag still computes under the app defaults, without crashing', async () => {
    const query = encodeChartShareLink({ moment: MOMENT, settings: {}, housesKnown: true }).toString();
    const { container, root } = await mountWithHash(`#/shared?${query}`);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(computeChartData).toHaveBeenCalledTimes(1);
      const options = vi.mocked(computeChartData).mock.calls[0]?.[2];
      expect(options?.rulership).toBe('modern');
      expect(options?.houseSystem).toBe('P');
      expect(container.querySelector('main')).not.toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
