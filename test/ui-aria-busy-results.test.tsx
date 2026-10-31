// @vitest-environment jsdom
/**
 * #888 — each calculation result region carries `aria-busy` while it recalculates and drops it once the result
 * is ready. These run against the real ephemeris engine (no mocked calculations): a view is busy from its first
 * render, the calculation runs, and the test waits until every result region reports `aria-busy="false"`. A
 * settled region must also hold content and show no error, so a view that stays busy, settles in an error, or
 * settles empty fails here. Synastry is driven by choosing its partner; the planetary-return region of
 * PeriodicTransitView is driven by choosing its body. Harmonic, Draconic, RelocatedChart and Composite render their
 * result through ChartDataView, so they are covered here too. Horary, Electional and Rectification are driven
 * through their own forms, as a user would fill them.
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
  // A second person with a known birth time, so Synastry's partner picker offers one.
  const partner = { ...person, id: 'p2', displayName: 'Partner', placeLabel: 'Chicago, IL' };
  const state = {
    people: new Map([
      [person.id, person],
      [partner.id, partner],
    ]),
  };
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
const { eventSearchViewMessages } = await import('../src/ui/EventSearchView.messages.js');
const { AstrocartographyView } = await import('../src/ui/AstrocartographyView.js');
const { SynastryView } = await import('../src/ui/SynastryView.js');
const { ReturnView } = await import('../src/ui/ReturnView.js');
const { HarmonicView } = await import('../src/ui/HarmonicView.js');
const { DraconicView } = await import('../src/ui/DraconicView.js');
const { RelocatedChartView } = await import('../src/ui/RelocatedChartView.js');
const { CompositeView } = await import('../src/ui/CompositeView.js');
const { HoraryView } = await import('../src/ui/HoraryView.js');
const { horaryViewMessages } = await import('../src/ui/HoraryView.messages.js');
const { ElectionalView } = await import('../src/ui/ElectionalView.js');
const { electionalViewMessages } = await import('../src/ui/ElectionalView.messages.js');
const { RectificationView } = await import('../src/ui/RectificationView.js');
const { rectificationViewMessages } = await import('../src/ui/RectificationView.messages.js');

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

/**
 * Asserts every result region has settled into a ready state: not busy, no error inside, and content present.
 * An error settles with `aria-busy="false"` too, so the error check is what makes "ready" mean ready.
 */
function expectSettledReady(container: HTMLElement): void {
  const regions = Array.from(container.querySelectorAll('div[aria-busy]'));
  expect(regions.length).toBeGreaterThan(0);
  for (const region of regions) {
    expect(region.getAttribute('aria-busy')).toBe('false');
    expect(region.querySelector('[data-kind="error"]')).toBeNull();
    expect(region.childElementCount).toBeGreaterThan(0);
  }
}

/**
 * Chooses `value` in the select that offers every value in `needs`, the way a user would, and fires the change
 * event React listens for. Call inside `act` so the resulting recalculation starts before the test looks.
 */
