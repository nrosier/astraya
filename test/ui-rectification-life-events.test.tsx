// @vitest-environment jsdom
/**
 * Rectification and the person's life events (#1399, slice S4): choosing a stored person pre-fills the events from
 * their `lifeEvents`, edits are written back only through the person record, an unreadable stored list is never
 * overwritten, and with no person chosen nothing is saved. The store is the real one; no ephemeris is involved
 * because nothing here runs a search.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { personFormMessages } from '../src/ui/PersonForm.messages.js';
import { rectificationViewMessages } from '../src/ui/RectificationView.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { RectificationView } = await import('../src/ui/RectificationView.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

const t = rectificationViewMessages.en;
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

const STORED = [
  { id: 'b', date: '2004-11-06', label: 'Second' },
  { id: 'a', date: '1999-08-11', time: '09:30', label: 'Moved abroad' },
];

async function seed(extra: { field: string; value: unknown }[]): Promise<void> {
  await store.mutate([
    { entity: 'person', entityId: 'ada', field: 'displayName', value: 'Ada Lovelace' },
    { entity: 'person', entityId: 'ada', field: 'timeAccuracy', value: 'recorded' },
    {
      entity: 'person',
      entityId: 'ada',
      field: 'civil',
      value: { year: 1815, month: 12, day: 10, hour: 13, minute: 0, second: 0 },
    },
    { entity: 'person', entityId: 'ada', field: 'coordinates', value: { latitude: 51.5074, longitude: -0.1278 } },
    ...extra.map((e) => ({ entity: 'person' as const, entityId: 'ada', field: e.field, value: e.value as never })),
  ]);
}

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <ExportRegistryProvider>
          <RectificationView />
        </ExportRegistryProvider>
      </StoreProvider>,
    );
    await Promise.resolve();
  });
}

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-rectification-life-events-${String(counter)}` });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function choose(id: string): void {
  const select = container?.querySelector<HTMLSelectElement>('select');
  if (select === null || select === undefined) throw new Error('test fixture bug: no person select');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function rows(): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>('.rectification-events > li') ?? [])];
}
function rowAt(index: number): HTMLElement {
  const row = rows()[index];
  if (row === undefined) throw new Error(`test fixture bug: no row ${String(index)}`);
  return row;
}
function inputsOf(row: HTMLElement): { date: HTMLInputElement; label: HTMLInputElement } {
  const date = row.querySelector<HTMLInputElement>('input[type="date"]');
  const label = row.querySelector<HTMLInputElement>('input[type="text"]');
  if (date === null || label === null) throw new Error('test fixture bug: row inputs');
  return { date, label };
}
function button(text: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === text,
  );
  if (found === undefined) throw new Error(`test fixture bug: no button ${text}`);
  return found;
}
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
function leaveRow(row: HTMLElement): void {
  act(() => {
    row.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
  });
}

describe('Rectification with a chosen person (#1399, S4)', () => {
  it('pre-fills the events from the stored list, in date order, and leaves the birth fields to the person', async () => {
    await seed([{ field: 'lifeEvents', value: STORED }]);
    await mount();
    choose('ada');
    const list = rows();
    expect(list).toHaveLength(2);
    expect(inputsOf(rowAt(0)).date.value).toBe('1999-08-11');
    expect(inputsOf(rowAt(0)).label.value).toBe('Moved abroad');
    expect(inputsOf(rowAt(1)).date.value).toBe('2004-11-06');
  });

  it('writes an edit back to the person record on leaving the row, keeping the id and the time', async () => {
    await seed([{ field: 'lifeEvents', value: STORED }]);
    await mount();
    choose('ada');
    const first = rowAt(0);
    typeInto(inputsOf(first).label, 'Moved to Spain');
    leaveRow(first);
    await settle();
    expect(store.state.people.get('ada')?.lifeEvents).toEqual([
      { id: 'a', date: '1999-08-11', time: '09:30', label: 'Moved to Spain' },
      { id: 'b', date: '2004-11-06', label: 'Second' },
    ]);
  });

  it('writes an added and a removed event to the person at once', async () => {
    await seed([{ field: 'lifeEvents', value: STORED }]);
    await mount();
    choose('ada');
    act(() => {
      button(t.addEvent).click();
    });
    const added = rowAt(2);
    typeInto(inputsOf(added).date, '2010-01-02');
    typeInto(inputsOf(added).label, 'New job');
    leaveRow(added);
    await settle();
    expect(store.state.people.get('ada')?.lifeEvents).toHaveLength(3);
    act(() => {
      button(t.removeEvent(1)).click();
    });
    await settle();
    expect(store.state.people.get('ada')?.lifeEvents?.map((e) => e.id)).toEqual(['b', expect.any(String)]);
  });

  it('saves an explicit empty list when the last event is removed', async () => {
    await seed([{ field: 'lifeEvents', value: [STORED[0]] }]);
    await mount();
    choose('ada');
    act(() => {
      button(t.removeEvent(1)).click();
    });
    await settle();
    expect(store.state.people.get('ada')?.lifeEvents).toEqual([]);
    expect(rows()).toHaveLength(1);
  });

  it('writes nothing while a row is incomplete', async () => {
    await seed([{ field: 'lifeEvents', value: STORED }]);
    await mount();
    choose('ada');
    const first = rowAt(0);
    typeInto(inputsOf(first).label, '');
    leaveRow(first);
    await settle();
    expect(store.state.people.get('ada')?.lifeEvents).toEqual(STORED.map((e) => e));
  });

  it('shows the unreadable warning and never overwrites an unreadable stored list', async () => {
    await seed([{ field: 'lifeEvents', value: [{ id: 'x', date: '2023-02-30', label: 'bad' }] }]);
    await mount();
    choose('ada');
    expect(container?.textContent).toContain(personFormMessages.en.lifeEventsUnreadable);
    const only = rowAt(0);
    typeInto(inputsOf(only).date, '2001-01-01');
    typeInto(inputsOf(only).label, 'Local only');
    leaveRow(only);
    await settle();
    const person = store.state.people.get('ada');
    expect(person?.lifeEventsUnreadable).toBe(true);
    expect(person?.lifeEvents).toBeUndefined();
  });
});

describe('Rectification without a person (#1399, S4)', () => {
  it('keeps events local: nothing is saved to any person', async () => {
    await seed([{ field: 'lifeEvents', value: STORED }]);
    await mount();
    const first = rowAt(0);
    expect(rows()).toHaveLength(1);
    typeInto(inputsOf(first).date, '2001-01-01');
    typeInto(inputsOf(first).label, 'Local');
    leaveRow(first);
    await settle();
    expect(store.state.people.get('ada')?.lifeEvents).toEqual(STORED);
    expect(container?.textContent).not.toContain(t.eventsSavedHint);
  });
});

describe('stored events to rows and back (#1399, S4)', () => {
  it('keeps id, time and order, and drops nothing', async () => {
    const { rowsFromEvents, rowsToEvents } = await import('../src/ui/life-events-draft.js');
    const rowsOut = rowsFromEvents(STORED);
    expect(rowsOut.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rowsOut[0]?.time).toBe('09:30');
    expect(rowsOut[1]?.time).toBe('');
    expect(rowsToEvents(rowsOut)).toEqual([STORED[1], STORED[0]]);
  });
});
