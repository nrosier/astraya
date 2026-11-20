import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotIdentity,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  parseCalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { serializeCalculationSettings } from '../src/domain/person.js';

// The origin/main (7a6410a5) serialized default register, measured by serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS).
const ORIGIN_MAIN_DEFAULT_REGISTER =
  '{"version":3,"settings":{"houseSystem":"P","zodiac":{"kind":"tropical"},"orbScalePercent":0,"boundsScheme":"egyptian","enabledMinorAspects":[],"lilithVariant":"mean","nodeVariant":"mean","objectPolicies":{"sun":{"visible":true,"aspectParticipant":true},"moon":{"visible":true,"aspectParticipant":true},"mercury":{"visible":true,"aspectParticipant":true},"venus":{"visible":true,"aspectParticipant":true},"mars":{"visible":true,"aspectParticipant":true},"jupiter":{"visible":true,"aspectParticipant":true},"saturn":{"visible":true,"aspectParticipant":true},"uranus":{"visible":true,"aspectParticipant":true},"neptune":{"visible":true,"aspectParticipant":true},"pluto":{"visible":true,"aspectParticipant":true},"meanNode":{"visible":false,"aspectParticipant":false},"trueNode":{"visible":false,"aspectParticipant":false},"meanLilith":{"visible":false,"aspectParticipant":false},"osculatingLilith":{"visible":false,"aspectParticipant":false},"interpolatedLilith":{"visible":false,"aspectParticipant":false},"chiron":{"visible":true,"aspectParticipant":false},"pholus":{"visible":false,"aspectParticipant":false},"ceres":{"visible":false,"aspectParticipant":true},"pallas":{"visible":false,"aspectParticipant":true},"juno":{"visible":false,"aspectParticipant":true},"vesta":{"visible":false,"aspectParticipant":true},"vertex":{"visible":false,"aspectParticipant":false},"partOfFortune":{"visible":false,"aspectParticipant":false},"partOfSpirit":{"visible":false,"aspectParticipant":false}},"midpointsVisible":false,"antisciaVisible":false,"antisciaMaxOrb":1,"declinationVisible":false,"declinationMaxOrb":1,"dial90Visible":false,"midpointTreeOrb":1,"rainbowZodiac":false}}';

describe('the Fortune formula leaves the default snapshot and register unchanged (#1794)', () => {
  // Measured on origin/main (7a6410a5), not copied from a review: a default snapshot's identity and
  // serialized register must match what the app produced before the Fortune formula field existed.
  it('the default snapshot identity equals the origin/main value v4-85b6b5ff', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    expect(calculationSnapshotIdentity(snapshot)).toBe('v4-85b6b5ff');
  });

  it('a default-settings register JSON carries no fortuneFormula and equals the origin/main register', () => {
    const json = serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS);
    expect(JSON.stringify(json)).not.toContain('fortuneFormula');
    expect(JSON.stringify(json)).toBe(ORIGIN_MAIN_DEFAULT_REGISTER);
  });

  it('a default register omits the field, so it serializes as it did before the field existed', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    const json = calculationSnapshotToJson(snapshot);
    expect(JSON.stringify(json.settings)).not.toContain('fortuneFormula');
  });

  it("a 'same-day-and-night' register writes the value and reads it back", () => {
    const settings: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'same-day-and-night' };
    const snapshot = buildCalculationSnapshot(settings, DEFAULT_RULERSHIP_CHOICE);
    const json = calculationSnapshotToJson(snapshot);
    expect(json.settings).toMatchObject({ fortuneFormula: 'same-day-and-night' });
    const parsed = parseCalculationSnapshot(json);
    expect(parsed.settings.fortuneFormula).toBe('same-day-and-night');
    expect(parsed).toEqual(snapshot);
  });

  it("an old register without the field reads as the default (absent, so 'sect-reversed' when used), and the strict decoder accepts it", () => {
    const old = { version: 3, settings: { orbScalePercent: -10 }, rulership: 'modern' };
    expect(parseCalculationSnapshot(old).settings.fortuneFormula).toBeUndefined();
    expect(() => decodeCalculationSnapshot(old)).not.toThrow();
    expect(decodeCalculationSnapshot(old).settings.fortuneFormula).toBeUndefined();
  });

  it('an unknown value is still refused by the strict decoder', () => {
    const bad = { version: 4, settings: { fortuneFormula: 'bogus' }, rulership: 'modern' };
    expect(() => decodeCalculationSnapshot(bad)).toThrow();
  });
});
