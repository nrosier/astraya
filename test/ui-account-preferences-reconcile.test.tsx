// @vitest-environment jsdom
/**
 * The one-time reconciliation of this device's preferences into the open store (#1066, ADR 0004 sections 3.6 and 5).
 *
 * Against real `openStore` stores and a faked session (same shape as the #806 migration hook test): the signed-out
 * store takes the legacy values at once; an account store waits for its first completed sync; a conflict becomes one
 * prompt; the reader's answer is written with a real timestamp; the marker stops a declined prompt from returning;
 * sign-in candidates older than the marker are not kept.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeHlc } from '../src/store/hlc.js';
import { openStore, type Store } from '../src/store/store.js';
import type { SyncState } from '../src/ui/status.js';
import {
  ACCOUNT_SETTINGS_MIGRATED_KEY,
  LEGACY_ACCOUNT_SETTINGS_KEY,
  captureSignInCandidates,
  persistSignInCandidates,
  resetAccountPreferencesForTests,
} from '../src/ui/account-preferences.js';
import {
  useAccountPreferencesReconcile,
  type AccountReconcilePrompt,
} from '../src/ui/account-preferences-reconcile.js';

interface FakeEngine {
  status: SyncState;
  subscribe(listener: () => void): () => void;
}

const session: { store: Store | undefined; engine: FakeEngine | undefined } = { store: undefined, engine: undefined };

vi.mock('../src/ui/session-context.js', () => ({
  useStoreStatus: () => (session.store === undefined ? { kind: 'opening' } : { kind: 'ready', store: session.store }),
  useSyncEngine: () => session.engine,
}));

function makeEngine(initial: SyncState): { engine: FakeEngine; setStatus: (next: SyncState) => void } {
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
  };
}

let latest: AccountReconcilePrompt | undefined;
function Harness(): null {
  latest = useAccountPreferencesReconcile();
  return null;
}

let root: Root | undefined;
let container: HTMLElement | undefined;
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
}

let counter = 0;
const opened: Store[] = [];
async function open(account: boolean): Promise<Store> {
  counter += 1;
  const store = await openStore({
    name: account ? `astraya-user-reconcile-${String(counter)}` : `astraya`,
  });
  opened.push(store);
  return store;
}

function legacy(values: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  resetAccountPreferencesForTests();
}

const pref = (field: string, value: string) => ({ entity: 'account', entityId: 'preferences', field, value });
/** Let the wall clock move on, so the next write's timestamp is strictly later. */
const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
const migrated = (): boolean => localStorage.getItem(ACCOUNT_SETTINGS_MIGRATED_KEY) !== null;

beforeEach(async () => {
  localStorage.clear();
  resetAccountPreferencesForTests();
  latest = undefined;
  session.store = undefined;
  session.engine = undefined;
  // The signed-out database name is shared, so it starts empty for each test.
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('astraya');
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      resolve();
    };
  });
});

afterEach(() => {
  if (root !== undefined) unmount();
  for (const store of opened.splice(0)) store.close();
});

describe('the signed-out store (#1066)', () => {
  it('takes the legacy values at once, then retires them guard first', async () => {
    legacy({ 'astraya:reportLocale': 'nl', 'astraya:rulershipChoice': 'both' });
    const store = await open(false);
    session.store = store;
    mount();
    await vi.waitFor(() => {
      expect(migrated()).toBe(true);
    });
    expect(store.state.account.locale?.value).toBe('nl');
    expect(store.state.account.defaultRulership?.value).toBe('both');
    expect(localStorage.getItem(LEGACY_ACCOUNT_SETTINGS_KEY)).toBeNull();
    // Written with a real timestamp, never a seed (which would lose to every later write).
    expect(decodeHlc(String(store.state.account.locale?.hlc)).millis).toBeGreaterThan(0);
    expect(latest).toBeUndefined();
  });

  it('sets the guard when there is nothing to move', async () => {
    session.store = await open(false);
    mount();
    await vi.waitFor(() => {
      expect(migrated()).toBe(true);
    });
  });
});

