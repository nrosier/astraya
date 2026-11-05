/**
 * Validity checks for `settings-registry.ts` (#506/#509), per
 * `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` §5.2/§9: the shipped registry itself has no invariant
 * violations, and `validateSettings` actually rejects each forbidden combination the plan
 * names — request-scope persistence, device-scope sync, a staged setting with immediate
 * commit, and a person-scope entry that is not stored on the person (#806).
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

  it('rejects a person-scope entry unless it is stored on the person through the op log (#806)', () => {
    expect(validateSettings([{ ...BASE, scope: 'person' }]).length).toBeGreaterThan(0);
    expect(validateSettings([{ ...BASE, scope: 'person', persistence: 'indexeddb-oplog', synced: true }])).toEqual([]);
  });

  it('registers the per-person calculation settings as person scope, and glyph/degree-symbol as device (#806)', () => {
    const scopeOf = (key: string) => SETTINGS.find((setting) => setting.key === key)?.scope;
    expect(scopeOf('person.calculationSettings')).toBe('person');
    expect(scopeOf('person.rulership')).toBe('person');
    expect(scopeOf('astraya:rulershipChoice')).toBe('account');
    expect(scopeOf('astraya:glyphVariants')).toBe('device');
    expect(scopeOf('astraya:showDegreeSymbol')).toBe('device');
  });

  it('registers the default transit-filter profile as account scope (guidelines §3.2, #1149)', () => {
    const scopeOf = (key: string) => SETTINGS.find((setting) => setting.key === key)?.scope;
    expect(scopeOf('astraya:transitFilter:<context>')).toBe('account');
  });

  it('registers lastPersonId and workspaceRailCollapsed as device-local settings (#1165)', () => {
    const find = (key: string) => SETTINGS.find((setting) => setting.key === key);
    for (const key of ['astraya:lastPersonId', 'astraya:workspaceRailCollapsed']) {
      const setting = find(key);
      expect(setting, key).toBeDefined();
      // Scope and lifetime: device-local localStorage, never synced, no commit staging.
      expect(setting?.scope, key).toBe('device');
      expect(setting?.persistence, key).toBe('local-storage');
      expect(setting?.synced, key).toBe(false);
      expect(setting?.commitMode, key).toBe('immediate');
      expect(setting?.sensitive, key).toBe(false);
      expect(setting?.resetTarget, key).toMatch(/^This device default/);
    }
  });

  it('records the default of lastPersonId (unset) and workspaceRailCollapsed (expanded) (#1165)', () => {
    const find = (key: string) => SETTINGS.find((setting) => setting.key === key);
    expect(find('astraya:lastPersonId')?.describeDefault).toBe('unset (no person remembered yet)');
    expect(find('astraya:workspaceRailCollapsed')?.describeDefault).toBe("'false' (rail expanded)");
  });

  it('accepts the shipped lastPersonId and workspaceRailCollapsed entries (#1165)', () => {
    const picked = SETTINGS.filter((setting) =>
      ['astraya:lastPersonId', 'astraya:workspaceRailCollapsed'].includes(setting.key),
    );
    expect(picked).toHaveLength(2);
    expect(validateSettings(picked)).toEqual([]);
  });

  it('accepts a well-formed setting of every other scope', () => {
    for (const scope of ['application', 'account', 'device', 'chart', 'page'] as const) {
      expect(validateSettings([{ ...BASE, scope, synced: false }])).toEqual([]);
    }
  });
});
