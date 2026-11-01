// @vitest-environment jsdom
/**
 * #980 — Draconic, Harmonic, Solar Return and Lunar Return no longer render the general whole-chart written
 * reading (`ReportView`, whose root is `div.report`). Composite and Relocated keep it, per the owner decision on
 * the issue, and the standalone interpretation screen (`ReportScreen`) still renders it. Those three are the
 * positive controls: they prove the `.report` selector detects `ReportView`, so its absence on the four derived
 * charts means something. Every view runs against the real ephemeris engine and is checked only once its chart
 * has settled ready, which is when `ReportView` used to mount.
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
  // A second person with a known birth time, so Composite's partner picker offers one.
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

const { DraconicView } = await import('../src/ui/DraconicView.js');
const { HarmonicView } = await import('../src/ui/HarmonicView.js');
const { ReturnView } = await import('../src/ui/ReturnView.js');
const { CompositeView } = await import('../src/ui/CompositeView.js');
const { RelocatedChartView } = await import('../src/ui/RelocatedChartView.js');
const { ReportScreen } = await import('../src/ui/ReportScreen.js');

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

const busyRegions = (container: HTMLElement): readonly string[] =>
  Array.from(container.querySelectorAll('div[aria-busy]')).map((el) => el.getAttribute('aria-busy') ?? '');

/** Waits until at least one result region exists and none is busy, or gives up after about 30 seconds. */
async function untilSettled(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600; i++) {
    const regions = busyRegions(container);
    if (regions.length > 0 && !regions.includes('true')) break;
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
  }
}

/** The chart settled ready: a result region with content and no error, which is when `ReportView` mounted. */
function expectChartReady(container: HTMLElement): void {
  const regions = Array.from(container.querySelectorAll('div[aria-busy]'));
  expect(regions.length).toBeGreaterThan(0);
  for (const region of regions) {
    expect(region.getAttribute('aria-busy')).toBe('false');
    expect(region.querySelector('[data-kind="error"]')).toBeNull();
    expect(region.childElementCount).toBeGreaterThan(0);
  }
}

function chooseOption(container: HTMLElement, needs: readonly string[], value: string): void {
  const select = Array.from(container.querySelectorAll('select')).find((el) =>
    needs.every((need) => el.querySelector(`option[value="${need}"]`) !== null),
  );
  if (select === undefined) throw new Error(`no select offers ${needs.join(', ')}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function typeInto(element: HTMLInputElement | undefined, value: string): void {
  if (element === undefined) throw new Error('test fixture bug: missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('derived charts without the general written reading (#980)', () => {
  const withoutReport: readonly { name: string; node: () => React.JSX.Element }[] = [
    { name: 'Draconic', node: () => <DraconicView personId="p1" /> },
    { name: 'Harmonic', node: () => <HarmonicView personId="p1" /> },
    { name: 'Solar return', node: () => <ReturnView personId="p1" kind="solar-return" /> },
    { name: 'Lunar return', node: () => <ReturnView personId="p1" kind="lunar-return" /> },
  ];

  for (const { name, node } of withoutReport) {
    it(`${name} renders its chart but no ReportView`, async () => {
      const container = mount(node());
      await untilSettled(container);
      expectChartReady(container);
      expect(container.querySelector('.report')).toBeNull();
    }, 60_000);
  }

  it('Composite still renders ReportView', async () => {
    const container = mount(<CompositeView personId="p1" />);
    act(() => {
      chooseOption(container, ['p2'], 'p2');
    });
    await untilSettled(container);
    expectChartReady(container);
    expect(container.querySelector('.report')).not.toBeNull();
  }, 60_000);

  it('Relocated still renders ReportView', async () => {
    const container = mount(<RelocatedChartView personId="p1" />);
    const [latitude, longitude] = Array.from(
      container.querySelectorAll<HTMLInputElement>('.field-grid input[type="number"]'),
    );
    act(() => {
      typeInto(latitude, '51.5072');
      typeInto(longitude, '-0.1276');
    });
    await untilSettled(container);
    expectChartReady(container);
    expect(container.querySelector('.report')).not.toBeNull();
  }, 60_000);

  it('the standalone interpretation screen still renders ReportView', async () => {
    const container = mount(<ReportScreen personId="p1" />);
    await untilSettled(container);
    expectChartReady(container);
    expect(container.querySelector('.report')).not.toBeNull();
  }, 60_000);
});
