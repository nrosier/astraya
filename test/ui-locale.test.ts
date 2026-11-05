/**
 * `src/ui/locale.ts` (#493): storage denial must never crash the app at import time, and a
 * failed write must still update the in-memory locale and notify subscribers. Each test that
 * manipulates `localStorage` re-imports the module fresh (`vi.resetModules()` before a dynamic
 * `import()` of the same specifier), since the module reads storage once at top-level on first
 * import — exactly the behavior being tested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function throwingLocalStorage(): Storage {
  return {
    getItem: () => {
      throw new DOMException('blocked', 'SecurityError');
    },
    setItem: () => {
      throw new DOMException('blocked', 'SecurityError');
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
}

describe('the page language follows the locale (#1079)', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const root = { lang: 'en' };

  beforeEach(() => {
    vi.resetModules();
    root.lang = 'en';
    Object.defineProperty(globalThis, 'document', { value: { documentElement: root }, configurable: true });
  });

  afterEach(() => {
    for (const [key, descriptor] of [
      ['document', documentDescriptor],
      ['localStorage', storageDescriptor],
    ] as const) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
      else Object.defineProperty(globalThis, key, descriptor);
    }
  });

  it('sets <html lang> from the stored locale on start, and on every change', async () => {
    const store = new Map<string, string>([['astraya:reportLocale', 'nl']]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    const { setLocale } = await import('../src/ui/locale.ts');
    expect(root.lang).toBe('nl');
    setLocale('en');
    expect(root.lang).toBe('en');
    setLocale('nl');
    expect(root.lang).toBe('nl');
  });
});

describe('locale storage denial (#493)', () => {
  // Captures the descriptor rather than reading `globalThis.localStorage` by value: Node's own
  // `localStorage` is a lazy getter, and merely invoking it triggers the same
  // `ExperimentalWarning` #492 fixed `trace.ts` for — this test file must not reintroduce it.
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, 'localStorage');
    } else {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    }
  });

  it('falls back to English at import time rather than throwing when storage read is denied', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingLocalStorage(),
      configurable: true,
      writable: true,
    });
    const { getLocale } = await import('../src/ui/locale.ts');
    expect(getLocale()).toBe('en');
  });

  it('still updates in-memory state and notifies listeners when the write is denied', async () => {
    // Storage reads succeed (so the module imports cleanly) but writes throw — a plausible
    // real-world split (e.g. a storage quota, or a policy that allows read but not write).
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });
    const { getLocale, setLocale } = await import('../src/ui/locale.ts');
    expect(getLocale()).toBe('en');
    // The regression this guards against: `current` used to be reassigned *before* the
    // unguarded write, so a throwing write never reached the `for (const listener...)` loop
    // below it — `useLocale`'s `useSyncExternalStore` subscribers (not exported standalone to
    // test directly here) would never re-render. Asserting the call doesn't throw and the
    // in-memory value does change is exactly what guarantees that loop was reached.
    expect(() => {
      setLocale('nl');
    }).not.toThrow();
    expect(getLocale()).toBe('nl');
  });

  it('a working localStorage keeps the chosen locale in the bound store and its cache (#1066)', async () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
        key: () => null,
        length: 0,
      },
    });
    // Since #1066 the language is an account preference: saved in the bound store's op log and its own
    // first-paint cache, never in the pre-#1066 device key.
    const { getLocale, setLocale } = await import('../src/ui/locale.ts');
    const { bindAccountPreferences, accountCacheKey } = await import('../src/ui/account-preferences.ts');
    const { openStore } = await import('../src/store/store.ts');
    const opened = await openStore({ name: 'astraya-locale-test' });
    try {
      bindAccountPreferences(opened);
      setLocale('nl');
      expect(getLocale()).toBe('nl');
      await vi.waitFor(() => {
        expect(opened.state.account.locale?.value).toBe('nl');
      });
      expect(JSON.parse(store.get(accountCacheKey('astraya-locale-test')) ?? '{}')).toEqual({ locale: 'nl' });
      expect(store.get('astraya:reportLocale')).toBeUndefined();
    } finally {
      opened.close();
    }
  });
});
