// @vitest-environment jsdom
/**
 * The account preferences at runtime (#1066, ADR 0004 sections 2.4 and 5; tests 6 and 8).
 *
 * Reads come from the bound store, never from `localStorage`; bind replaces everything; a setter applies at once,
 * writes one op per changed field, and rolls back on failure; unbound, a change is for this page only; the per-database
 * cache keeps one tab's account from leaking into another's (db-integrity B1); the legacy device values are captured
 * once at import, survive a bind, and are retired guard-first.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { serializeCalculationSettings } from '../src/domain/person.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog } from '../src/store/oplog.js';
import { openStore, type Store } from '../src/store/store.js';
import {
  ACCOUNT_SETTINGS_MIGRATED_KEY,
  LEGACY_ACCOUNT_SETTINGS_KEY,
  accountCacheKey,
  bindAccountPreferences,
  completeLegacyMigration,
  forgetAccountPreferencesCache,
  getAccountPreferences,
  legacyCandidates,
  resetAccountPreferencesForTests,
  setAccountPreferences,
  unbindAccountPreferences,
} from '../src/ui/account-preferences.js';
import { readDefaultCalculationProfile, useDefaultCalculationProfile } from '../src/ui/default-calculation-profile.js';
import { getLocale } from '../src/ui/locale.js';
import { readRulershipChoice } from '../src/ui/rulership-setting.js';

const SIDEREAL: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  zodiac: { kind: 'sidereal', ayanamsa: 1 },
  houseSystem: 'W',
};

let counter = 0;
const opened: Store[] = [];
async function open(name?: string): Promise<Store> {
  counter += 1;
  const store = await openStore({ name: name ?? `astraya-account-prefs-${String(counter)}` });
  opened.push(store);
  return store;
}

/** The same store, with its writes refused the way a read-only tab or a full disk refuses them. */
function refusing(store: Store, writable = true): Store {
  return new Proxy(store, {
    get(target, key, receiver) {
      if (key === 'mutate') return () => Promise.reject(new Error('Astraya is already open in another browser tab.'));
      if (key === 'writable') return writable;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

function cacheOf(dbName: string): unknown {
  const raw = localStorage.getItem(accountCacheKey(dbName));
  return raw === null ? undefined : (JSON.parse(raw) as unknown);
}

beforeEach(() => {
  localStorage.clear();
  resetAccountPreferencesForTests();
});

afterEach(() => {
  unbindAccountPreferences();
  for (const store of opened.splice(0)) store.close();
});

describe('reads and writes through the bound store (#1066)', () => {
  it('replaces memory and the cache wholesale at bind: nothing from the previous store survives', async () => {
    await setAccountPreferences({ locale: 'nl', defaultRulership: 'both' });
    expect(getLocale()).toBe('nl');
    const store = await open();
    bindAccountPreferences(store);
    expect(getLocale()).toBe('en');
    expect(readRulershipChoice()).toBe('modern');
    expect(cacheOf(store.dbName)).toBeUndefined();
  });

  it('applies a change at once, writes one op per changed field in one batch, and caches it per database', async () => {
    const store = await open();
    bindAccountPreferences(store);
    const saving = setAccountPreferences({ defaultCalculationProfile: SIDEREAL, defaultRulership: 'traditional' });
    expect(readRulershipChoice()).toBe('traditional');
    await saving;
    expect(store.outgoing().map((record) => record.field)).toEqual(['defaultRulership', 'defaultCalculationProfile']);
    expect(new Set(store.outgoing().map((record) => record.entity))).toEqual(new Set(['account']));
    expect(cacheOf(store.dbName)).toEqual({
      defaultCalculationProfile: serializeCalculationSettings(SIDEREAL),
      defaultRulership: 'traditional',
    });
    expect(readDefaultCalculationProfile()).toEqual({ settings: SIDEREAL, rulership: 'traditional' });
    // An unchanged value is never written: the log is append-only and never compacted.
    await setAccountPreferences({ defaultRulership: 'traditional' });
    expect(store.outgoing()).toHaveLength(2);
    // The pre-#1066 device keys are never written again.
    expect(localStorage.getItem('astraya:rulershipChoice')).toBeNull();
    expect(localStorage.getItem('astraya:defaultCalculationProfile')).toBeNull();
  });

  it('rolls back and reports a refused write', async () => {
    const store = await open();
    bindAccountPreferences(refusing(store));
    await expect(setAccountPreferences({ locale: 'nl' })).rejects.toThrow(/another browser tab/);
    expect(getLocale()).toBe('en');
    expect(getAccountPreferences().failure).toMatch(/another browser tab/);
    expect(store.outgoing()).toHaveLength(0);
  });

  it('applies a change for this page only while no store is bound', async () => {
    const store = await open();
    bindAccountPreferences(store);
    unbindAccountPreferences();
    await setAccountPreferences({ locale: 'nl' });
    expect(getLocale()).toBe('nl');
    expect(store.outgoing()).toHaveLength(0);
    expect(cacheOf(store.dbName)).toBeUndefined();
  });

  it('follows a register change arriving from another device', async () => {
    const store = await open();
    bindAccountPreferences(store);
    const peer = append(
      emptyLog(createClock('b0000000000000ff')),
      { entity: 'account', entityId: 'preferences', field: 'locale', value: 'nl' },
      Date.now() + 1000,
    );
    await store.receive([peer.record]);
    expect(getLocale()).toBe('nl');
    expect(cacheOf(store.dbName)).toEqual({ locale: 'nl' });
  });

  it('leaves the cache to the writer tab when its own store is read-only', async () => {
    const writer = await open('astraya-account-prefs-shared');
    await writer.mutate([{ entity: 'account', entityId: 'preferences', field: 'locale', value: 'nl' }]);
    localStorage.removeItem(accountCacheKey(writer.dbName));
    bindAccountPreferences(refusing(writer, false));
    expect(getLocale()).toBe('nl');
    expect(cacheOf(writer.dbName)).toBeUndefined();
  });

  it('forgets one database’s cache without touching another’s', async () => {
    const a = await open('astraya-user-A');
    bindAccountPreferences(a);
    await setAccountPreferences({ locale: 'nl' });
    localStorage.setItem(accountCacheKey('astraya'), JSON.stringify({ locale: 'en' }));
    forgetAccountPreferencesCache(a.dbName);
    expect(cacheOf(a.dbName)).toBeUndefined();
    expect(cacheOf('astraya')).toEqual({ locale: 'en' });
  });
});

describe('no cross-account bleed between tabs (#1066, db-integrity B1, test 6)', () => {
  it('a signed-out tab’s saved default never becomes the signed-in tab’s, on any later read or render', async () => {
    // Tab 1 is signed in as A, with A's default profile.
    const a = await open('astraya-user-A');
    await a.mutate([
      {
        entity: 'account',
        entityId: 'preferences',
        field: 'defaultCalculationProfile',
        value: serializeCalculationSettings(SIDEREAL),
      },
    ]);
    bindAccountPreferences(a);

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function Reader(): React.JSX.Element {
      const [profile] = useDefaultCalculationProfile();
      return <output>{profile?.settings.houseSystem ?? 'unset'}</output>;
    }
    act(() => {
      root.render(<Reader />);
    });
    expect(container.textContent).toBe('W');

    // Tab 2, signed out on the same browser, saves a different default: it lands in the anonymous cache.
    await act(async () => {
      localStorage.setItem(
        accountCacheKey('astraya'),
        JSON.stringify({ defaultCalculationProfile: serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS) }),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: accountCacheKey('astraya') }));
      await Promise.resolve();
    });

    // Tab 1 re-renders and "creates a person": the default it hands out is still A's.
    expect(container.textContent).toBe('W');
    expect(readDefaultCalculationProfile()?.settings).toEqual(SIDEREAL);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe('the legacy device values (#1066, section 5, test 8)', () => {
  function legacy(values: Readonly<Record<string, string>>): void {
    localStorage.clear();
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    // As on the first launch of this build: the capture runs at import, before any bind.
    resetAccountPreferencesForTests();
  }

  it('captures only the explicitly present keys, and shows them on first paint', () => {
    legacy({ 'astraya:reportLocale': 'nl', 'astraya:rulershipChoice': 'both' });
    expect(JSON.parse(localStorage.getItem(LEGACY_ACCOUNT_SETTINGS_KEY) ?? '{}')).toEqual({
      locale: 'nl',
      defaultRulership: 'both',
    });
    expect(getLocale()).toBe('nl');
    expect(readRulershipChoice()).toBe('both');
    expect(legacyCandidates()).toEqual({ locale: { value: 'nl' }, defaultRulership: { value: 'both' } });
  });

  it('captures nothing when no key was ever set', () => {
    legacy({});
    expect(localStorage.getItem(LEGACY_ACCOUNT_SETTINGS_KEY)).toBeNull();
    expect(legacyCandidates()).toEqual({});
  });

  it('repairs a malformed profile with the old lenient parser and offers it in the new strict shape', () => {
    legacy({ 'astraya:defaultCalculationProfile': '{"settings":{"houseSystem":"W"}}' });
    const candidate = legacyCandidates().defaultCalculationProfile?.value;
    expect(candidate).toEqual(serializeCalculationSettings({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' }));
  });

  it('keeps the capture across a bind that empties the cache, and still shows it for never-written fields', async () => {
    legacy({ 'astraya:reportLocale': 'nl' });
    const store = await open();
    bindAccountPreferences(store);
    expect(localStorage.getItem(LEGACY_ACCOUNT_SETTINGS_KEY)).not.toBeNull();
    expect(getLocale()).toBe('nl');
  });

  it('is retired guard first, then the capture, and then no longer shown', async () => {
    legacy({ 'astraya:reportLocale': 'nl' });
    const store = await open();
    bindAccountPreferences(store);
    completeLegacyMigration();
    expect(localStorage.getItem(ACCOUNT_SETTINGS_MIGRATED_KEY)).toBe('1');
    expect(localStorage.getItem(LEGACY_ACCOUNT_SETTINGS_KEY)).toBeNull();
    expect(getLocale()).toBe('en');
    expect(legacyCandidates()).toEqual({});
    // A later launch with the guard set does not capture again, even if an older build wrote the key since.
    localStorage.setItem('astraya:reportLocale', 'nl');
    resetAccountPreferencesForTests();
    expect(localStorage.getItem(LEGACY_ACCOUNT_SETTINGS_KEY)).toBeNull();
  });

  it('first paint reads the cache of the database the last user opens, once migrated', () => {
    localStorage.setItem(ACCOUNT_SETTINGS_MIGRATED_KEY, '1');
    localStorage.setItem('astraya:lastUserId', 'A');
    localStorage.setItem(accountCacheKey('astraya-user-A'), JSON.stringify({ locale: 'nl' }));
    localStorage.setItem(accountCacheKey('astraya'), JSON.stringify({ locale: 'en' }));
    resetAccountPreferencesForTests();
    expect(getLocale()).toBe('nl');
  });
});
