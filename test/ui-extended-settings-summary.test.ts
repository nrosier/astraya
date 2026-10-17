/** The summary of what an Extended-settings draft changes from the defaults (#442). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { changedSettings, sameSettings } from '../src/ui/extended-settings-summary.js';

describe('changedSettings', () => {
  it('is empty for the defaults and lists exactly what differs', () => {
    expect(changedSettings(DEFAULT_EXTENDED_SETTINGS)).toEqual([]);
    expect(
      changedSettings({
        ...DEFAULT_EXTENDED_SETTINGS,
        houseSystem: 'W',
        orbScalePercent: -10,
        enabledMinorAspects: ['quintile'],
        objectPolicies: {
          ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
          chiron: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.chiron, visible: false },
        },
        lilithVariant: 'true',
      }),
    ).toEqual(['houseSystem', 'orbScale', 'minorAspects', 'objectPolicies', 'lilith']);
  });

  it('compares two settings field by field', () => {
    expect(sameSettings(DEFAULT_EXTENDED_SETTINGS, { ...DEFAULT_EXTENDED_SETTINGS })).toBe(true);
    expect(
      sameSettings(DEFAULT_EXTENDED_SETTINGS, {
        ...DEFAULT_EXTENDED_SETTINGS,
        objectPolicies: {
          ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
          vertex: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.vertex, visible: true },
        },
      }),
    ).toBe(false);
  });

  it('names the practitioner’s own orb rules once any are set (#590)', () => {
    expect(changedSettings({ ...DEFAULT_EXTENDED_SETTINGS, orbRules: { bodyOrbs: { venus: 4 } } })).toEqual([
      'orbRules',
    ]);
  });
});
