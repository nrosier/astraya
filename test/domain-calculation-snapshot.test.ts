/**
 * Unit tests for `CalculationSnapshot`'s build/parse round-trip (#541) — pure, no engine needed.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotIdentity,
  calculationSnapshotToJson,
  CURRENT_SNAPSHOT_VERSION,
  decodeCalculationSnapshot,
  decodeStrictExtendedSettings,
  parseCalculationSnapshot,
  SnapshotDecodeError,
} from '../src/domain/calculation-snapshot.js';
import { decodeChartShareLink, encodeChartShareLink } from '../src/domain/chart-share.js';

const CUSTOM_SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  houseSystem: 'W',
  zodiac: { kind: 'sidereal', ayanamsa: 1 },
  orbScalePercent: -30,
  enabledMinorAspects: ['semisextile', 'quincunx'],
  lilithVariant: 'true',
  nodeVariant: 'true',
  objectPolicies: {
    ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
    chiron: { visible: false, aspectParticipant: true },
    osculatingLilith: { visible: true, aspectParticipant: true },
    trueNode: { visible: true, aspectParticipant: true },
    vertex: { visible: true, aspectParticipant: true },
    partOfFortune: { visible: true, aspectParticipant: true },
    partOfSpirit: { visible: true, aspectParticipant: true },
  },
  midpointsVisible: true,
  dial90Visible: true,
  midpointTreeOrb: 2.5,
  rainbowZodiac: true,
};

describe('buildCalculationSnapshot / parseCalculationSnapshot round-trip (#541)', () => {
  it('round-trips a fully customized snapshot through JSON exactly', () => {
    const snapshot = buildCalculationSnapshot(CUSTOM_SETTINGS, 'traditional');
    const json = calculationSnapshotToJson(snapshot);
    const parsed = parseCalculationSnapshot(json);
    expect(parsed).toEqual(snapshot);
  });

  it('round-trips the all-defaults snapshot too', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    const parsed = parseCalculationSnapshot(calculationSnapshotToJson(snapshot));
    expect(parsed).toEqual(snapshot);
  });

  it('tags the current version', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern');
    expect(snapshot.version).toBe(CURRENT_SNAPSHOT_VERSION);
    expect(calculationSnapshotToJson(snapshot).version).toBe(CURRENT_SNAPSHOT_VERSION);
  });

  it('has a stable, settings-sensitive provenance identity', () => {
    const defaults = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern');
    const custom = buildCalculationSnapshot(CUSTOM_SETTINGS, 'traditional');
    expect(calculationSnapshotIdentity(defaults)).toMatch(
      new RegExp(`^v${String(CURRENT_SNAPSHOT_VERSION)}-[0-9a-f]{8}$`),
    );
    expect(calculationSnapshotIdentity(defaults)).toBe(calculationSnapshotIdentity(defaults));
    expect(calculationSnapshotIdentity(custom)).not.toBe(calculationSnapshotIdentity(defaults));
  });
});

describe('custom points in the snapshot (#582)', () => {
  const POINTS = [
    { id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' },
    { id: 'off', name: 'Switched off', formula: 'sun + moon', enabled: false },
  ];

  it('round-trips custom points, including a disabled one, through JSON exactly', () => {
    const snapshot = buildCalculationSnapshot(CUSTOM_SETTINGS, 'traditional', POINTS);
    expect(parseCalculationSnapshot(calculationSnapshotToJson(snapshot))).toEqual(snapshot);
  });

  it('round-trips custom points through a real share link', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern', POINTS);
    const query = encodeChartShareLink({
      moment: {
        civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
        coordinates: { latitude: 1, longitude: 2 },
      },
      settings: calculationSnapshotToJson(snapshot),
      housesKnown: true,
    });
    const decoded = decodeChartShareLink(new URLSearchParams(query.toString()));
    expect(parseCalculationSnapshot(decoded.settings).customPoints).toEqual(POINTS);
  });

  it('reads a v1 snapshot, which could not carry custom points, as having none', () => {
    const v1 = {
      version: 1,
      settings: calculationSnapshotToJson(buildCalculationSnapshot(CUSTOM_SETTINGS, 'traditional')).settings,
      rulership: 'traditional',
    };
    const parsed = parseCalculationSnapshot(v1);
    expect(parsed.customPoints).toEqual([]);
    expect(parsed.settings).toEqual(CUSTOM_SETTINGS);
  });

  it('drops malformed definitions instead of guessing at them', () => {
    const parsed = parseCalculationSnapshot({
      customPoints: [
        POINTS[0],
        { id: 7, name: 'bad id', formula: 'sun' },
        { id: 'no-formula', name: 'x' },
        'not an object',
        { id: 'odd-enabled', name: 'y', formula: 'moon', enabled: 'yes' },
      ],
    });
    expect(parsed.customPoints).toEqual([POINTS[0], { id: 'odd-enabled', name: 'y', formula: 'moon' }]);
  });

  it('makes the provenance identity sensitive to custom points', () => {
    const without = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern');
    const withPoints = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern', POINTS);
    expect(calculationSnapshotIdentity(withPoints)).not.toBe(calculationSnapshotIdentity(without));
  });
});

describe('parseCalculationSnapshot defends against untrusted input (#541)', () => {
  it('falls back to full defaults for non-object input', () => {
    for (const bad of [null, undefined, 42, 'nope', [], true]) {
      expect(parseCalculationSnapshot(bad)).toEqual(
        buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
      );
    }
  });

  it('fills each missing field from its own default rather than rejecting the whole object', () => {
    const parsed = parseCalculationSnapshot({ settings: { houseSystem: 'W' }, rulership: 'traditional' });
    expect(parsed.settings.houseSystem).toBe('W');
    expect(parsed.settings.zodiac).toEqual(DEFAULT_EXTENDED_SETTINGS.zodiac);
    expect(parsed.settings.orbScalePercent).toBe(DEFAULT_EXTENDED_SETTINGS.orbScalePercent);
    expect(parsed.rulership).toBe('traditional');
  });

  it('ignores a wrong-typed field rather than propagating it as a lie', () => {
    const parsed = parseCalculationSnapshot({
      settings: { houseSystem: 42, chironVisible: 'yes', enabledMinorAspects: 'not-an-array' },
      rulership: 'not-a-real-choice',
    });
    expect(parsed.settings.houseSystem).toBe(DEFAULT_EXTENDED_SETTINGS.houseSystem);
    // No `objectPolicies` field at all here, so this falls through to the legacy-field migration
    // (#585); `chironVisible: 'yes'` is not a real boolean, so that migration itself falls back
    // to the default for Chiron's own `visible`, same as the pre-#585 behavior this replaces.
    expect(parsed.settings.objectPolicies.chiron.visible).toBe(DEFAULT_EXTENDED_SETTINGS.objectPolicies.chiron.visible);
    expect(parsed.settings.enabledMinorAspects).toEqual(DEFAULT_EXTENDED_SETTINGS.enabledMinorAspects);
    expect(parsed.rulership).toBe(DEFAULT_RULERSHIP_CHOICE);
  });

  it('migrates a pre-#585 settings bag (no objectPolicies field) to the identical effective policy', () => {
    const legacy = {
      fortuneVisible: true,
      vertexVisible: false,
      chironVisible: false,
      spiritVisible: true,
      modernPointVisibility: { meanNode: true, trueNode: false, ceres: true },
      aspectsToChiron: true,
      aspectsToLilith: false,
      aspectsToLunarNodes: true,
      aspectsToVertex: false,
      aspectsToPartOfFortune: true,
      aspectsToPartOfSpirit: false,
    };
    const parsed = parseCalculationSnapshot({ settings: legacy });
    expect(parsed.settings.objectPolicies.partOfFortune).toEqual({ visible: true, aspectParticipant: true });
    expect(parsed.settings.objectPolicies.vertex).toEqual({ visible: false, aspectParticipant: false });
    expect(parsed.settings.objectPolicies.chiron).toEqual({ visible: false, aspectParticipant: true });
    expect(parsed.settings.objectPolicies.partOfSpirit).toEqual({ visible: true, aspectParticipant: false });
    expect(parsed.settings.objectPolicies.meanNode).toEqual({ visible: true, aspectParticipant: true });
    expect(parsed.settings.objectPolicies.trueNode).toEqual({ visible: false, aspectParticipant: true });
    expect(parsed.settings.objectPolicies.ceres).toEqual({ visible: true, aspectParticipant: true });
    // Planets had no legacy field of either kind — always defaulted visible and participating.
    expect(parsed.settings.objectPolicies.sun).toEqual({ visible: true, aspectParticipant: true });
    // aspectsToLilith: false collectively covers all three Lilith variants — none named in
    // modernPointVisibility, so visibility falls to each one's own default (false).
    expect(parsed.settings.objectPolicies.meanLilith).toEqual({ visible: false, aspectParticipant: false });
    expect(parsed.settings.objectPolicies.osculatingLilith).toEqual({ visible: false, aspectParticipant: false });
    expect(parsed.settings.objectPolicies.interpolatedLilith).toEqual({ visible: false, aspectParticipant: false });
  });

  it('ignores legacy fields entirely once objectPolicies is present, even when they disagree', () => {
    const parsed = parseCalculationSnapshot({
      settings: {
        objectPolicies: {
          ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
          chiron: { visible: true, aspectParticipant: true },
        },
        // Deliberately contradicts objectPolicies.chiron above, and partOfFortune's default —
        // a half-migrated writer must never win once the new field exists.
        chironVisible: false,
        aspectsToChiron: false,
        fortuneVisible: true,
      },
    });
    expect(parsed.settings.objectPolicies.chiron).toEqual({ visible: true, aspectParticipant: true });
    expect(parsed.settings.objectPolicies.partOfFortune).toEqual(
      DEFAULT_EXTENDED_SETTINGS.objectPolicies.partOfFortune,
    );
  });

  it('drops non-string entries from an enabledMinorAspects array instead of rejecting the whole snapshot', () => {
    const parsed = parseCalculationSnapshot({ settings: { enabledMinorAspects: ['sextile', 42, null, 'trine'] } });
    expect(parsed.settings.enabledMinorAspects).toEqual(['sextile', 'trine']);
  });

  it('accepts a sidereal zodiac with a numeric ayanamsa but rejects a malformed one', () => {
    const good = parseCalculationSnapshot({ settings: { zodiac: { kind: 'sidereal', ayanamsa: 7 } } });
    expect(good.settings.zodiac).toEqual({ kind: 'sidereal', ayanamsa: 7 });
    const bad = parseCalculationSnapshot({ settings: { zodiac: { kind: 'sidereal', ayanamsa: 'lahiri' } } });
    expect(bad.settings.zodiac).toEqual(DEFAULT_EXTENDED_SETTINGS.zodiac);
  });

  it('an empty settings bag — the historical "no settings carried at all" case — resolves to the full app defaults', () => {
    expect(parseCalculationSnapshot({})).toEqual(
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
    );
  });
});

describe('user-defined orb rules in the snapshot (#590)', () => {
  it('round-trips aspect and body rules through JSON exactly', () => {
    const withRules: ExtendedSettings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      orbRules: { aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } }, bodyOrbs: { venus: 4, mars: 3 } },
    };
    const snapshot = buildCalculationSnapshot(withRules, DEFAULT_RULERSHIP_CHOICE);
    const parsed = parseCalculationSnapshot(calculationSnapshotToJson(snapshot));
    expect(parsed.settings.orbRules).toEqual(withRules.orbRules);
  });

  it('a snapshot written before this field existed parses with no rules at all', () => {
    const parsed = parseCalculationSnapshot({ settings: { orbScalePercent: -10 } });
    expect(parsed.settings.orbRules).toBeUndefined();
    expect(parsed.settings.orbScalePercent).toBe(-10);
  });

  it('a malformed rules bag is dropped whole, not applied in part', () => {
    const parsed = parseCalculationSnapshot({
      settings: { orbRules: { aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } }, bodyOrbs: { notABody: 2 } } },
    });
    expect(parsed.settings.orbRules).toBeUndefined();
  });

  it('empty rule sets are normalized away, so an empty bag equals no bag', () => {
    const parsed = parseCalculationSnapshot({ settings: { orbRules: { aspectOrbs: {}, bodyOrbs: {} } } });
    expect(parsed.settings.orbRules).toBeUndefined();
  });
});

describe('decodeCalculationSnapshot refuses what it would have to guess at (#717)', () => {
  const STRICT_POINTS = [{ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' }];
  const sent = calculationSnapshotToJson(buildCalculationSnapshot(CUSTOM_SETTINGS, 'traditional', STRICT_POINTS));

  it('round-trips a current snapshot exactly', () => {
    expect(decodeCalculationSnapshot(sent)).toEqual(
      buildCalculationSnapshot(CUSTOM_SETTINGS, 'traditional', STRICT_POINTS),
    );
  });

  it.each([999, CURRENT_SNAPSHOT_VERSION + 1])(
    'refuses a newer snapshot version (%s) instead of reading it as current',
    (version) => {
      expect(() => decodeCalculationSnapshot({ ...sent, version })).toThrow(SnapshotDecodeError);
      try {
        decodeCalculationSnapshot({ ...sent, version });
      } catch (error) {
        expect(error).toMatchObject({ code: 'unsupported-version' });
      }
    },
  );

  it.each([0, -1, 1.5, '3', null, NaN])('refuses a malformed version (%s)', (version) => {
    expect(() => decodeCalculationSnapshot({ ...sent, version })).toThrow(SnapshotDecodeError);
  });

  it.each([
    ['houseSystem', { houseSystem: 'not-a-house' }],
    ['zodiac', { zodiac: { kind: 'sidereal', ayanamsa: 999999 } }],
    ['zodiac', { zodiac: { kind: 'sidereal', ayanamsa: Number.NaN } }],
    ['zodiac', { zodiac: { kind: 'sidereal', ayanamsa: -1 } }],
    ['zodiac', { zodiac: { kind: 'nonsense' } }],
    ['orbScalePercent', { orbScalePercent: 100000 }],
    ['orbScalePercent', { orbScalePercent: -100 }],
    ['orbScalePercent', { orbScalePercent: Number.POSITIVE_INFINITY }],
    ['orbScalePercent', { orbScalePercent: '10' }],
    ['boundsScheme', { boundsScheme: 'invented' }],
    ['lilithVariant', { lilithVariant: 'osculating' }],
    ['nodeVariant', { nodeVariant: 'south' }],
    ['enabledMinorAspects', { enabledMinorAspects: ['sextile', 'not-an-aspect'] }],
    ['enabledMinorAspects', { enabledMinorAspects: 'sextile' }],
    ['orbRules', { orbRules: { aspectOrbs: {}, bodyOrbs: { notABody: 2 } } }],
  ])('refuses an unregistered or out-of-range %s', (field, patch) => {
    const settings = { ...(sent.settings as Record<string, unknown>), ...patch };
    expect(() => decodeCalculationSnapshot({ ...sent, settings })).toThrow(SnapshotDecodeError);
    try {
      decodeCalculationSnapshot({ ...sent, settings });
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid-field' });
      expect((error as Error).message).toContain(field);
    }
  });

  it('refuses an unknown rulership choice', () => {
    expect(() => decodeCalculationSnapshot({ ...sent, rulership: 'bogus' })).toThrow(SnapshotDecodeError);
  });

  it('still migrates v1, v2 and unversioned payloads deterministically', () => {
    const settings = (sent as { settings: unknown }).settings;
    for (const version of [1, 2]) {
      const migrated = decodeCalculationSnapshot({ version, settings, rulership: 'traditional' });
      expect(migrated.version).toBe(CURRENT_SNAPSHOT_VERSION);
      expect(migrated.settings).toEqual(CUSTOM_SETTINGS);
      expect(migrated.customPoints).toEqual([]);
    }
    expect(decodeCalculationSnapshot({ settings, rulership: 'traditional' }).settings).toEqual(CUSTOM_SETTINGS);
  });

  it('still reads a pre-#585 settings bag and the historical empty bag', () => {
    expect(
      decodeCalculationSnapshot({ settings: { chironVisible: false, aspectsToChiron: true } }).settings.objectPolicies
        .chiron,
    ).toEqual({
      visible: false,
      aspectParticipant: true,
    });
    for (const empty of [{}, undefined, null]) {
      expect(decodeCalculationSnapshot(empty)).toEqual(
        buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
      );
    }
  });

  it('accepts the orb-scale slider’s own extremes', () => {
    for (const orbScalePercent of [-90, 0, 90]) {
      const settings = { ...(sent.settings as Record<string, unknown>), orbScalePercent };
      expect(decodeCalculationSnapshot({ ...sent, settings }).settings.orbScalePercent).toBe(orbScalePercent);
    }
  });
});

describe('parseCalculationSnapshot (a device’s own saved default) also bounds numbers (#717)', () => {
  it('repairs a non-finite, out-of-range or unregistered numeric to the default instead of passing it to the engine', () => {
    for (const orbScalePercent of [Number.NaN, Number.POSITIVE_INFINITY, 100000, -500]) {
      expect(parseCalculationSnapshot({ settings: { orbScalePercent } }).settings.orbScalePercent).toBe(
        DEFAULT_EXTENDED_SETTINGS.orbScalePercent,
      );
    }
    const bad = parseCalculationSnapshot({ settings: { zodiac: { kind: 'sidereal', ayanamsa: 999999 } } });
    expect(bad.settings.zodiac).toEqual(DEFAULT_EXTENDED_SETTINGS.zodiac);
  });
});

describe('the station window and motion score in the snapshot (#724)', () => {
  it('round-trips both settings through JSON exactly', () => {
    const withBoth: ExtendedSettings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      stationWindow: { k: 0.2 },
      motionScore: true,
    };
    const snapshot = buildCalculationSnapshot(withBoth, DEFAULT_RULERSHIP_CHOICE);
    expect(parseCalculationSnapshot(calculationSnapshotToJson(snapshot))).toEqual(snapshot);
    expect(decodeCalculationSnapshot(calculationSnapshotToJson(snapshot))).toEqual(snapshot);
  });

  it('keeps the version at 3, since both fields are optional', () => {
    expect(CURRENT_SNAPSHOT_VERSION).toBe(3);
  });

  it('a snapshot written before these fields existed parses with both off, and round-trips unchanged', () => {
    const old = { version: 3, settings: { orbScalePercent: -10 }, rulership: 'modern' };
    const parsed = parseCalculationSnapshot(old);
    expect(parsed.settings.stationWindow).toBeUndefined();
    expect(parsed.settings.motionScore).toBeUndefined();
    const again = calculationSnapshotToJson(parsed);
    expect(JSON.stringify(again.settings)).not.toContain('stationWindow');
    expect(JSON.stringify(again.settings)).not.toContain('motionScore');
  });

  it('the strict decoder still accepts an old snapshot with neither field', () => {
    expect(() => decodeCalculationSnapshot({ version: 3, settings: { orbScalePercent: -10 } })).not.toThrow();
    expect(decodeCalculationSnapshot({ version: 2, settings: {} }).settings.stationWindow).toBeUndefined();
  });

  it('the lenient parser drops a bad k rather than applying it, leaving the window off', () => {
    for (const k of [0, -0.05, 1.5, 'big', null]) {
      const parsed = parseCalculationSnapshot({ settings: { stationWindow: { k } } });
      expect(parsed.settings.stationWindow, JSON.stringify(k)).toBeUndefined();
    }
  });

  it('the strict decoder refuses a bad k with an invalid-field error naming the setting', () => {
    for (const stationWindow of [{ k: 0 }, { k: 2 }, { k: Number.NaN }, { k: '0.05' }, 'on', {}]) {
      expect(() => decodeCalculationSnapshot({ version: 3, settings: { stationWindow } })).toThrow(SnapshotDecodeError);
      try {
        decodeCalculationSnapshot({ version: 3, settings: { stationWindow } });
      } catch (error) {
        expect(error).toBeInstanceOf(SnapshotDecodeError);
        if (error instanceof SnapshotDecodeError) {
          expect(error.code).toBe('invalid-field');
          expect(error.message).toContain('stationWindow');
        }
      }
    }
  });

  it('the strict decoder accepts a valid k at each boundary the panel can produce', () => {
    for (const k of [0.01, 0.05, 1]) {
      expect(
        decodeCalculationSnapshot({ version: 3, settings: { stationWindow: { k } } }).settings.stationWindow,
      ).toEqual({
        k,
      });
    }
  });

  it('the strict decoder refuses a non-boolean motionScore', () => {
    expect(() => decodeCalculationSnapshot({ version: 3, settings: { motionScore: 'yes' } })).toThrow(
      SnapshotDecodeError,
    );
  });

  it('a motionScore of false reads back as off, the same as no field at all', () => {
    const parsed = parseCalculationSnapshot({ settings: { motionScore: false } });
    expect(parsed.settings.motionScore).toBeUndefined();
    expect(
      decodeCalculationSnapshot({ version: 3, settings: { motionScore: false } }).settings.motionScore,
    ).toBeUndefined();
  });

  it('the provenance identity changes when the window or the score changes', () => {
    const base = calculationSnapshotIdentity(buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern'));
    const windowed = calculationSnapshotIdentity(
      buildCalculationSnapshot({ ...DEFAULT_EXTENDED_SETTINGS, stationWindow: { k: 0.05 } }, 'modern'),
    );
    const scored = calculationSnapshotIdentity(
      buildCalculationSnapshot({ ...DEFAULT_EXTENDED_SETTINGS, motionScore: true }, 'modern'),
    );
    expect(windowed).not.toBe(base);
    expect(scored).not.toBe(base);
  });
});

describe('decodeStrictExtendedSettings never fills a register with defaults (#806)', () => {
  const full = JSON.parse(JSON.stringify(CUSTOM_SETTINGS)) as Record<string, unknown>;

  it('reads a complete, valid settings bag', () => {
    expect(decodeStrictExtendedSettings(full, true)).toEqual(CUSTOM_SETTINGS);
  });

  it.each([
    ['garbage objectPolicies', { objectPolicies: 'garbage' }],
    ['a policy with a non-boolean flag', { objectPolicies: { sun: { visible: 1, aspectParticipant: true } } }],
    ['an out-of-range antisciaMaxOrb', { antisciaMaxOrb: -5 }],
    ['a non-boolean declinationVisible', { declinationVisible: 'yes' }],
  ])('refuses %s', (_name, bad) => {
    expect(() => decodeStrictExtendedSettings({ ...full, ...bad }, true)).toThrow(SnapshotDecodeError);
    expect(() => decodeStrictExtendedSettings({ ...full, ...bad }, false)).toThrow(SnapshotDecodeError);
  });

  it('refuses a missing field only when every field is required', () => {
    const incomplete = { ...full };
    delete incomplete.declinationVisible;
    expect(() => decodeStrictExtendedSettings(incomplete, true)).toThrow(SnapshotDecodeError);
    expect(() => decodeStrictExtendedSettings(incomplete, false)).not.toThrow();
  });

  it('refuses an object policy bag that omits an object when every field is required', () => {
    expect(() => decodeStrictExtendedSettings({ ...full, objectPolicies: {} }, true)).toThrow(SnapshotDecodeError);
  });
});

describe('the keys a person register must carry (#806 compatibility pin)', () => {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_EXTENDED_SETTINGS)) as Record<string, unknown>;

  it('pins exactly which settings keys requireAll demands, so adding a required key fails here first', () => {
    const required = Object.keys(defaults).filter((key) => {
      const without = Object.fromEntries(Object.entries(defaults).filter(([name]) => name !== key));
      try {
        decodeStrictExtendedSettings(without, true);
        return false;
      } catch (error) {
        if (error instanceof SnapshotDecodeError) return true;
        throw error;
      }
    });
    expect(required.sort()).toEqual(
      [
        'antisciaMaxOrb',
        'antisciaVisible',
        'boundsScheme',
        'declinationMaxOrb',
        'declinationVisible',
        'dial90Visible',
        'enabledMinorAspects',
        'houseSystem',
        'lilithVariant',
        'midpointTreeOrb',
        'midpointsVisible',
        'nodeVariant',
        'objectPolicies',
        'orbScalePercent',
        'rainbowZodiac',
        'zodiac',
      ].sort(),
    );
  });

  it('does not require a rulership key inside the settings bag', () => {
    expect(() => decodeStrictExtendedSettings(defaults, true)).not.toThrow();
    expect('rulership' in defaults).toBe(false);
  });
});
