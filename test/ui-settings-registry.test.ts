/**
 * Validity checks for `settings-registry.ts` (#506/#509), per
 * `docs/UI-UX_IMPLEMENTATION_PLAN.md` §5.2/§9: the shipped registry itself has no invariant
 * violations, and `validateSettings` actually rejects each forbidden combination the plan
 * names — request-scope persistence, device-scope sync, a staged setting with immediate
 * commit, and a person-scope entry (person records are inputs, not settings).
 */
import { describe, expect, it } from 'vitest';
import { SETTINGS, validateSettings, type SettingDefinition } from '../src/ui/settings-registry.js';

const BASE: SettingDefinition = {
  key: 'test:key',
  scope: 'device',
  owner: 'test',
  describeDefault: 'test',
  persistence: 'local-storage',
  synced: false,
  editingSurface: 'test',
  commitMode: 'immediate',
  sensitive: false,
  resetTarget: 'test',
};

describe('SETTINGS', () => {
  it('has no invariant violations in the shipped registry', () => {
    expect(validateSettings(SETTINGS)).toEqual([]);
  });

  it('has a unique key per setting', () => {
    const keys = SETTINGS.map((setting) => setting.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('validateSettings', () => {
  it('rejects a request-scope setting that persists', () => {
    const violations = validateSettings([{ ...BASE, scope: 'request', persistence: 'local-storage' }]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('rejects a request-scope setting with a staged commit model', () => {
    const violations = validateSettings([{ ...BASE, scope: 'request', persistence: 'none', commitMode: 'staged' }]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('rejects a device-scope setting claiming cross-device sync', () => {
    const violations = validateSettings([{ ...BASE, scope: 'device', synced: true }]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('rejects a person-scope entry outright — person records are inputs, not settings', () => {
    const violations = validateSettings([{ ...BASE, scope: 'person' }]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('accepts a well-formed setting of every other scope', () => {
    for (const scope of ['application', 'account', 'device', 'chart', 'page'] as const) {
      expect(validateSettings([{ ...BASE, scope, synced: false }])).toEqual([]);
    }
  });
});
