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

const CUSTOM_SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  houseSystem: 'W',
  zodiac: { kind: 'sidereal', ayanamsa: 1 },
  orbScalePercent: -30,
  enabledMinorAspects: ['semisextile', 'quincunx'],
  lilithVariant: 'true',
  nodeVariant: 'true',
  fortuneVisible: true,
  vertexVisible: true,
  chironVisible: false,
  spiritVisible: true,
  midpointsVisible: true,
  dial90Visible: true,
  midpointTreeOrb: 2.5,
  rainbowZodiac: true,
  aspectsToChiron: true,
  aspectsToLilith: true,
  aspectsToLunarNodes: true,
  aspectsToVertex: true,
  aspectsToPartOfFortune: true,
  aspectsToPartOfSpirit: true,
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
    expect(calculationSnapshotIdentity(defaults)).toMatch(/^v1-[0-9a-f]{8}$/);
    expect(calculationSnapshotIdentity(defaults)).toBe(calculationSnapshotIdentity(defaults));
    expect(calculationSnapshotIdentity(custom)).not.toBe(calculationSnapshotIdentity(defaults));
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
    expect(parsed.settings.chironVisible).toBe(DEFAULT_EXTENDED_SETTINGS.chironVisible);
    expect(parsed.settings.enabledMinorAspects).toEqual(DEFAULT_EXTENDED_SETTINGS.enabledMinorAspects);
    expect(parsed.rulership).toBe(DEFAULT_RULERSHIP_CHOICE);
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
