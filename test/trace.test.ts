/**
 * `src/trace.ts` (#492): the opt-in diagnostic helper must be a true no-op outside a browser —
 * never touching the `localStorage` global at all, since merely referencing it under Node
 * (`engines.node >=24` allows Node's own experimental `localStorage`) emits an
 * `ExperimentalWarning`, which this repo's zero-warning standard forbids. It must also never
 * throw when storage access is denied, since callers (`store.ts`, `sync/engine.ts`) call it
 * between a committed mutation and listener notification, where a thrown error would wrongly
 * abort an already-durable write.
 *
 * This file deliberately carries no per-file environment override, so it runs under this
 * project's default `node` test environment, where `window` really is undefined — the exact
 * condition the fix's first branch guards against. (Vitest regex-scans the whole file for an
 * environment-override tag, so that override is spelled out here without using its own syntax.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trace } from '../src/trace.ts';

describe('trace (#492) — no browser global', () => {
  it('is a no-op and never touches localStorage when window is undefined', () => {
    expect(typeof window).toBe('undefined');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    expect(() => {
      trace('scope', 'message', { some: 'data' });
    }).not.toThrow();
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });
});

describe('trace (#492) — denied storage', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('does not throw when localStorage.getItem throws (e.g. a hardened browser SecurityError)', () => {
    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      },
    } as unknown as Window & typeof globalThis;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    expect(() => {
      trace('scope', 'message');
    }).not.toThrow();
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('logs when the flag is set and storage access succeeds', () => {
    globalThis.window = {
      localStorage: { getItem: (key: string) => (key === 'astraya:trace' ? '1' : null) },
    } as unknown as Window & typeof globalThis;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    trace('scope', 'message', { some: 'data' });
    expect(debugSpy).toHaveBeenCalledWith('[trace:scope] message', { some: 'data' });
    debugSpy.mockRestore();
  });

  it('does not log when the flag is absent', () => {
    globalThis.window = {
      localStorage: { getItem: () => null },
    } as unknown as Window & typeof globalThis;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    trace('scope', 'message');
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });
});
