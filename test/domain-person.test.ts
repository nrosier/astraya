/** Tests persisted person fields that require strict reader validation. */
import { describe, expect, it } from 'vitest';
import {
  buildPerson,
  PERSON_FIELDS,
  readCustomPoints,
  readOrbProfile,
  readRelocationPlaces,
} from '../src/domain/person.js';

describe('saved relocation places (#559)', () => {
  it('materialises valid named locations from the person register', () => {
    const places = [
      { id: 'sydney', label: ' Sydney, Australia ', latitude: -33.8688, longitude: 151.2093 },
      { id: 'london', label: 'London', latitude: 51.5072, longitude: -0.1276 },
    ];
    const person = buildPerson('p-test', new Map([['relocationPlaces', places]]));

    expect(person.relocationPlaces).toEqual([
      { id: 'sydney', label: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093 },
      { id: 'london', label: 'London', latitude: 51.5072, longitude: -0.1276 },
    ]);
  });

  it('rejects an entire malformed location list rather than accepting plausible partial coordinates', () => {
    expect(
      readRelocationPlaces([
        { id: 'good', label: 'London', latitude: 51.5072, longitude: -0.1276 },
        { id: 'bad', label: 'Not on Earth', latitude: 95, longitude: 0 },
      ]),
    ).toBeUndefined();
    expect(
      readRelocationPlaces([
        { id: 'same', label: 'One', latitude: 0, longitude: 0 },
        { id: 'same', label: 'Two', latitude: 1, longitude: 1 },
      ]),
    ).toBeUndefined();
  });
});

describe('custom formula points (#566)', () => {
  it('materialises valid named formula points from the person register', () => {
    const points = [
      { id: 'fortune-like', name: ' My point ', formula: 'sun + moon - ascendant' },
      { id: 'spirit-like', name: 'Spirit point', formula: 'asc + sun - moon' },
    ];
    const person = buildPerson('p-test', new Map([['customPoints', points]]));

    expect(person.customPoints).toEqual([
      { id: 'fortune-like', name: 'My point', formula: 'sun + moon - ascendant' },
      { id: 'spirit-like', name: 'Spirit point', formula: 'asc + sun - moon' },
    ]);
  });

  it('retains a disabled formula point for later re-enabling', () => {
    const person = buildPerson(
      'p-test',
      new Map([['customPoints', [{ id: 'saved', name: 'Saved', formula: 'sun + moon', enabled: false }]]]),
    );

    expect(person.customPoints).toEqual([{ id: 'saved', name: 'Saved', formula: 'sun + moon', enabled: false }]);
  });

  it('rejects malformed formulas and duplicate names atomically', () => {
    expect(
      readCustomPoints([
        { id: 'good', name: 'Point', formula: 'sun + moon' },
        { id: 'bad', name: 'Other', formula: 'sun * moon' },
      ]),
    ).toBeUndefined();
    expect(
      readCustomPoints([
        { id: 'one', name: 'Point', formula: 'sun + moon' },
        { id: 'two', name: 'point', formula: 'sun - moon' },
      ]),
    ).toBeUndefined();
  });
});

describe('a person’s own orb profile (#590)', () => {
  const profile = {
    name: 'House style',
    basedOn: 'wide-v1',
    revision: 1,
    scalePercent: -10,
    aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } },
    bodyOrbs: { venus: 4, mars: 3 },
  };

  it('is a registered person field, so the sync vocabulary carries it', () => {
    expect(PERSON_FIELDS).toContain('orbProfile');
  });

  it('round-trips a valid profile through the person register', () => {
    const person = buildPerson('p-test', new Map([['orbProfile', profile]]));
    expect(person.orbProfile).toEqual(profile);
  });

  it('reads a malformed stored profile as absent, not as a partial one', () => {
    expect(readOrbProfile({ ...profile, basedOn: 'made-up-v9' })).toBeUndefined();
    const person = buildPerson('p-test', new Map([['orbProfile', { ...profile, scalePercent: 500 }]]));
    expect(person.orbProfile).toBeUndefined();
  });

  it('a record written before this field existed reads with no profile at all', () => {
    expect(buildPerson('p-test', new Map()).orbProfile).toBeUndefined();
  });
});
