/** Tests persisted person fields that require strict reader validation. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import {
  buildPerson,
  PERSON_FIELDS,
  readCustomPoints,
  readRelocationPlaces,
  serializeCalculationSettings,
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

describe('the person record and the retired per-person orb profile (#590)', () => {
  it('ignores an orb profile stored by an earlier build: orbs are the device’s, not the person’s', () => {
    const person = buildPerson('p-test', new Map([['orbProfile', { name: 'old', basedOn: 'standard-v1' }]]));
    expect(PERSON_FIELDS).not.toContain('orbProfile');
    expect('orbProfile' in person).toBe(false);
  });
});

describe('the per-person calculationSettings register (#806)', () => {
  const settings = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K', orbScalePercent: -30 };

  it('reads a valid register through the strict snapshot decoder', () => {
    const person = buildPerson('p', new Map([['calculationSettings', serializeCalculationSettings(settings)]]));
    expect(PERSON_FIELDS).toContain('calculationSettings');
    expect(person.calculationSettings).toMatchObject({ houseSystem: 'K', orbScalePercent: -30 });
    expect(person.calculationSettingsUnreadable).toBeUndefined();
  });

  it('has neither settings nor the flag when nothing was ever saved', () => {
    const person = buildPerson('p', new Map());
    expect('calculationSettings' in person).toBe(false);
    expect('calculationSettingsUnreadable' in person).toBe(false);
  });

  it('flags a newer-version or invalid register as unreadable instead of filling defaults', () => {
    const newer = buildPerson('p', new Map([['calculationSettings', { version: 99, settings }]]));
    const invalid = buildPerson(
      'p',
      new Map([['calculationSettings', { version: 3, settings: { houseSystem: 'nope' } }]]),
    );
    const junk = buildPerson('p', new Map([['calculationSettings', 'x']]));
    for (const person of [newer, invalid, junk]) {
      expect(person.calculationSettings).toBeUndefined();
      expect(person.calculationSettingsUnreadable).toBe(true);
    }
  });

  it.each([
    ['garbage objectPolicies', { objectPolicies: 'garbage' }],
    [
      'a policy with a non-boolean flag',
      {
        objectPolicies: {
          ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
          sun: { visible: 'yes', aspectParticipant: true },
        },
      },
    ],
    ['an out-of-range antisciaMaxOrb', { antisciaMaxOrb: -5 }],
    ['a non-boolean declinationVisible', { declinationVisible: 'yes' }],
  ])('flags a register with %s as unreadable, never filled with defaults', (_name, bad) => {
    const person = buildPerson(
      'p',
      new Map([['calculationSettings', { version: 3, settings: { ...DEFAULT_EXTENDED_SETTINGS, ...bad } }]]),
    );
    expect(person.calculationSettings).toBeUndefined();
    expect(person.calculationSettingsUnreadable).toBe(true);
  });

  it('flags a register that is missing a required field as unreadable', () => {
    const incomplete: Record<string, unknown> = { ...DEFAULT_EXTENDED_SETTINGS };
    delete incomplete.declinationVisible;
    const person = buildPerson('p', new Map([['calculationSettings', { version: 3, settings: incomplete }]]));
    expect(person.calculationSettingsUnreadable).toBe(true);
  });
});
