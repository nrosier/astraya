// @vitest-environment jsdom
/**
 * #1356/#1400/#1404 — the owner's column rule on the result tables of the calculation views: a date column and a
 * text column are left-aligned (`data-align="start"`) even when the date is stored as a Julian-day number, and
 * the header carries the same alignment as its cells. Real ephemeris engine, no mocked calculations.
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
  const state = { people: new Map([[person.id, person]]), birthNotes: new Map(), consultationNotes: new Map() };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { conditionColumns } = await import('../src/ui/ChartViewPatterns.js');
const { chartViewMessages } = await import('../src/ui/ChartView.messages.js');
const { CyclesView } = await import('../src/ui/CyclesView.js');
const { cyclesViewMessages } = await import('../src/ui/CyclesView.messages.js');
const { EclipsesView } = await import('../src/ui/EclipsesView.js');
const { eclipsesViewMessages } = await import('../src/ui/EclipsesView.messages.js');
const { ElectionalView } = await import('../src/ui/ElectionalView.js');
const { electionalViewMessages } = await import('../src/ui/ElectionalView.messages.js');
const { EventSearchView } = await import('../src/ui/EventSearchView.js');
const { eventSearchViewMessages } = await import('../src/ui/EventSearchView.messages.js');
const { TimingTimelineView } = await import('../src/ui/TimingTimelineView.js');
const { timingTimelineViewMessages } = await import('../src/ui/TimingTimelineView.messages.js');

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

/** Mounts `node` and waits until no result region is busy. */
async function mountSettled(node: React.JSX.Element): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(node);
  });
  for (let i = 0; i < 600 && container.querySelector('div[aria-busy="true"]') !== null; i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
  }
  return container;
}

/** Sets an input's value the way typing does, so React's change handler sees it. */
function typeInto(element: HTMLInputElement | undefined, value: string): void {
  if (element === undefined) throw new Error('test fixture bug: missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Waits until no result region is busy. */
async function settle(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600 && container.querySelector('div[aria-busy="true"]') !== null; i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
  }
}

/** The button whose visible label is `label`. */
function buttonNamed(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent.trim() === label);
  if (button === undefined) throw new Error(`no button labelled ${label}`);
  return button;
}

/** The `data-align` of the header whose text starts with `label`, and of every body cell in its column. */
function alignOf(
  container: HTMLElement,
  label: string,
): { header: string | null | undefined; cells: Set<string | null> } {
  const headers = [...container.querySelectorAll('thead th')];
  const index = headers.findIndex((th) => th.textContent.trim().startsWith(label));
  expect(index).toBeGreaterThanOrEqual(0);
  const cells = new Set<string | null>();
  for (const row of container.querySelectorAll('tbody tr')) {
    cells.add(row.children[index]?.getAttribute('data-align') ?? null);
  }
  return { header: headers[index]?.getAttribute('data-align'), cells };
}

describe('date columns stored as Julian-day numbers are left-aligned (#1356/#1400/#1404)', () => {
  it('Cycles: the date column', async () => {
    const container = await mountSettled(<CyclesView />);
    const { header, cells } = alignOf(container, cyclesViewMessages.en.dateColumn);
    expect(header).toBe('start');
    expect(cells.size).toBeGreaterThan(0);
    expect([...cells]).toEqual(['start']);
  }, 60_000);

  it('Eclipses: the date column', async () => {
    const container = await mountSettled(<EclipsesView />);
    const { header, cells } = alignOf(container, eclipsesViewMessages.en.dateColumn);
    expect(header).toBe('start');
    expect(cells.size).toBeGreaterThan(0);
    expect([...cells]).toEqual(['start']);
  }, 60_000);

  it('Timing timeline: the start column matches the end column', async () => {
    const container = await mountSettled(<TimingTimelineView personId="p1" />);
    const start = alignOf(container, timingTimelineViewMessages.en.columnStart);
    const end = alignOf(container, timingTimelineViewMessages.en.columnEnd);
    expect(start.header).toBe('start');
    expect(end.header).toBe('start');
    expect([...start.cells]).toEqual(['start']);
    expect([...end.cells]).toEqual(['start']);
  }, 60_000);
});

describe('the search tables (#1356/#1400/#1404)', () => {
  it('Ephemeris search: the date column', async () => {
    const container = await mountSettled(<EventSearchView />);
    const [from, to] = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    act(() => {
      typeInto(from, '1970-01-01');
      typeInto(to, '1970-01-31');
    });
    act(() => {
      buttonNamed(container, eventSearchViewMessages.en.searchButton).click();
    });
    await settle(container);
    const { header, cells } = alignOf(container, eventSearchViewMessages.en.date);
    expect(header).toBe('start');
    expect(cells.size).toBeGreaterThan(0);
    expect([...cells]).toEqual(['start']);
  }, 60_000);

  it('Electional: the date columns and the rule-name lists', async () => {
    const container = await mountSettled(<ElectionalView />);
    act(() => {
      const [fromDate, toDate] = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
      typeInto(toDate, fromDate?.value ?? '');
      const [latitude, longitude] = [...container.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')];
      typeInto(latitude, '41.1833');
      typeInto(longitude, '-84.7333');
    });
    act(() => {
      buttonNamed(container, electionalViewMessages.en.findButton).click();
    });
    await settle(container);
    for (const label of [
      electionalViewMessages.en.startColumn,
      electionalViewMessages.en.endColumn,
      electionalViewMessages.en.satisfiedColumn,
      electionalViewMessages.en.violatedColumn,
    ]) {
      const { header, cells } = alignOf(container, label);
      expect(header).toBe('start');
      expect(cells.size).toBeGreaterThan(0);
      expect([...cells]).toEqual(['start']);
    }
  }, 60_000);
});

describe('number columns are right-aligned (#1356/#1400/#1404)', () => {
  it('Patterns: the motion score column', () => {
    const column = conditionColumns(chartViewMessages.en, 'en', true).find((c) => c.key === 'motionScore');
    expect(column?.align).toBe('end');
  });
});
