/** Tests persisted person fields that require strict reader validation. */
import { describe, expect, it } from 'vitest';
import { buildPerson, readCustomPoints, readRelocationPlaces } from '../src/domain/person.js';

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
