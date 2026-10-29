// @vitest-environment jsdom
/**
 * #888 — each calculation result region carries `aria-busy` while it recalculates and drops it once the result
 * is ready. These run against the real ephemeris engine (no mocked calculations): a view is busy from its first
 * render, the calculation runs, and the test waits until every result region reports `aria-busy="false"`. A
 * view that stays busy, or that settles in an error, fails here. Views whose calculation needs a second person
 * (Composite, Synastry's partner) are covered by their own harness, not here.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  const person = {
    id: 'p1',
    displayName: 'Test',
    timeAccuracy: 'exact',
    moment: {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      offsetOverrideMinutes: 0,
    },
    placeLabel: 'Fort Wayne, IN',
    notes: '',
    missing: [],
    customPoints: [],
  };
  const state = { people: new Map([[person.id, person]]) };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { ProfectionsView } = await import('../src/ui/ProfectionsView.js');
const { SolarArcView } = await import('../src/ui/SolarArcView.js');
const { ProgressionsView } = await import('../src/ui/ProgressionsView.js');
const { PeriodicTransitView } = await import('../src/ui/PeriodicTransitView.js');
const { ConsultationView } = await import('../src/ui/ConsultationView.js');
const { ReportScreen } = await import('../src/ui/ReportScreen.js');
const { TimingTimelineView } = await import('../src/ui/TimingTimelineView.js');
const { PrimaryDirectionsView } = await import('../src/ui/PrimaryDirectionsView.js');
const { CyclesView } = await import('../src/ui/CyclesView.js');
const { EclipsesView } = await import('../src/ui/EclipsesView.js');
const { EventSearchView } = await import('../src/ui/EventSearchView.js');

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

/** Mounts synchronously, so the first (loading) render is what the test sees before any calculation settles. */
function mount(node: React.JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(node);
  });
  return container;
}

/** The `aria-busy` value of every result region the view renders, in document order. */
const busyRegions = (container: HTMLElement): readonly string[] =>
  Array.from(container.querySelectorAll('div[aria-busy]')).map((el) => el.getAttribute('aria-busy') ?? '');

/** Waits until no result region is busy, or gives up after about 30 seconds. */
async function untilSettled(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600 && busyRegions(container).includes('true'); i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
  }
}

const views: readonly { name: string; node: () => React.JSX.Element }[] = [
  { name: 'ProfectionsView', node: () => <ProfectionsView personId="p1" /> },
  { name: 'SolarArcView', node: () => <SolarArcView personId="p1" /> },
  { name: 'ProgressionsView', node: () => <ProgressionsView personId="p1" /> },
  { name: 'PeriodicTransitView', node: () => <PeriodicTransitView personId="p1" /> },
  { name: 'ConsultationView', node: () => <ConsultationView personId="p1" /> },
  { name: 'ReportScreen', node: () => <ReportScreen personId="p1" /> },
  { name: 'TimingTimelineView', node: () => <TimingTimelineView personId="p1" /> },
  { name: 'PrimaryDirectionsView', node: () => <PrimaryDirectionsView personId="p1" /> },
  { name: 'CyclesView', node: () => <CyclesView /> },
  { name: 'EclipsesView', node: () => <EclipsesView /> },
];

describe('the calculation result regions (#888)', () => {
  for (const { name, node } of views) {
    it(`${name} is aria-busy while calculating and cleared once the result is ready`, async () => {
      const container = mount(node());
      expect(busyRegions(container)).toContain('true');

      await untilSettled(container);
      expect(busyRegions(container).length).toBeGreaterThan(0);
      expect(busyRegions(container)).not.toContain('true');
    }, 60_000);
  }

  it('EventSearchView is not busy before a search is started', () => {
    const container = mount(<EventSearchView />);
    expect(busyRegions(container)).toEqual(['false']);
  });
});
