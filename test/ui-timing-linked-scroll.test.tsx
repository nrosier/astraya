// @vitest-environment jsdom
/**
 * #1442: selecting an event brings the other side into view (a bar click scrolls its row, a row click scrolls its bar),
 * and the Techniques popover filters the chart and the table exactly as the legend it replaced did (#1237, 5478931e):
 * every track listed and checked, unchecking one hides that track's rows and its Gantt row, checking it again restores both.
 * The real Swiss Ephemeris engine runs for the popover test (test/engine-harness.ts); the store and provider context are stand-ins.
 */
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TIMING_TIMELINE_TRACKS } from '../src/domain/timing-timeline.js';
import { setLocale } from '../src/ui/locale.js';
import { useLinkedScroll, type SelectionSource } from '../src/ui/use-linked-scroll.js';
import { getEngine } from './engine-harness.js';

const engine = vi.hoisted(() => ({ provider: undefined as unknown }));

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine.provider, error: undefined }),
}));

const stored = vi.hoisted(() => ({
  person: {
    id: 'p1',
    displayName: 'Test',
    timeAccuracy: 'exact',
    moment: {
      civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
      coordinates: { latitude: 38.7478, longitude: -85.0672 },
      offsetOverrideMinutes: -300,
    },
  },
}));

// The person object is created once: a new one per render would restart the calculation on every render.
vi.mock('../src/ui/store-context.js', () => ({
  useStoreState: () => ({
    deleted: { people: new Map() },
    people: new Map([['p1', stored.person]]),
  }),
  useStore: () => ({}),
  useOptionalStore: () => undefined,
}));

beforeAll(async () => {
  engine.provider = await getEngine();
}, 60_000);

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function Harness({ pick }: { pick: SelectionSource }): React.JSX.Element {
  const chartRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);
  const source = useRef<SelectionSource>('chart');
  const [selected, setSelected] = useState<string>();
  useLinkedScroll(selected, source, chartRef, tableRef);
  return (
    <>
      <section ref={chartRef}>
        <svg>
          <g data-mark-key="k1" data-testid="bar-k1" />
          <g data-mark-key="k2" data-testid="bar-k2" />
        </svg>
      </section>
      <section ref={tableRef}>
        <table>
          <tbody>
            <tr data-row-key="k1" data-testid="row-k1" />
            <tr data-row-key="k2" data-testid="row-k2" />
          </tbody>
        </table>
      </section>
      <button
        type="button"
        onClick={() => {
          source.current = pick;
          setSelected('k2');
        }}
      >
        select
      </button>
    </>
  );
}

function scrolled(): Map<string, unknown> {
  const calls = new Map<string, unknown>();
  Element.prototype.scrollIntoView = function (this: Element, options?: ScrollIntoViewOptions | boolean): void {
    calls.set(this.getAttribute('data-mark-key') ?? this.getAttribute('data-row-key') ?? '?', options);
  };
  return calls;
}

describe('selection brings the other side into view (#1442)', () => {
  it.each([
    ['chart', 'row-k2'],
    ['table', 'bar-k2'],
  ] as const)('a %s selection scrolls the other side (%s) with block nearest', (pick, target) => {
    const calls = scrolled();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Harness pick={pick} />);
    });
    expect(calls.size).toBe(0);
    act(() => {
      container.querySelector('button')?.click();
    });
    // Only the target on the other side scrolls, never the element that was clicked.
    const scrolledEl = container.querySelector(`[data-testid="${target}"]`);
    expect(scrolledEl).not.toBeNull();
    expect([...calls.keys()]).toEqual(['k2']);
    expect(calls.get('k2')).toMatchObject({ block: 'nearest' });
    act(() => {
      root.unmount();
    });
  });
});

describe('the Techniques popover keeps the legend filter (#1442)', () => {
  it('lists every track checked, hides a track from the chart and the table when unchecked, and restores it', async () => {
    setLocale('en');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const { TimingTimelineView } = await import('../src/ui/TimingTimelineView.js');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<TimingTimelineView personId="p1" />);
      await Promise.resolve();
    });
    await vi.waitFor(
      () => {
        expect(container.querySelector('[aria-busy="false"]')).not.toBeNull();
        expect(container.querySelector('tr[data-row-key]')).not.toBeNull();
      },
      { timeout: 100_000, interval: 200 },
    );
    const trackRows = (label: string): number =>
      [...container.querySelectorAll('tr[data-row-key]')].filter(
        (row) => row.querySelector('td')?.textContent === label,
      ).length;
    const ganttRows = (): number => container.querySelectorAll('.gantt-row').length;
    const before = ganttRows();
    expect(trackRows('Firdaria')).toBeGreaterThan(0);

    const button = [...container.querySelectorAll('button')].find((b) => /^Techniques \(\d+\)$/.test(b.textContent));
    expect(button).toBeDefined();
    act(() => {
      button?.click();
    });
    const group = container.querySelector('[role="group"][aria-label="Techniques shown"]');
    expect(group).not.toBeNull();
    const boxes = [...(group?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
    // The legend listed every track, all checked.
    expect(boxes).toHaveLength(TIMING_TIMELINE_TRACKS.length);
    expect(boxes.every((box) => box.checked)).toBe(true);

    const firdaria = boxes.find(
      (box) => (box.closest('label') ?? box.parentElement)?.textContent?.trim() === 'Firdaria',
    );
    expect(firdaria).toBeDefined();
    act(() => {
      firdaria?.click();
    });
    expect(trackRows('Firdaria')).toBe(0);
    expect(ganttRows()).toBe(before - 1);
    expect(container.querySelector('[role="img"][aria-label^="Firdaria"]')).toBeNull();
    expect(button?.textContent).toBe(`Techniques (${String(TIMING_TIMELINE_TRACKS.length - 1)})`);

    act(() => {
      firdaria?.click();
    });
    expect(trackRows('Firdaria')).toBeGreaterThan(0);
    expect(ganttRows()).toBe(before);
    act(() => {
      root.unmount();
    });
  }, 240_000);
});
