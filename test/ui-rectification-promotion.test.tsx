// @vitest-environment jsdom
/**
 * Rectification screen (#1445): the method note and citation-pending label, the event include toggles, the reported
 * and rectified time fields, and the "Promote to rectified time" action kept disabled while the methodology citation
 * is pending. The store is the real one; no ephemeris is involved because nothing here runs a search.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
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

async function seed(extra: { field: string; value: unknown }[] = []): Promise<void> {
  await store.mutate([
    { entity: 'person', entityId: 'ada', field: 'displayName', value: 'Ada Lovelace' },
    {
      entity: 'person',
      entityId: 'ada',
      field: 'civil',
      value: { year: 1815, month: 12, day: 10, hour: 13, minute: 5, second: 0 },
    },
    { entity: 'person', entityId: 'ada', field: 'coordinates', value: { latitude: 51.5074, longitude: -0.1278 } },
    {
      entity: 'person',
      entityId: 'ada',
      field: 'lifeEvents',
      value: [{ id: 'a', date: '1835-07-08', label: 'Married' }],
    },
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

function choose(id: string): void {
  const select = container?.querySelector<HTMLSelectElement>('select');
  if (select === null || select === undefined) throw new Error('test fixture bug: no person select');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function promoteButton(): HTMLButtonElement {
  const found = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === t.promoteButton,
  );
  if (found === undefined) throw new Error('test fixture bug: no promote button');
  return found;
}

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-rectification-promotion-${String(counter)}` });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

describe('Rectification method note (#1445)', () => {
  it('states the method, its limits and that the scoring citation is pending', async () => {
    await mount();
    const text = container?.textContent ?? '';
    expect(text).toContain(t.methodHeading);
    expect(text).toContain(t.methodBody);
    expect(text).toContain(t.methodLimits);
    expect(text).toContain(t.citationPending);
  });
});

describe('Promote to rectified time (#1445)', () => {
  it('is disabled with the reason "methodology citation pending", even with a person chosen', async () => {
    await seed();
    await mount();
    choose('ada');
    const button = promoteButton();
    expect(button.disabled).toBe(true);
    const reason = container?.querySelector('#rectification-promote-reason');
    expect(reason?.textContent).toContain(t.promoteBlocked.citation);
    expect(button.getAttribute('aria-describedby')).toBe('rectification-promote-reason');
    act(() => {
      button.click();
    });
    expect(store.state.people.get('ada')?.rectifiedTime).toBeUndefined();
  });

  it('shows the reported time and, when saved, the rectified time labelled as an estimate with its source note', async () => {
    await seed([{ field: 'rectifiedTime', value: { time: '13:12', note: 'Rectified via Solar Arc and transits' } }]);
    await mount();
    choose('ada');
    const text = container?.textContent ?? '';
    expect(text).toContain('13:05');
    expect(text).toContain(t.rectifiedTimeLabel);
    expect(text).toContain(t.rectifiedTimeValue('13:12'));
    expect(text).toContain('Rectified via Solar Arc and transits');
    expect(text).toContain(t.reportedNeverChanged);
    expect(store.state.people.get('ada')?.moment?.civil.hour).toBe(13);
    expect(store.state.people.get('ada')?.moment?.civil.minute).toBe(5);
  });
});

describe('Event include toggles (#1445)', () => {
  it('gives every event row an include toggle, on by default, that can be turned off', async () => {
    await seed();
    await mount();
    choose('ada');
    const toggle = container?.querySelector<HTMLInputElement>('.rectification-events input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    act(() => {
      toggle?.click();
    });
    expect(toggle?.checked).toBe(false);
    // Excluding an event is a choice for this session's score, not an edit of the stored events.
    expect(store.state.people.get('ada')?.lifeEvents).toHaveLength(1);
  });
});
