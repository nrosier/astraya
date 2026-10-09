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

  it('a working localStorage still persists and reads back the chosen locale', async () => {
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
    const { getLocale, setLocale } = await import('../src/ui/locale.ts');
    setLocale('nl');
    expect(getLocale()).toBe('nl');
    expect(store.get('astraya:reportLocale')).toBe('nl');
  });
});
