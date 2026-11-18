// @vitest-environment jsdom
/**
 * The Chart query panel on People (#1405, #1731): operator choice, the 10-condition cap, the explicit-run states,
 * Reset, and the read-only store; then the result pieces the People list shows for an applied query (the status line
 * and the not-evaluable group). Mocks only the store and the ephemeris edges, as test/ui-composite-method.test.tsx
 * does; the draft model and the run hook are real.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import type * as RunModule from '../src/ui/chart-search-run.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import type { ChartSearch, SearchCondition } from '../src/domain/chart-search.js';
import type { Person } from '../src/domain/person.js';
import { initialDraft, type ChartSearchDraft } from '../src/ui/chart-search-draft.js';
import { useChartSearchRun } from '../src/ui/use-chart-search-run.js';
import { ChartQueryStatus, ChartSearchPanel as HostPanel, NotEvaluableList } from '../src/ui/ChartSearchPanel.js';

const mocks = vi.hoisted(() => ({
  writable: true,
  runs: [] as { resolve: (value: unknown) => void; reject: (reason: unknown) => void }[],
  next: undefined as undefined | (() => Promise<unknown>),
  resets: 0,
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

/** Owns the draft and the run as People does (#1731), so the panel is rendered with the same props. */
function Host(): React.JSX.Element {
  const [draft, setDraft] = useState<ChartSearchDraft>(initialDraft);
  const run = useChartSearchRun();
  return (
    <HostPanel
      draft={draft}
      onDraftChange={setDraft}
      runState={run.state}
      onRun={run.run}
      onReset={() => {
        mocks.resets += 1;
        setDraft(initialDraft());
      }}
      labelledBy="chart-query-toggle"
    />
  );
}

async function mount(element: React.JSX.Element = <Host />): Promise<void> {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

/**
 * Waits for the run to finish (#1731): the run engine loads through a dynamic import on the first run, so one
 * microtask flush is not enough. Resolves once no Run control is busy, or after a bounded number of macrotasks.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (container.querySelector('button[aria-busy="true"]') === null) return;
  }
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
  mocks.resets = 0;
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

describe('Chart query panel (#1405, #1731)', () => {
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
      await import('../src/ui/chart-search-run.js');
    });
    act(() => {
      finish([]);
    });
    await settle();
    expect(button('Run search')?.disabled).toBe(false);
  });

  it('keeps the inputs and offers Retry when the run fails', async () => {
    mocks.next = () => Promise.reject(new Error('boom'));
    await mount();
    await click(button('Run search'));
    await settle();
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

  it('has no results block and no first-use box of its own, and is named by the toggle (#1731)', async () => {
    await mount();
    expect(container.textContent).not.toContain('No search yet');
    expect(container.textContent).not.toContain('No saved searches yet');
    expect(container.querySelector('.results')).toBeNull();
    expect(container.querySelector('section.chart-search')?.getAttribute('aria-labelledby')).toBe('chart-query-toggle');
  });

  it('offers Reset beside Run search, and Reset puts the starting conditions back (#1731)', async () => {
    await mount();
    await click(button('Add condition'));
    expect(container.querySelectorAll('li.cond')).toHaveLength(2);
    await click(button('Reset'));
    expect(mocks.resets).toBe(1);
    expect(container.querySelectorAll('li.cond')).toHaveLength(1);
  });

  it('never runs while the query is edited (explicit run only)', async () => {
    let runs = 0;
    mocks.next = () => {
      runs += 1;
      return Promise.resolve([]);
    };
    await mount();
    await click(button('Add condition'));
    await settle();
    expect(runs).toBe(0);
  });
});

const sun = bodyByKey('sun')?.id ?? 0;
const mars = bodyByKey('mars')?.id ?? 0;
const sunInLeo: SearchCondition = { kind: 'sign', scope: 'natal', body: sun, sign: 4 };
const marsHouse: SearchCondition = { kind: 'house', scope: 'transit', body: mars, house: 10 };

function status(search: ChartSearch, shown: number, onClear: () => void = () => undefined): React.JSX.Element {
  return <ChartQueryStatus search={search} shown={shown} total={14} onClear={onClear} />;
}

describe('the applied query on the People list (#1731)', () => {
  it('says how many people the query leaves and names its conditions, joined for Match all', async () => {
    await mount(status({ operator: 'and', conditions: [sunInLeo, marsHouse] }, 2));
    expect(container.textContent).toContain(
      'Showing 2 of 14 people matching Natal chart: Sun in Leo · Transits: Mars in house 10.',
    );
  });

  it('joins the conditions with "or" for Match any', async () => {
    await mount(status({ operator: 'or', conditions: [sunInLeo, marsHouse] }, 1));
    expect(container.textContent).toContain('Natal chart: Sun in Leo or Transits: Mars in house 10');
  });

  it('names the conditions in Dutch when the locale is nl', async () => {
    setLocale('nl');
    await mount(status({ operator: 'and', conditions: [{ kind: 'house', scope: 'natal', body: sun, house: 7 }] }, 1));
    expect(container.textContent).toMatch(/1 van 14 personen getoond die voldoen aan .*in huis 7\./);
    expect(button('Wissen')).toBeDefined();
  });

  it('uses the zero-result suggestion when nobody matches', async () => {
    await mount(status({ operator: 'and', conditions: [sunInLeo] }, 0));
    expect(container.textContent).toContain('No one matches these conditions. Try removing a condition');
  });

  it('clears the applied query from the Clear button', async () => {
    let cleared = 0;
    await mount(
      status({ operator: 'and', conditions: [sunInLeo] }, 1, () => {
        cleared += 1;
      }),
    );
    await click(button('Clear'));
    expect(cleared).toBe(1);
  });

  it('lists a not-evaluable person under its own heading with the reason and a link', async () => {
    const ada = { id: 'p-ada', displayName: 'Ada' } as Person;
    await mount(<NotEvaluableList items={[{ person: ada, reasons: ['birth-data-incomplete'] }]} unnamed="Unnamed" />);
    expect(container.textContent).toContain('Could not be evaluated (1)');
    expect(container.textContent).toContain('birth date, time or place is incomplete');
    expect(container.querySelector('a.person')?.getAttribute('href')).toContain('p-ada');
  });

  it('shows no group when everyone could be evaluated', async () => {
    await mount(<NotEvaluableList items={[]} unnamed="Unnamed" />);
    expect(container.textContent).toBe('');
  });
});
