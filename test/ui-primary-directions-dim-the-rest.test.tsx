// @vitest-environment jsdom
/**
 * #1302 Bug 1 — "dim the rest": on the primary-directions bi-wheel the selected significators stay at full strength and
 * every other point is dimmed (`chart-point-muted`), on both the natal and the directed ring. Nothing is removed. Runs
 * against the real ephemeris engine (no mocks of the calculation).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderMultiWheelSvg } from '../src/chart/multi-wheel.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => {
  const moment = {
    civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    coordinates: { latitude: 41.1833, longitude: -84.7333 },
    offsetOverrideMinutes: 0,
  };
  const person = {
    id: 'p1',
    displayName: 'Test',
    timeAccuracy: 'exact',
    moment,
    placeLabel: 'Fort Wayne, IN',
    notes: '',
    missing: [],
    customPoints: [],
  };
  const state = { people: new Map([[person.id, person]]), birthNotes: new Map(), consultationNotes: new Map() };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { PrimaryDirectionsView } = await import('../src/ui/PrimaryDirectionsView.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

async function untilSettled(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600; i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    if (container.querySelector('div[aria-busy="true"]') === null && container.querySelector('.chart-wheel') !== null)
      return;
  }
}

/** Per ring, the body keys of the glyph groups that are (or are not) dimmed. */
function glyphKeys(container: HTMLElement, ring: number, muted: boolean): string[] {
  return Array.from(container.querySelectorAll<SVGGElement>(`g.chart-point[data-ring="${String(ring)}"]`))
    .filter((g) => g.classList.contains('chart-point-muted') === muted)
    .map((g) => g.getAttribute('data-body') ?? '');
}

describe('primary directions: dim the rest (#1302)', () => {
  it('dims non-significators and keeps significators at full strength on both rings', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted = { container, root };
    act(() => {
      root.render(<PrimaryDirectionsView personId="p1" />);
    });
    await untilSettled(container);

    // Default significators are asc, mc, sun, moon: of the bodies, only sun and moon are emphasized.
    for (const ring of [0, 1]) {
      expect(glyphKeys(container, ring, false).sort()).toEqual(['moon', 'sun']);
      const dimmed = glyphKeys(container, ring, true);
      expect(dimmed.length).toBeGreaterThan(0);
      expect(dimmed).not.toContain('sun');
      expect(dimmed).not.toContain('moon');
      // Their ticks follow their glyph.
      const ticks = Array.from(container.querySelectorAll(`line.chart-body-tick[data-ring="${String(ring)}"]`));
      for (const tick of ticks) {
        const key = tick.getAttribute('data-body') ?? '';
        expect(tick.classList.contains('chart-point-muted')).toBe(key !== 'sun' && key !== 'moon');
      }
    }
    // Nothing is removed: every point on each ring is either emphasized or dimmed.
    for (const ring of [0, 1]) {
      const all = container.querySelectorAll(`g.chart-point[data-ring="${String(ring)}"]`).length;
      expect(all).toBeGreaterThan(2);
      expect(glyphKeys(container, ring, true).length + glyphKeys(container, ring, false).length).toBe(all);
    }
  });

  it('dims nothing when no emphasis set is given', () => {
    const houses = {
      ascendant: 10,
      midheaven: 280,
      armc: 280,
      vertex: 0,
      cusps: [0, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340],
    } as unknown as Parameters<typeof renderMultiWheelSvg>[0][number]['houses'];
    const bodies = [
      { body: 0 as never, key: 'sun', longitude: 100 },
      { body: 1 as never, key: 'moon', longitude: 200 },
    ];
    const svg = renderMultiWheelSvg([
      { label: 'A', houses, bodies },
      { label: 'B', houses, bodies },
    ]);
    expect(svg).not.toContain('chart-point-muted');
    const some = renderMultiWheelSvg(
      [
        { label: 'A', houses, bodies },
        { label: 'B', houses, bodies },
      ],
      [],
      { emphasizedBodies: ['sun'] },
    );
    expect(some.match(/chart-point-muted/g)?.length).toBeGreaterThan(0);
  });
});
