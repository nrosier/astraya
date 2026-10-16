/**
 * The device's named orb profiles (#590): validation as a whole, revisions, the per-context source choice, and
 * that a resolved profile is copied, not referenced. Pure, no ephemeris.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_SOURCE,
  nextRevision,
  orbSettingsFor,
  sourceForContext,
  validateOrbLibrary,
  validateOrbProfileRecord,
  type OrbProfileRecord,
} from '../src/astrology/orb-library.js';

const good: OrbProfileRecord = {
  id: 'house-style',
  name: 'My house style',
  revision: 2,
  scalePercent: -10,
  aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } },
  bodyOrbs: { venus: 4, mars: 3 },
};

describe('validateOrbProfileRecord', () => {
  it('accepts a well-formed profile and rebuilds it from known keys only', () => {
    expect(validateOrbProfileRecord({ ...good, notes: 'x' })).toEqual(good);
  });

  it('drops the whole profile when any part is malformed', () => {
    expect(validateOrbProfileRecord({ ...good, id: 'has space' })).toBeUndefined();
    expect(validateOrbProfileRecord({ ...good, id: 'card' })).toBeUndefined();
    expect(validateOrbProfileRecord({ ...good, name: '   ' })).toBeUndefined();
    expect(validateOrbProfileRecord({ ...good, revision: 0 })).toBeUndefined();
    expect(validateOrbProfileRecord({ ...good, scalePercent: 120 })).toBeUndefined();
    expect(validateOrbProfileRecord({ ...good, bodyOrbs: { venus: 31 } })).toBeUndefined();
    expect(
      validateOrbProfileRecord({ ...good, aspectOrbs: { nonsense: { base: 1, luminaryBonus: 0 } } }),
    ).toBeUndefined();
  });
});

describe('validateOrbLibrary', () => {
  it('keeps the good profiles and drops only the bad ones', () => {
    const library = validateOrbLibrary({ profiles: [good, { ...good, id: 'bad', revision: 0 }] });
    expect(library.profiles.map((p) => p.id)).toEqual(['house-style']);
  });

  it('keeps the first of two profiles with the same id', () => {
    const library = validateOrbLibrary({ profiles: [good, { ...good, name: 'Copy' }] });
    expect(library.profiles).toHaveLength(1);
    expect(library.profiles[0]?.name).toBe('My house style');
  });

  it('reads anything that is not a library as an empty one', () => {
    expect(validateOrbLibrary(null)).toEqual({ profiles: [] });
    expect(validateOrbLibrary({ profiles: 'nope' })).toEqual({ profiles: [] });
  });
});

describe('revisions', () => {
  it('a new profile is revision 1, and each saved edit adds one', () => {
    expect(nextRevision(undefined)).toBe(1);
    expect(nextRevision(good)).toBe(3);
  });
});

describe('sourceForContext', () => {
  const library = { profiles: [good] };

  it('uses the card when nothing was chosen, so an unchanged device is unchanged', () => {
    expect(sourceForContext(library, {}, 'transit')).toBe(CARD_SOURCE);
  });

  it('uses a named profile that exists, and falls back to the card when it does not', () => {
    expect(sourceForContext(library, { synastry: 'house-style' }, 'synastry')).toBe('house-style');
    expect(sourceForContext(library, { synastry: 'deleted-profile' }, 'synastry')).toBe(CARD_SOURCE);
  });
});

describe('orbSettingsFor', () => {
  const card = { scalePercent: 0, aspectOrbs: {}, bodyOrbs: {} };

  it('gives the card’s orbs when the choice is the card', () => {
    expect(orbSettingsFor({ profiles: [good] }, CARD_SOURCE, card)).toEqual(card);
  });

  it('gives a profile’s scale and rules, copied, so editing the library later changes nothing already resolved', () => {
    const library = { profiles: [good] };
    const resolved = orbSettingsFor(library, 'house-style', card);
    expect(resolved).toEqual({ scalePercent: -10, aspectOrbs: good.aspectOrbs, bodyOrbs: good.bodyOrbs });
    expect(resolved.aspectOrbs).not.toBe(good.aspectOrbs);
  });
});

describe('cited presets as a source (#590)', () => {
  it('a cited preset needs no library entry and resolves to its moieties at scale 0', () => {
    expect(sourceForContext({ profiles: [] }, { transit: 'lilly-1647-first-v1' }, 'transit')).toBe(
      'lilly-1647-first-v1',
    );
    const resolved = orbSettingsFor({ profiles: [] }, 'lilly-1647-first-v1', { scalePercent: 25 });
    expect(resolved.scalePercent).toBe(0);
    expect(resolved.bodyOrbs?.saturn).toBe(5);
    expect(resolved.bodyOrbs?.venus).toBe(4);
  });

  it('a profile cannot take a cited preset’s id', () => {
    expect(validateOrbProfileRecord({ ...good, id: 'lilly-1647-first-v1' })).toBeUndefined();
  });
});
