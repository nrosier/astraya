// @vitest-environment jsdom
/**
 * The once-per-account move of the device's chart settings onto existing people (#806).
 *
 * Real store (fake-indexeddb via test/setup.ts); only the session hooks are stubbed, since the
 * provider would otherwise need a server. The sync engine is a minimal stand-in exposing the
 * `status` / `subscribe` surface the hook uses.
 *
 * Timing: the migration runs several async store transactions before it sets its localStorage
 * guard key, so every positive test waits (via `vi.waitFor`) on that end state rather than on a
 * fixed delay. Negative tests first wait for a positive signal that the attempt has settled.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore } from '../src/store/store.js';
import type { Store } from '../src/store/store.js';
import type { SyncState } from '../src/ui/status.js';
import { serializeCalculationSettings } from '../src/domain/person.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import {
  CALCULATION_SETTINGS_MIGRATED_KEY,
  useCalculationSettingsMigration,
} from '../src/ui/use-calculation-settings-migration.js';

interface FakeEngine {
  status: SyncState;
  subscribe(listener: () => void): () => void;
}

interface Session {
  store: Store | undefined;
  userId: string | undefined;
  engine: FakeEngine | undefined;
}

const session: Session = { store: undefined, userId: undefined, engine: undefined };

vi.mock('../src/ui/session-context.js', () => ({
  useStoreStatus: () => (session.store === undefined ? { kind: 'opening' } : { kind: 'ready', store: session.store }),
  useSessionUserOrUndefined: () => (session.userId === undefined ? undefined : { id: session.userId }),
  useSyncEngine: () => session.engine,
}));

const pushed: string[][] = [];
let pushAttempts = 0;
let pushFails = false;

vi.mock('../src/sync/engine.js', () => ({
  pushRecords: (records: readonly { hlc: unknown }[]): Promise<void> => {
    pushAttempts += 1;
    if (pushFails) return Promise.reject(new Error('offline'));
    pushed.push(records.map((record) => String(record.hlc)));
    return Promise.resolve();
  },
}));

function Harness(): null {
  useCalculationSettingsMigration();
  return null;
}

interface EngineHandle {
  engine: FakeEngine;
  setStatus: (next: SyncState) => void;
  listenerCount: () => number;
}

function makeEngine(initial: SyncState): EngineHandle {
  const listeners = new Set<() => void>();
  const engine: FakeEngine = {
    status: initial,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    engine,
    setStatus(next) {
      engine.status = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

async function addPeople(...ids: string[]): Promise<void> {
  await store.mutate(ids.map((id) => ({ entity: 'person', entityId: id, field: 'displayName', value: id })));
}

/**
 * Renders the harness. Effects run synchronously inside React's `act`, so when this returns the
 * hook has already decided whether to start a migration; any async work it started is awaited by
 * the tests through `vi.waitFor`.
 */
function mount(): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });
}

function unmount(): void {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
}

function registerOf(id: string): unknown {
  return store.state.people.get(id)?.calculationSettings;
}

const keyFor = (user: string): string => `${CALCULATION_SETTINGS_MIGRATED_KEY}:${user}`;

beforeEach(async () => {
  counter += 1;
  localStorage.clear();
  pushed.length = 0;
  pushAttempts = 0;
  pushFails = false;
  store = await openStore({ name: `astraya-migration-hook-${String(counter)}` });
  session.store = store;
  session.userId = undefined;
  session.engine = undefined;
});

afterEach(() => {
  if (root) unmount();
  store.close();
});

