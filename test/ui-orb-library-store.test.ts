// @vitest-environment jsdom
/**
 * The orb library store (#590, #1220): the library and the per-context choice are account preferences read from the
 * account-preferences store. An unreadable stored value reads as empty and is flagged, not repaired.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DB_NAME } from '../src/store/db.js';
import {
  accountCacheKey,
  getAccountPreferences,
  resetAccountPreferencesForTests,
} from '../src/ui/account-preferences.js';
import {
  readOrbContextSource,
  readOrbLibrary,
  writeOrbContextSource,
  writeOrbLibrary,
} from '../src/ui/orb-library-store.js';

const profile = {
  id: 'house-style',
  name: 'House style',
  revision: 1,
  scalePercent: -10,
  aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } },
  bodyOrbs: {},
};

afterEach(() => {
  localStorage.clear();
  resetAccountPreferencesForTests();
});

/** Start as a fresh page load whose first-paint cache holds `cached`. */
function loadWithCache(cached: unknown): void {
  localStorage.setItem(accountCacheKey(DB_NAME), JSON.stringify(cached));
  resetAccountPreferencesForTests();
}

describe('the orb library store', () => {
  it('reads an empty library and no source choice for a reader who never set any, so behaviour is unchanged', () => {
    expect(readOrbLibrary()).toEqual({ profiles: [] });
    expect(readOrbContextSource()).toEqual({});
  });

  it('round-trips a saved library and a per-context choice', async () => {
    writeOrbLibrary({ profiles: [profile] });
    writeOrbContextSource({ transit: 'house-style' });
    await Promise.resolve();
    expect(readOrbLibrary().profiles).toEqual([profile]);
    expect(readOrbContextSource()).toEqual({ transit: 'house-style' });
  });

  it('keeps the same snapshot objects until a value changes, so a screen does not re-render for nothing', () => {
    const library = readOrbLibrary();
    const source = readOrbContextSource();
    expect(readOrbLibrary()).toBe(library);
    expect(readOrbContextSource()).toBe(source);
  });

  it('reads a value from the first-paint cache of the open database', () => {
    loadWithCache({
      orbLibrary: { version: 1, profiles: [profile] },
      orbContextSource: { version: 1, synastry: 'house-style' },
    });
    expect(readOrbLibrary().profiles.map((p) => p.id)).toEqual(['house-style']);
    expect(readOrbContextSource()).toEqual({ synastry: 'house-style' });
  });

  it('reads an unreadable library as empty and flags it, instead of dropping part of it', () => {
    loadWithCache({ orbLibrary: { version: 1, profiles: [profile, { ...profile, id: 'bad', revision: 0 }] } });
    expect(readOrbLibrary()).toEqual({ profiles: [] });
    expect(getAccountPreferences().unreadable).toEqual(['orbLibrary']);
  });

  it('reads a source choice of the wrong type as unreadable instead of passing it on', () => {
    loadWithCache({ orbContextSource: { version: 1, transit: 5, synastry: 'house-style' } });
    expect(readOrbContextSource()).toEqual({});
    expect(getAccountPreferences().unreadable).toEqual(['orbContextSource']);
  });
});

describe('values of a version this build does not know', () => {
  it('read as empty and flagged, so a newer build’s richer library is never rewritten without its extras', () => {
    loadWithCache({
      orbLibrary: { version: 2, profiles: [profile] },
      orbContextSource: { version: 2, transit: 'house-style' },
    });
    expect(readOrbLibrary()).toEqual({ profiles: [] });
    expect(readOrbContextSource()).toEqual({});
    expect(getAccountPreferences().unreadable).toEqual(['orbLibrary', 'orbContextSource']);
  });
});
