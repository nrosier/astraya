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
  parseCalculationSnapshot,
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
