// @vitest-environment jsdom
/**
 * The "Search charts" card on People (#1405): operator choice, the 10-condition cap, the explicit-run states, the
 * separate not-evaluable group, the zero-results suggestion and the read-only store. Mocks only the store and the
 * ephemeris edges, as test/ui-composite-method.test.tsx does; the draft model and the run hook are real.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import type * as RunModule from '../src/ui/chart-search-run.js';
import type { PersonRunResult } from '../src/ui/chart-search-run.js';

const mocks = vi.hoisted(() => ({
  writable: true,
  runs: [] as { resolve: (value: unknown) => void; reject: (reason: unknown) => void }[],
  next: undefined as undefined | (() => Promise<unknown>),
}));

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: {}, error: undefined }),
}));

vi.mock('../src/ui/chart-search-run.js', async (importOriginal) => {
  const original = await importOriginal<typeof RunModule>();
  return { ...original, runChartSearch: () => (mocks.next ?? (() => Promise.resolve([])))() };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map(), chartSearches: new Map() },
    people: new Map(),
    chartSearches: new Map(),
  };
  return {
    useStoreState: () => state,
    useStore: () => ({
      get writable() {
        return mocks.writable;
      },
      mutate: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      restore: () => Promise.resolve(),
    }),
    useOptionalStore: () => undefined,
  };
});

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  const { ChartSearchPanel } = await import('../src/ui/ChartSearchPanel.js');
  await act(async () => {
    root.render(<ChartSearchPanel />);
    await Promise.resolve();
  });
}

const button = (name: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === name || b.getAttribute('aria-label') === name,
  );

async function click(el: HTMLElement | undefined): Promise<void> {
  expect(el).toBeDefined();
  await act(async () => {
    el?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  setLocale('en');
  mocks.writable = true;
  mocks.next = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('Search charts card (#1405)', () => {
  it('offers Match all and Match any in a radiogroup', async () => {
    await mount();
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.textContent).toContain('Match all');
    expect(group?.textContent).toContain('Match any');
  });

  it('disables Add at 10 conditions and says why', async () => {
    await mount();
    expect(container.textContent).toContain('1 of 10 conditions');
    for (let i = 0; i < 9; i += 1) await click(button('Add condition'));
    expect(button('Add condition')?.disabled).toBe(true);
    expect(container.textContent).toContain('Maximum of 10 conditions reached');
  });

  it('shows Searching… and disables Run while a run is going', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.next = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await mount();
    await click(button('Run search'));
    expect(button('Searching…')?.disabled).toBe(true);
    await act(async () => {
      finish([]);
      await Promise.resolve();
    });
    expect(button('Run search')?.disabled).toBe(false);
  });

  it('lists a not-evaluable person under its own heading with the reason', async () => {
    const results: PersonRunResult[] = [
      { kind: 'not-evaluable', personId: 'p-ada', displayName: 'Ada', reason: 'birth-data-incomplete' },
    ];
    mocks.next = () => Promise.resolve(results);
    await mount();
    await click(button('Run search'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Could not be evaluated');
    expect(container.textContent).toContain('Ada');
    expect(container.textContent).toContain('birth date, time or place is incomplete');
  });

  it('suggests changing a condition when nobody matches', async () => {
    mocks.next = () => Promise.resolve([]);
    await mount();
    await click(button('Run search'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('No one matches these conditions. Try removing a condition');
  });

  it('keeps the inputs and offers Retry when the run fails', async () => {
    mocks.next = () => Promise.reject(new Error('boom'));
    await mount();
    await click(button('Run search'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('The search did not finish. Your conditions are kept.');
    expect(button('Retry')).toBeDefined();
    expect(container.querySelectorAll('li.cond')).toHaveLength(1);
  });

  it('disables the save control and states the reason when the store is read-only', async () => {
    mocks.writable = false;
    await mount();
    expect(button('Save search')?.disabled).toBe(true);
    expect(container.textContent).toContain('cannot be changed or saved on this device');
  });
});