function chooseOption(container: HTMLElement, needs: readonly string[], value: string): void {
  const select = Array.from(container.querySelectorAll('select')).find((el) =>
    needs.every((need) => el.querySelector(`option[value="${need}"]`) !== null),
  );
  if (select === undefined) throw new Error(`no select offers ${needs.join(', ')}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Sets an input's value the way typing does, so React's change handler sees it. */
function typeInto(element: HTMLInputElement | undefined, value: string): void {
  if (element === undefined) throw new Error('test fixture bug: missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Every input matching `selector`, in document order. */
const inputsOf = (container: HTMLElement, selector: string): HTMLInputElement[] =>
  Array.from(container.querySelectorAll<HTMLInputElement>(selector));

/** The button whose visible label is `label`, found the way a user finds it. */
function buttonNamed(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((el) => el.textContent.trim() === label);
  if (button === undefined) throw new Error(`no button labelled ${label}`);
  return button;
}

const views: readonly { name: string; node: () => React.JSX.Element }[] = [
  { name: 'HarmonicView', node: () => <HarmonicView personId="p1" /> },
  { name: 'DraconicView', node: () => <DraconicView personId="p1" /> },
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
  { name: 'ReturnView (solar return)', node: () => <ReturnView personId="p1" kind="solar-return" /> },
];

describe('the calculation result regions (#888)', () => {
  for (const { name, node } of views) {
    it(`${name} is aria-busy while calculating and cleared once the result is ready`, async () => {
      const container = mount(node());
      expect(busyRegions(container)).toContain('true');

      await untilSettled(container);
      expectSettledReady(container);
    }, 60_000);
  }

  it('SynastryView is aria-busy while the synastry calculates and cleared once ready', async () => {
    const container = mount(<SynastryView personId="p1" />);
    // No partner yet, so nothing is calculating.
    expect(busyRegions(container)).toEqual(['false']);

    act(() => {
      chooseOption(container, ['p2'], 'p2');
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
    expect(container.querySelector('.chart-wheel')).not.toBeNull();
  }, 60_000);

  it('PeriodicTransitView planetary-return region is aria-busy while the return recalculates and cleared once ready', async () => {
    const container = mount(<PeriodicTransitView personId="p1" />);
    // The planetary-return region renders only once the forecast is ready, so settle the forecast first.
    await untilSettled(container);
    expectSettledReady(container);
    expect(busyRegions(container)).toHaveLength(2);

    act(() => {
      chooseOption(container, ['jupiter', 'mars'], 'mars');
    });
    // Only the return region recalculates; the forecast region above it stays ready.
    expect(busyRegions(container)).toEqual(['false', 'true']);

    await untilSettled(container);
    expectSettledReady(container);
    expect(busyRegions(container)).toHaveLength(2);
  }, 60_000);

  it('EventSearchView is not busy before a search is started', () => {
    const container = mount(<EventSearchView />);
    expect(busyRegions(container)).toEqual(['false']);
  });

  it('EventSearchView result region is aria-busy while the search runs and cleared once ready', async () => {
    const container = mount(<EventSearchView />);
    expect(busyRegions(container)).toEqual(['false']);

    // A one-day window keeps the search short; the range fields are the first two text inputs.
    const [from, to] = inputsOf(container, 'input[type="text"]');
    act(() => {
      typeInto(from, '1970-01-01');
      typeInto(to, '1970-01-02');
    });
    act(() => {
      buttonNamed(container, eventSearchViewMessages.en.searchButton).click();
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);

  it('AstrocartographyView map region is aria-busy only while recalculating and cleared once the map is ready', async () => {
    const container = mount(<AstrocartographyView personId="p1" />);
    // The map region renders only once the first calculation has a map to show; the loading state before it is a
    // StatusMessage. So wait for the map itself, then assert the region has settled.
    for (let i = 0; i < 600 && container.querySelector('.acg-map') === null; i++) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, 50));
      });
    }
    expect(container.querySelector('.acg-map')).not.toBeNull();
    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);

  it('RelocatedChartView result region is aria-busy while the relocated chart calculates and cleared once ready', async () => {
    const container = mount(<RelocatedChartView personId="p1" />);
    // No place yet, so no result region is rendered.
    expect(busyRegions(container)).toEqual([]);

    const [latitude, longitude] = inputsOf(container, '.field-grid input[type="number"]');
    act(() => {
      typeInto(latitude, '51.5072');
      typeInto(longitude, '-0.1276');
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);

  it('CompositeView result region is aria-busy while the composite calculates and cleared once ready', async () => {
    const container = mount(<CompositeView personId="p1" />);
    // No partner yet, so no result region is rendered.
    expect(busyRegions(container)).toEqual([]);

    act(() => {
      chooseOption(container, ['p2'], 'p2');
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);

  it('HoraryView result region is aria-busy only while the chart is cast and cleared once ready', async () => {
    const container = mount(<HoraryView />);
    expect(busyRegions(container)).toEqual(['false']);

    act(() => {
      const [latitude, longitude] = inputsOf(container, '.horary-coords input');
      typeInto(latitude, '41.1833');
      typeInto(longitude, '-84.7333');
    });
    act(() => {
      buttonNamed(container, horaryViewMessages.en.castButton).click();
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);

  it('ElectionalView result region is aria-busy only while the search runs and cleared once ready', async () => {
    const container = mount(<ElectionalView />);
    expect(busyRegions(container)).toEqual(['false']);

    act(() => {
      const [fromDate, toDate] = inputsOf(container, 'input[type="date"]');
      // A one-day window keeps the search short: the end date matches the start date's default.
      typeInto(toDate, fromDate?.value ?? '');
      const [latitude, longitude] = inputsOf(container, 'input[inputmode="decimal"]');
      typeInto(latitude, '41.1833');
      typeInto(longitude, '-84.7333');
    });
    act(() => {
      buttonNamed(container, electionalViewMessages.en.findButton).click();
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);

  it('RectificationView result region is aria-busy only while the candidates are tested and cleared once ready', async () => {
    const container = mount(<RectificationView />);
    expect(busyRegions(container)).toEqual(['false']);

    act(() => {
      chooseOption(container, ['p1'], 'p1');
    });
    act(() => {
      const [fromTime, toTime] = inputsOf(container, 'input[type="time"]');
      typeInto(fromTime, '06:00');
      typeInto(toTime, '10:00');
      // The first date field is the birth date the person filled in; the next is the event.
      const [, event] = inputsOf(container, 'input[type="date"]');
      typeInto(event, '1990-06-01');
    });
    act(() => {
      buttonNamed(container, rectificationViewMessages.en.findButton).click();
    });
    expect(busyRegions(container)).toEqual(['true']);

    await untilSettled(container);
    expectSettledReady(container);
  }, 60_000);
});
