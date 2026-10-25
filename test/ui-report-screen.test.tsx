// @vitest-environment jsdom
/**
 * Regression for #732, against the real engine: the Report page computes the chart the Charts page
 * draws — the confirmed Extended settings, rulers and the person's custom points — not a
 * default-settings chart under the same heading. Spies on the real `computeChartData` (never
 * replacing it) so the assertion is on the exact options it was called with, as
 * `ui-shared-chart-view.test.tsx` does for #541.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as ChartComputeModule from '../src/domain/chart-compute.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

const ADA: Person = {
  id: 'p-ada',
  displayName: 'Ada Lovelace',
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
    offsetOverrideMinutes: 0,
  },
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
  customPoints: [{ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' }],
};

// The person under test; a test gives them their own calculation settings (#806) by replacing this.
const shown = { person: ADA };
vi.mock('../src/ui/store-context.js', () => ({
  useStoreState: () => ({ people: new Map([[shown.person.id, shown.person]]) }),
  useStore: () => ({ mutate: () => Promise.resolve() }),
}));

vi.mock('../src/domain/chart-compute.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ChartComputeModule>();
  return { ...actual, computeChartData: vi.fn(actual.computeChartData) };
});

const { ReportScreen } = await import('../src/ui/ReportScreen.js');
const { computeChartData } = await import('../src/domain/chart-compute.js');
const { DEFAULT_EXTENDED_SETTINGS } = await import('../src/chart/extended-settings.js');
const setPersonSettings = (settings: typeof DEFAULT_EXTENDED_SETTINGS): void => {
  shown.person = { ...ADA, calculationSettings: settings };
};
const { writeRulershipChoice } = await import('../src/ui/rulership-setting.js');

afterEach(() => {
  shown.person = ADA;
  localStorage.clear();
  vi.mocked(computeChartData).mockClear();
});

async function mount(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReportScreen personId={ADA.id} />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

describe('the Report page computes the Charts page’s chart (#732)', () => {
  it('uses the person’s own settings, the rulership and the person’s custom points', async () => {
    writeRulershipChoice('traditional');
    setPersonSettings({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W', orbScalePercent: -40, nodeVariant: 'true' });

    const { container, root } = await mount();
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(computeChartData).toHaveBeenCalled();
      const options = vi.mocked(computeChartData).mock.calls.at(-1)?.[2];
      expect(options?.houseSystem).toBe('W');
      expect(options?.orbConfig?.scalePercent).toBe(-40);
      expect(options?.nodeVariant).toBe('true');
      expect(options?.rulership).toBe('traditional');
      expect(options?.customPoints).toEqual(ADA.customPoints);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('leaves an excluded object out of the reading and says so, while a hidden one stays in (#721)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/api/')) return new Response(JSON.stringify({ entries: [] }));
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        return new Response(readFileSync(resolve(import.meta.dirname, '../public/corpus/en.json'), 'utf8'));
      }),
    );
    setPersonSettings({
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        mars: { visible: true, aspectParticipant: true, interpreted: false },
        venus: { visible: false, aspectParticipant: true },
      },
    });
    const { container, root } = await mount();
    try {
      for (let i = 0; i < 20 && container.querySelector('.report-scope') === null; i++) {
        await act(async () => {
          await new Promise((done) => setTimeout(done, 25));
        });
      }
      const scope = container.querySelector('.report-scope');
      expect(scope?.textContent).toContain('This reading leaves out: Mars.');
      const headings = Array.from(container.querySelectorAll('.report-placement-label, h4')).map(
        (node) => node.textContent,
      );
      expect(headings.some((text) => /\bMars\b/.test(text))).toBe(false);
      // Venus is only hidden on the wheel, so the reading still speaks about it.
      expect(headings.some((text) => /\bVenus\b/.test(text))).toBe(true);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

describe('an unreadable per-person settings register (#806)', () => {
  it('shows a notice instead of drawing a chart from defaults', async () => {
    shown.person = { ...ADA, calculationSettingsUnreadable: true };
    const { container, root } = await mount();
    try {
      expect(container.textContent).toContain('saved chart settings');
      expect(computeChartData).not.toHaveBeenCalled();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
