// @vitest-environment jsdom
/** The device's orb library store (#590): validated reads, a damaged value reading as empty, and unchanged defaults. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  ORB_CONTEXT_SOURCE_KEY,
  ORB_LIBRARY_KEY,
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
});

describe('the orb library store', () => {
  it('reads an empty library and no source choice on a device that never set any, so behaviour is unchanged', () => {
    expect(readOrbLibrary()).toEqual({ profiles: [] });
    expect(readOrbContextSource()).toEqual({});
  });

  it('round-trips a saved library and a per-context choice', () => {
    writeOrbLibrary({ profiles: [profile] });
    writeOrbContextSource({ transit: 'house-style' });
    expect(readOrbLibrary().profiles).toEqual([profile]);
    expect(readOrbContextSource()).toEqual({ transit: 'house-style' });
  });

  it('reads damaged stored values as empty, and drops only the bad profile', () => {
    localStorage.setItem(ORB_LIBRARY_KEY, '{not json');
    expect(readOrbLibrary()).toEqual({ profiles: [] });
    localStorage.setItem(
      ORB_LIBRARY_KEY,
      JSON.stringify({ profiles: [profile, { ...profile, id: 'bad', revision: 0 }] }),
    );
    expect(readOrbLibrary().profiles.map((p) => p.id)).toEqual(['house-style']);
  });

  it('ignores a source choice of the wrong type instead of passing it on', () => {
    localStorage.setItem(ORB_CONTEXT_SOURCE_KEY, JSON.stringify({ transit: 5, synastry: 'house-style' }));
    expect(readOrbContextSource()).toEqual({ synastry: 'house-style' });
  });
});
