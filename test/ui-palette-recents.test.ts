/**
 * `src/ui/palette-recents.ts` (#1654): the command palette's recents (capped at 8, deduplicated,
 * most recent first) and pins (in pin order) live in localStorage. Each test installs a fresh
 * in-memory `localStorage` so state never leaks between cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_CAP, prunePaletteState, readPaletteState, recordRecent, togglePin } from '../src/ui/palette-recents';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

function throwingStorage(): Storage {
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

describe('the palette recents and pins store (#1654)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty when nothing is stored', () => {
    expect(readPaletteState()).toEqual({ recents: [], pins: [] });
  });

  it('adds a recent to the front', () => {
    recordRecent('timing');
    recordRecent('charts');
    expect(readPaletteState().recents).toEqual(['charts', 'timing']);
  });

  it('moves a repeated recent to the front without duplicating it', () => {
    recordRecent('timing');
    recordRecent('charts');
    recordRecent('timing');
    expect(readPaletteState().recents).toEqual(['timing', 'charts']);
  });

  it('caps recents at 8, dropping the oldest', () => {
    expect(RECENT_CAP).toBe(8);
    for (let index = 1; index <= 10; index += 1) recordRecent(`entry-${String(index)}`);
    const { recents } = readPaletteState();
    expect(recents).toHaveLength(8);
    expect(recents[0]).toBe('entry-10');
    expect(recents).not.toContain('entry-1');
    expect(recents).not.toContain('entry-2');
  });

  it('pins in pin order and reports the new state', () => {
    expect(togglePin('charts')).toBe(true);
    expect(togglePin('timing')).toBe(true);
    expect(readPaletteState().pins).toEqual(['charts', 'timing']);
  });

  it('unpins an already pinned entry and reports the new state', () => {
    togglePin('charts');
    togglePin('timing');
    expect(togglePin('charts')).toBe(false);
    expect(readPaletteState().pins).toEqual(['timing']);
  });

  it('keeps pins and recents separate', () => {
    togglePin('charts');
    recordRecent('timing');
    expect(readPaletteState()).toEqual({ recents: ['timing'], pins: ['charts'] });
  });

  it('prunes unknown ids from both lists and writes only when something was dropped', () => {
    recordRecent('timing');
    recordRecent('gone');
    togglePin('gone');
    togglePin('charts');
    prunePaletteState(new Set(['timing', 'charts']));
    expect(readPaletteState()).toEqual({ recents: ['timing'], pins: ['charts'] });
  });

  it('ignores malformed stored values and returns empty lists', () => {
    localStorage.setItem('astraya:palette-recents', '{not json');
    expect(readPaletteState()).toEqual({ recents: [], pins: [] });
    localStorage.setItem('astraya:palette-recents', JSON.stringify({ recents: 'timing', pins: [1, '', 'charts'] }));
    expect(readPaletteState()).toEqual({ recents: [], pins: ['charts'] });
  });

  it('falls back to empty and never throws when storage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(() => {
      recordRecent('timing');
      togglePin('charts');
      prunePaletteState(new Set());
    }).not.toThrow();
    expect(readPaletteState()).toEqual({ recents: [], pins: [] });
  });
});