describe('an account store (#1066)', () => {
  it('waits for the first completed sync before comparing anything', async () => {
    legacy({ 'astraya:reportLocale': 'nl' });
    const store = await open(true);
    const handle = makeEngine({ kind: 'syncing' });
    session.store = store;
    session.engine = handle.engine;
    mount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.state.account.locale).toBeUndefined();
    expect(migrated()).toBe(false);

    act(() => {
      handle.setStatus({ kind: 'synced', at: Date.now() });
    });
    await vi.waitFor(() => {
      expect(store.state.account.locale?.value).toBe('nl');
    });
  });

  it('waits offline, with no engine at all', async () => {
    legacy({ 'astraya:reportLocale': 'nl' });
    const store = await open(true);
    session.store = store;
    mount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.state.account.locale).toBeUndefined();
  });

  it('asks about a differing setting of unknown age and writes the reader’s choice', async () => {
    const store = await open(true);
    await store.mutate([pref('locale', 'en'), pref('defaultRulership', 'modern')]);
    legacy({ 'astraya:reportLocale': 'nl', 'astraya:rulershipChoice': 'traditional' });
    session.store = store;
    session.engine = makeEngine({ kind: 'synced', at: Date.now() }).engine;
    mount();
    await vi.waitFor(() => {
      expect(latest?.proposals.map((proposal) => proposal.field)).toEqual(['locale', 'defaultRulership']);
    });
    expect(latest?.account).toBe(true);
    await act(async () => {
      await latest?.resolve([
        { field: 'locale', use: 'device' },
        { field: 'defaultRulership', use: 'account' },
      ]);
    });
    expect(store.state.account.locale?.value).toBe('nl');
    expect(store.state.account.defaultRulership?.value).toBe('modern');
    expect(latest).toBeUndefined();
    expect(migrated()).toBe(true);
  });

  it('keeps a newer account value without asking, when the signed-out choice is older (rule 4)', async () => {
    const anonymous = await open(false);
    await anonymous.mutate([pref('locale', 'nl')]);
    await later();
    const account = await open(true);
    await account.mutate([pref('locale', 'en')]);
    await persistSignInCandidates(account, captureSignInCandidates(anonymous));
    localStorage.setItem(ACCOUNT_SETTINGS_MIGRATED_KEY, '1');
    resetAccountPreferencesForTests();
    session.store = account;
    session.engine = makeEngine({ kind: 'synced', at: Date.now() }).engine;
    mount();
    await vi.waitFor(async () => {
      expect(await account.getAccountReconcile()).not.toHaveProperty('pending');
    });
    expect(latest).toBeUndefined();
    expect(account.state.account.locale?.value).toBe('en');
  });

  it('dismissing keeps the account’s values, and the same candidate is not offered again', async () => {
    const account = await open(true);
    await account.mutate([pref('locale', 'en')]);
    await later();
    const anonymous = await open(false);
    await anonymous.mutate([pref('locale', 'nl')]);
    await persistSignInCandidates(account, captureSignInCandidates(anonymous));
    localStorage.setItem(ACCOUNT_SETTINGS_MIGRATED_KEY, '1');
    resetAccountPreferencesForTests();
    session.store = account;
    session.engine = makeEngine({ kind: 'synced', at: Date.now() }).engine;
    mount();
    await vi.waitFor(() => {
      expect(latest?.proposals).toEqual([{ field: 'locale', deviceValue: 'nl', accountValue: 'en' }]);
    });
    await act(async () => {
      await latest?.resolve([]);
    });
    expect(account.state.account.locale?.value).toBe('en');
    const state = await account.getAccountReconcile();
    expect(state).not.toHaveProperty('pending');
    expect(state.marker).toBe(anonymous.state.account.locale?.hlc);

    // A later sign-in with the same candidate: not newer than the marker, so it is not kept.
    await persistSignInCandidates(account, captureSignInCandidates(anonymous));
    expect(await account.getAccountReconcile()).not.toHaveProperty('pending');
  });

  it('offers a newer signed-out choice over an older account value', async () => {
    const account = await open(true);
    await account.mutate([pref('defaultRulership', 'modern')]);
    await later();
    const anonymous = await open(false);
    await anonymous.mutate([pref('defaultRulership', 'both')]);
    await persistSignInCandidates(account, captureSignInCandidates(anonymous));
    localStorage.setItem(ACCOUNT_SETTINGS_MIGRATED_KEY, '1');
    resetAccountPreferencesForTests();
    session.store = account;
    session.engine = makeEngine({ kind: 'synced', at: Date.now() }).engine;
    mount();
    await vi.waitFor(() => {
      expect(latest?.proposals).toEqual([{ field: 'defaultRulership', deviceValue: 'both', accountValue: 'modern' }]);
    });
  });

  it('drops a waiting prompt when the store changes, keeping the legacy values for the account that answers', async () => {
    const first = await open(true);
    await first.mutate([pref('locale', 'en')]);
    legacy({ 'astraya:reportLocale': 'nl' });
    session.store = first;
    session.engine = makeEngine({ kind: 'synced', at: Date.now() }).engine;
    mount();
    await vi.waitFor(() => {
      expect(latest).toBeDefined();
    });
    const second = await open(true);
    session.store = second;
    act(() => {
      root?.render(<Harness />);
    });
    await vi.waitFor(() => {
      expect(second.state.account.locale?.value).toBe('nl');
    });
    expect(first.state.account.locale?.value).toBe('en');
  });
});
