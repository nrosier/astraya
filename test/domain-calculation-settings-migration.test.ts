import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { stageCalculationSettingsMigration } from '../src/domain/calculation-settings-migration.js';
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
