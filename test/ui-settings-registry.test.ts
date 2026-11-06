/**
 * Validity checks for `settings-registry.ts` (#506/#509), per
 * `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` §5.2/§9: the shipped registry itself has no invariant
 * violations, and `validateSettings` actually rejects each forbidden combination the plan
 * names — request-scope persistence, device-scope sync, a staged setting with immediate
 * commit, a person-scope entry that is not stored on the person (#806), and an account-scope setting whose
 * scope, persistence and sync disagree (#1066).
 */
import { describe, expect, it } from 'vitest';
import { ORB_CONTEXT_SOURCE_KEY, ORB_LIBRARY_KEY } from '../src/ui/orb-library-store.js';
import {
  ACCOUNT_SYNC_TRACKED_ELSEWHERE,
  SETTINGS,
  validateSettings,
  type SettingDefinition,
} from '../src/ui/settings-registry.js';

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

  it('registers the default transit-filter profile and the orb library as account scope (guidelines §3.2, #1149)', () => {
    const scopeOf = (key: string) => SETTINGS.find((setting) => setting.key === key)?.scope;
    expect(scopeOf('astraya:transitFilter:<context>')).toBe('account');
    expect(scopeOf('astraya:orbLibrary')).toBe('account');
    expect(scopeOf('astraya:orbContextSource')).toBe('account');
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
    for (const scope of ['application', 'device', 'chart', 'page'] as const) {
      expect(validateSettings([{ ...BASE, scope, synced: false }])).toEqual([]);
    }
    expect(validateSettings([{ ...BASE, scope: 'account', persistence: 'indexeddb-oplog', synced: true }])).toEqual([]);
  });
});

describe('scope, persistence and sync agree (#1066)', () => {
  it('rejects a synced setting that is not stored in the op log', () => {
    const violations = validateSettings([{ ...BASE, scope: 'account', persistence: 'local-storage', synced: true }]);
    expect(violations.some((violation) => violation.includes('op log'))).toBe(true);
  });

  it('rejects an account-scope setting that does not sync', () => {
    const violations = validateSettings([{ ...BASE, scope: 'account', synced: false }]);
    expect(violations.some((violation) => violation.includes('must sync'))).toBe(true);
  });

  it('names the account-scope settings whose sync is owned by #1220, and each is a real unsynced account-scope entry', () => {
    expect(ACCOUNT_SYNC_TRACKED_ELSEWHERE).toEqual({
      'astraya:orbLibrary': '#1220',
      'astraya:orbContextSource': '#1220',
      'astraya:transitFilter:<context>': '#1220',
    });
    for (const key of Object.keys(ACCOUNT_SYNC_TRACKED_ELSEWHERE)) {
      const entry = SETTINGS.find((setting) => setting.key === key);
      expect(entry?.scope, key).toBe('account');
      expect(entry?.synced, key).toBe(false);
    }
  });

  it('keys the orb library entries to the keys the orb library store actually uses (#1149)', () => {
    expect(ORB_LIBRARY_KEY).toBe('astraya:orbLibrary');
    expect(ORB_CONTEXT_SOURCE_KEY).toBe('astraya:orbContextSource');
  });

  it('stores the three account preferences in the op log, synced', () => {
    for (const key of ['astraya:reportLocale', 'astraya:rulershipChoice', 'astraya:defaultCalculationProfile']) {
      const entry = SETTINGS.find((setting) => setting.key === key);
      expect(entry?.scope, key).toBe('account');
      expect(entry?.persistence, key).toBe('indexeddb-oplog');
      expect(entry?.synced, key).toBe(true);
    }
  });

  it('no longer points at #510 for the sync', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/ui/settings-registry.ts', 'utf8')).not.toContain('#510');
  });
});
