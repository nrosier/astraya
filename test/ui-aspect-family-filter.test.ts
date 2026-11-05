/**
 * Aspect-family filters and consultation presets (#1063): family membership, the orb cap and the preset contents.
 */
import { describe, expect, it } from 'vitest';
import {
  ASPECT_FAMILIES,
  CATALOGUE_KEYS,
  FILTERABLE_FAMILIES,
  isContactShown,
  orbCapFor,
  toggleFamily,
  type AspectFamilyKey,
} from '../src/ui/aspect-family-filter.js';

const none = new Set<AspectFamilyKey>();
const trine = { aKey: 'sun', bKey: 'moon', aspectKey: 'trine', orb: 4 };

describe('aspect families', () => {
  it('name only aspects the catalogue holds, each in one family', () => {
    const all = ASPECT_FAMILIES.flatMap((family) => family.aspectKeys);
    for (const key of all) expect(CATALOGUE_KEYS).toContain(key);
    expect(new Set(all).size).toBe(all.length);
  });

  it('hold the recorded angles', () => {
    const keys = (name: AspectFamilyKey): readonly string[] =>
      ASPECT_FAMILIES.find((f) => f.key === name)?.aspectKeys ?? [];
    expect(keys('major')).toEqual(['conjunction', 'sextile', 'square', 'trine', 'opposition']);
    expect(keys('hardMinor')).toEqual(['semisquare', 'sesquiquadrate', 'quincunx', 'semisextile']);
    expect(keys('softMinor')).toEqual(['quintile', 'biquintile']);
  });

  it('offer no filter for parallels, which neither the wheel nor the matrix draws', () => {
    expect(FILTERABLE_FAMILIES.map((f) => f.key)).not.toContain('parallels');
  });
});

describe('isContactShown', () => {
  it('shows everything with no family and no cap (the default view)', () => {
    expect(isContactShown(trine, none)).toBe(true);
    expect(isContactShown({ ...trine, aspectKey: 'quintile', orb: 9 }, none)).toBe(true);
  });

  it('keeps only the selected families', () => {
    const major = new Set<AspectFamilyKey>(['major']);
    expect(isContactShown(trine, major)).toBe(true);
    expect(isContactShown({ ...trine, aspectKey: 'quincunx' }, major)).toBe(false);
  });

  it('adds contacts to nodes and angles for the nodal and angular family, whatever the aspect', () => {
    const families = new Set<AspectFamilyKey>(['nodalAngular']);
    expect(isContactShown({ aKey: 'venus', bKey: 'asc', aspectKey: 'quincunx' }, families)).toBe(true);
    expect(isContactShown({ aKey: 'venus', bKey: 'mars', aspectKey: 'quincunx' }, families)).toBe(false);
  });

  it('hides a contact wider than the cap, using the luminary cap for a pair with the Sun or Moon', () => {
    const caps = { luminary: 3, planet: 2 };
    expect(isContactShown(trine, none, caps)).toBe(false);
    expect(isContactShown({ ...trine, orb: 3 }, none, caps)).toBe(true);
    expect(isContactShown({ aKey: 'mars', bKey: 'venus', aspectKey: 'trine', orb: 2.5 }, none, caps)).toBe(false);
    expect(orbCapFor('mars', 'venus', caps)).toBe(2);
  });
});

describe('toggleFamily', () => {
  it('returns a new set and leaves the old one alone', () => {
    const on = toggleFamily(none, 'major', true);
    expect(on.has('major')).toBe(true);
    expect(none.size).toBe(0);
    expect(toggleFamily(on, 'major', false).size).toBe(0);
  });
});
