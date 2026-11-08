// @vitest-environment jsdom
/**
 * #1333 — a wheel selection survives a re-render of the screen while an overlay ring is on. Draconic, Harmonic,
 * Return and Relocated used to pass a new overlay context object on every render, which reran the overlay effect in
 * ChartView, reloaded the rings and cleared the selection (the natal chart already memoised its context). Each test
 * turns the natal ring on, selects a body on the wheel, re-renders the parent and expects the selection to stay.
 * The ephemeris is the real engine; only the person store is stubbed, as in `ui-derived-chart-no-report.test.tsx`.
 */
import { act, useState } from 'react';
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
  const state = { people: new Map([[person.id, person]]) };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { DraconicView } = await import('../src/ui/DraconicView.js');
const { HarmonicView } = await import('../src/ui/HarmonicView.js');
const { ReturnView } = await import('../src/ui/ReturnView.js');
const { RelocatedChartView } = await import('../src/ui/RelocatedChartView.js');

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

/** Renders the view under a parent whose own state change re-renders the view without changing any of its props. */
function Parent({ node }: { node: () => React.JSX.Element }): React.JSX.Element {
  const [ticks, setTicks] = useState(0);
  return (
    <>
      <button
        type="button"
        id="rerender"
        onClick={() => {
          setTicks(ticks + 1);
        }}
      >
        {ticks}
      </button>
      {node()}
    </>
  );
}

function mount(node: () => React.JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(<Parent node={node} />);
  });
  return container;
}

async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, ms));
  });
}

/** Waits until `ready()` holds, or gives up after about 30 seconds. */
async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 600 && !ready(); i++) await settle();
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`test fixture bug: missing ${what}`);
  return value;
}

function typeInto(element: HTMLInputElement | undefined, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(must(element, 'input'), value);
  must(element, 'input').dispatchEvent(new Event('input', { bubbles: true }));
}

const wheelBodies = (container: HTMLElement): readonly Element[] =>
  Array.from(container.querySelectorAll('.chart-wheel [data-body]'));
const dimmed = (container: HTMLElement): number => container.querySelectorAll('.chart-wheel .chart-dimmed').length;
/** The wheel is drawn with the natal ring added: more than one ring of bodies. */
const ringCount = (container: HTMLElement): number =>
  new Set(wheelBodies(container).map((body) => body.getAttribute('data-ring') ?? '0')).size;

async function turnNatalOverlayOn(container: HTMLElement): Promise<void> {
  const trigger = must(container.querySelector<HTMLButtonElement>('.chart-overlay-trigger'), 'Overlay trigger');
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
  const natal = must(
    Array.from(container.querySelectorAll('.chart-overlay-draft label')).find((label) =>
      (label.textContent ?? '').includes('Natal chart'),
    ),
    'Natal chart row',
  );
  await act(async () => {
    must(natal.querySelector('input'), 'Natal checkbox').click();
    await Promise.resolve();
  });
  const apply = must(
    Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Apply overlays'),
    'Apply overlays',
  );
  await act(async () => {
    apply.click();
    await Promise.resolve();
  });
  await until(() => ringCount(container) > 1);
  expect(ringCount(container)).toBeGreaterThan(1);
}

async function expectSelectionSurvivesRerender(container: HTMLElement): Promise<void> {
  await until(() => wheelBodies(container).length > 0 && container.querySelector('.chart-overlay-trigger') !== null);
  await turnNatalOverlayOn(container);
  const body = must(wheelBodies(container)[0], 'wheel body');
  await act(async () => {
    body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(dimmed(container)).toBeGreaterThan(0);
  await act(async () => {
    must(container.querySelector<HTMLButtonElement>('#rerender'), 'rerender button').click();
    await Promise.resolve();
  });
  // Give a wrongly rerun overlay effect time to reload the rings and clear the selection.
  await settle(500);
  await until(() => ringCount(container) > 1);
  expect(ringCount(container)).toBeGreaterThan(1);
  expect(dimmed(container)).toBeGreaterThan(0);
}

describe('a wheel selection survives a re-render with overlays on (#1333)', () => {
  it('DraconicView keeps a wheel selection across a re-render with overlays on (#1333)', async () => {
    await expectSelectionSurvivesRerender(mount(() => <DraconicView personId="p1" />));
  }, 90_000);

  it('HarmonicView keeps a wheel selection across a re-render with overlays on (#1333)', async () => {
    await expectSelectionSurvivesRerender(mount(() => <HarmonicView personId="p1" />));
  }, 90_000);

  it('ReturnView keeps a wheel selection across a re-render with overlays on (#1333)', async () => {
    await expectSelectionSurvivesRerender(mount(() => <ReturnView personId="p1" kind="solar-return" />));
  }, 90_000);

  it('RelocatedChartView keeps a wheel selection across a re-render with overlays on (#1333)', async () => {
    const container = mount(() => <RelocatedChartView personId="p1" />);
    const [latitude, longitude] = Array.from(
      container.querySelectorAll<HTMLInputElement>('.field-grid input[type="number"]'),
    );
    act(() => {
      typeInto(latitude, '51.5072');
      typeInto(longitude, '-0.1276');
    });
    await expectSelectionSurvivesRerender(container);
  }, 90_000);
});
