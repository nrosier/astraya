import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import {
  stageCalculationSettingsMigration,
  stageRulershipMigration,
} from '../src/domain/calculation-settings-migration.js';
import { buildPerson, serializeCalculationSettings } from '../src/domain/person.js';

const custom = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K', orbScalePercent: -30 };

describe('stageCalculationSettingsMigration (#806)', () => {
  it('writes the device settings onto people without their own, and skips those who have a register', () => {
    const bare = buildPerson('p-bare', new Map());
    const own = buildPerson(
      'p-own',
      new Map([['calculationSettings', serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS)]]),
    );
    const unreadable = buildPerson('p-bad', new Map([['calculationSettings', { version: 99, settings: {} }]]));
    const mutations = stageCalculationSettingsMigration([bare, own, unreadable], custom);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ entity: 'person', entityId: 'p-bare', field: 'calculationSettings' });
  });
});

describe('stageRulershipMigration (#806)', () => {
  it('stamps the given ruler choice as a plain string on a person with no rulership register', () => {
    const person = buildPerson('p1', new Map());
    expect(stageRulershipMigration([person], 'traditional')).toEqual([
      { entity: 'person', entityId: 'p1', field: 'rulership', value: 'traditional' },
    ]);
  });

  it('skips a person who already has a rulership, and one flagged unreadable', () => {
    const own = buildPerson('p1', new Map([['rulership', 'both']]));
    const unreadable = buildPerson('p2', new Map([['rulership', 'nope']]));
    const unreadableSettings = buildPerson('p3', new Map([['calculationSettings', 'x']]));
    expect(stageRulershipMigration([own, unreadable, unreadableSettings], 'modern')).toEqual([]);
  });

  it('skips a person the caller knows has a register', () => {
    const person = buildPerson('p1', new Map());
    expect(stageRulershipMigration([person], 'modern', (id) => id === 'p1')).toEqual([]);
  });

  it('is independent of the settings move: a person with settings but no rulership is still staged', () => {
    const person = buildPerson('p1', new Map([['calculationSettings', serializeCalculationSettings(custom)]]));
    expect(stageCalculationSettingsMigration([person], custom)).toEqual([]);
    expect(stageRulershipMigration([person], 'modern')).toHaveLength(1);
  });
});
