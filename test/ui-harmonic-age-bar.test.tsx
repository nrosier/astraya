// @vitest-environment jsdom
/**
 * #1407 — the Harmonic "Age at a date" modes put the date field and its computed readout in the one control bar
 * under the chart wheel, beside the Divisional chart select. The Selection card stays a chart-element inspector and
 * holds no date input. jsdom has no layout, so "beneath" is document order after the wheel's workbench; the measured
 * rectangles are in the PR. Runs against the real ephemeris engine.
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
      civil: { year: 1879, month: 3, day: 14, hour: 11, minute: 30, second: 0 },
      coordinates: { latitude: 48.4, longitude: 9.99 },
      offsetOverrideMinutes: 0,
    },
    placeLabel: 'Ulm',
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

const { HarmonicView } = await import('../src/ui/HarmonicView.js');

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

async function settle(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600; i++) {
    const regions = Array.from(container.querySelectorAll('div[aria-busy]')).map((el) => el.getAttribute('aria-busy'));
    if (regions.length > 0 && !regions.includes('true')) break;
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
  }
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string, event: string): void {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event(event, { bubbles: true }));
}

async function mountAge(value: string): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(<HarmonicView personId="p1" />);
  });
  await settle(container);
  const select = container.querySelector<HTMLSelectElement>('select option[value="age"]')?.closest('select');
  if (select === null || select === undefined) throw new Error('no Divisional chart select with an age option');
  act(() => {
    setValue(select, value, 'change');
  });
  await settle(container);
  return container;
}

describe('harmonic date control bar (#1407)', () => {
  for (const mode of ['age', 'age-plus-one']) {
    it(`${mode}: the select, date field and readout share one bar beneath the wheel, outside the Selection card`, async () => {
      const container = await mountAge(mode);
      const date = container.querySelector<HTMLInputElement>('input[type="date"]');
      const readout = container.querySelector('[data-testid="harmonic-age-readout"]');
      const workbench = container.querySelector('.chart-workbench-shell');
      const inspector = container.querySelector('.selection-inspector');
      if (date === null || readout === null || workbench === null || inspector === null) {
        throw new Error('date, readout, workbench or inspector missing');
      }
      const bar = container.querySelector('.harmonic-control-bar');
      expect(bar).not.toBeNull();
      expect(bar?.contains(date)).toBe(true);
      expect(bar?.contains(readout)).toBe(true);
      expect(bar?.querySelector('select')).not.toBeNull();
      // Beneath the wheel: the bar follows the whole workbench in document order and is not inside it.
      expect(workbench.contains(bar)).toBe(false);
      expect(workbench.compareDocumentPosition(bar as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The Selection card inspects chart elements only.
      expect(inspector.querySelector('input[type="date"]')).toBeNull();
      expect(inspector.contains(readout)).toBe(false);
    });
  }

  it('typing a valid date refreshes the readout with the age harmonic for that date', async () => {
    const container = await mountAge('age');
    const date = container.querySelector<HTMLInputElement>('input[type="date"]');
    if (date === null) throw new Error('no date input');
    act(() => {
      setValue(date, '1914-03-14', 'input');
    });
    await settle(container);
    const readout = container.querySelector('[data-testid="harmonic-age-readout"]');
    expect(readout?.textContent).toMatch(/^Age harmonic 35\.\d{2} \(age at 1914-03-14\)$/);
  });
});