describe('useCalculationSettingsMigration (#806)', () => {
  it('signed out: stamps every person lacking a register and sets the anonymous key', async () => {
    await addPeople('p1', 'p2');
    mount();
    expect(store.writable).toBe(true);
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('anonymous'))).toBe('1');
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(registerOf('p2')).toEqual(DEFAULT_EXTENDED_SETTINGS);
  });

  it('a second mount with the key already set writes nothing', async () => {
    await addPeople('p1');
    mount();
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('anonymous'))).toBe('1');
      },
      { timeout: 5000 },
    );
    unmount();
    await addPeople('p2');
    // The key is already set, so the hook returns before any store work: nothing is scheduled
    // and the effect has completed inside act, so there is no later write to wait for.
    mount();
    expect(registerOf('p2')).toBeUndefined();
  });

  it('never overwrites a person who already has a register', async () => {
    await addPeople('p1', 'p2');
    const custom = serializeCalculationSettings({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' });
    await store.mutate([{ entity: 'person', entityId: 'p1', field: 'calculationSettings', value: custom }]);
    const kept = registerOf('p1');
    expect(kept).toBeDefined();
    mount();
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('anonymous'))).toBe('1');
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toEqual(kept);
    expect(registerOf('p1')).toMatchObject({ houseSystem: 'W' });
    expect(registerOf('p2')).toEqual(DEFAULT_EXTENDED_SETTINGS);
  });

  it('signed in, not yet synced: writes nothing and leaves the key unset', async () => {
    await addPeople('p1');
    session.userId = 'u1';
    const { engine, listenerCount } = makeEngine({ kind: 'syncing' });
    session.engine = engine;
    mount();
    // The effect has run once it has subscribed to the engine; only then is "nothing written" meaningful.
    await vi.waitFor(
      () => {
        expect(listenerCount()).toBe(1);
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toBeUndefined();
    expect(localStorage.getItem(keyFor('u1'))).toBeNull();
  });

  it('signed in: runs once the status becomes synced', async () => {
    await addPeople('p1');
    const { engine, setStatus, listenerCount } = makeEngine({ kind: 'syncing' });
    session.userId = 'u1';
    session.engine = engine;
    mount();
    await vi.waitFor(
      () => {
        expect(listenerCount()).toBe(1);
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toBeUndefined();
    act(() => {
      setStatus({ kind: 'synced', at: 1 });
    });
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('u1'))).toBe('1');
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toBeDefined();
    expect(localStorage.getItem(keyFor('anonymous'))).toBeNull();
  });

  it('signed in: pushes the seeded records and stamps them at the minimum HLC', async () => {
    await addPeople('p1', 'p2');
    session.userId = 'u1';
    session.engine = makeEngine({ kind: 'synced', at: 1 }).engine;
    mount();
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('u1'))).toBe('1');
      },
      { timeout: 5000 },
    );
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toHaveLength(2);
    for (const hlc of pushed[0] ?? []) expect(hlc).toMatch(/^0{18}-/);
  });

  it('signed out: seeds without pushing', async () => {
    await addPeople('p1');
    mount();
    // The guard key is set only after the seed completes, so it is the settle signal.
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('anonymous'))).toBe('1');
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toBeDefined();
    expect(pushed).toHaveLength(0);
  });

  it('signed in: a failed push leaves the migration not done and the retry re-pushes the seeds', async () => {
    await addPeople('p1');
    const { engine, setStatus } = makeEngine({ kind: 'synced', at: 1 });
    session.userId = 'u1';
    session.engine = engine;
    pushFails = true;
    mount();
    // The rejected push is the settle signal: the attempt is marked not running only after it rejects.
    await vi.waitFor(
      () => {
        expect(pushAttempts).toBe(1);
      },
      { timeout: 5000 },
    );
    expect(registerOf('p1')).toBeDefined();
    expect(localStorage.getItem(keyFor('u1'))).toBeNull();
    expect(pushed).toHaveLength(0);

    pushFails = false;
    act(() => {
      setStatus({ kind: 'synced', at: 2 });
    });
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(keyFor('u1'))).toBe('1');
        expect(pushed).toHaveLength(1);
      },
      { timeout: 5000 },
    );
    expect(pushed[0]).toHaveLength(1);
  });
});
