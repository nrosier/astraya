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
const { buildCalculationSnapshot, calculationSnapshotToJson, MAX_SNAPSHOT_FIXED_STARS } =
  await import('../src/domain/calculation-snapshot.js');
const { buildChartArtifact } = await import('../src/ui/chart-artifact.js');
const { DEFAULT_EXTENDED_SETTINGS } = await import('../src/chart/extended-settings.js');
const { writeRulershipChoice } = await import('../src/ui/rulership-setting.js');
const { computeChartData } = await import('../src/domain/chart-compute.js');
type ChartData = Awaited<ReturnType<typeof computeChartData>>;

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

  it('labels the shared chart with the link’s rulership, not the viewer’s device one (#806)', async () => {
    writeRulershipChoice('modern');
    const sent = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'traditional');
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
      const provenance = container.querySelector('.print-provenance')?.textContent ?? '';
      expect(provenance).toContain('Traditional');
      expect(provenance).not.toContain('Modern');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('recomputes with the sender’s own custom points, so the shared chart shows the same objects (#582)', async () => {
    const points = [{ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' }];
    const sent = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern', points);
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
      expect(vi.mocked(computeChartData).mock.calls[0]?.[2]?.customPoints).toEqual(points);
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

  it('refuses a link whose snapshot is from a newer app, with a reason, instead of computing a different chart (#717)', async () => {
    const sent = {
      ...calculationSnapshotToJson(buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern')),
      version: 999,
    };
    const query = encodeChartShareLink({ moment: MOMENT, settings: sent, housesKnown: true }).toString();
    const { container, root } = await mountWithHash(`#/shared?${query}`);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(computeChartData).not.toHaveBeenCalled();
      expect(container.textContent).toContain('newer version of Astraya');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  const REGULUS = {
    id: ',alLeo',
    name: 'Regulus',
    designation: 'alLeo',
    equinox: 'ICRS',
    sourceSha256: 'b'.repeat(64),
  };

  it('recomputes with the sender’s chosen fixed stars and shows them, not the preset (#860)', async () => {
    const sent = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern', [], [REGULUS]);
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
      expect(vi.mocked(computeChartData).mock.calls[0]?.[2]?.fixedStars).toEqual([REGULUS]);
      const data = (await vi.mocked(computeChartData).mock.results[0]?.value) as ChartData | undefined;
      expect([...(data?.fixedStars?.keys() ?? [])]).toEqual(['Regulus']);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('records the chosen stars in the shared chart’s artifact snapshot (#860)', async () => {
    const sent = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern', [], [REGULUS]);
    const artifact = await buildChartArtifact(
      sent,
      MOMENT,
      await computeChartData(MOMENT, engine, { fixedStars: [REGULUS] }),
      engine,
    );
    expect(artifact?.snapshot.fixedStars).toEqual([REGULUS]);
    const without = await buildChartArtifact(
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern'),
      MOMENT,
      await computeChartData(MOMENT, engine),
      engine,
    );
    expect(without?.snapshot.fixedStars).toEqual([]);
    expect(artifact?.fingerprint.snapshotHash).not.toBe(without?.fingerprint.snapshotHash);
  });

  it('opens a version-3 link with no chosen stars, so the preset applies (#860)', async () => {
    const old = { version: 3, settings: {}, rulership: 'modern', customPoints: [] };
    const query = encodeChartShareLink({ moment: MOMENT, settings: old, housesKnown: true }).toString();
    const { container, root } = await mountWithHash(`#/shared?${query}`);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(computeChartData).toHaveBeenCalledTimes(1);
      expect(vi.mocked(computeChartData).mock.calls[0]?.[2]?.fixedStars).toBeUndefined();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('says so, in words, when a link carries more chosen stars than the cap (#860)', async () => {
    const many = Array.from({ length: MAX_SNAPSHOT_FIXED_STARS + 1 }, (_, index) => ({
      ...REGULUS,
      id: `,s${String(index)}`,
    }));
    const forged = {
      ...calculationSnapshotToJson(buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern')),
      fixedStars: many,
    };
    const query = encodeChartShareLink({ moment: MOMENT, settings: forged, housesKnown: true }).toString();
    const { container, root } = await mountWithHash(`#/shared?${query}`);
    try {
      expect(container.textContent).toContain(`at most ${String(MAX_SNAPSHOT_FIXED_STARS)}`);
      expect(computeChartData).not.toHaveBeenCalled();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
