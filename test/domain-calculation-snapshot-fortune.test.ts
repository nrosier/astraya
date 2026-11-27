import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { buildCalculationArtifact } from '../src/domain/calculation-artifact.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotIdentity,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  parseCalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { serializeCalculationSettings } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const INPUTS = { astrayaVersion: '0.0.0-test', swephVersion: '2.10-test' };

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

// The origin/main (7a6410a5) serialized default register, measured by serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS).
// #2045 changed it on purpose: register version 3 to 4 and midpointTreeOrb 1 to 0.25 (reported on #2045); no other byte.
const ORIGIN_MAIN_DEFAULT_REGISTER =
  '{"version":4,"settings":{"houseSystem":"P","zodiac":{"kind":"tropical"},"orbScalePercent":0,"boundsScheme":"egyptian","enabledMinorAspects":[],"lilithVariant":"mean","nodeVariant":"mean","objectPolicies":{"sun":{"visible":true,"aspectParticipant":true},"moon":{"visible":true,"aspectParticipant":true},"mercury":{"visible":true,"aspectParticipant":true},"venus":{"visible":true,"aspectParticipant":true},"mars":{"visible":true,"aspectParticipant":true},"jupiter":{"visible":true,"aspectParticipant":true},"saturn":{"visible":true,"aspectParticipant":true},"uranus":{"visible":true,"aspectParticipant":true},"neptune":{"visible":true,"aspectParticipant":true},"pluto":{"visible":true,"aspectParticipant":true},"meanNode":{"visible":false,"aspectParticipant":false},"trueNode":{"visible":false,"aspectParticipant":false},"meanLilith":{"visible":false,"aspectParticipant":false},"osculatingLilith":{"visible":false,"aspectParticipant":false},"interpolatedLilith":{"visible":false,"aspectParticipant":false},"chiron":{"visible":true,"aspectParticipant":false},"pholus":{"visible":false,"aspectParticipant":false},"ceres":{"visible":false,"aspectParticipant":true},"pallas":{"visible":false,"aspectParticipant":true},"juno":{"visible":false,"aspectParticipant":true},"vesta":{"visible":false,"aspectParticipant":true},"vertex":{"visible":false,"aspectParticipant":false},"partOfFortune":{"visible":false,"aspectParticipant":false},"partOfSpirit":{"visible":false,"aspectParticipant":false}},"midpointsVisible":false,"antisciaVisible":false,"antisciaMaxOrb":1,"declinationVisible":false,"declinationMaxOrb":1,"dial90Visible":false,"midpointTreeOrb":0.25,"rainbowZodiac":false}}';

describe('the Fortune formula leaves the default snapshot and register unchanged (#1794)', () => {
  // Measured on origin/main (7a6410a5), not copied from a review: a default snapshot's identity and
  // serialized register must match what the app produced before the Fortune formula field existed.
  // #2045 moved the default midpoint orb from 1 to 0.25, so the default identity moved from v4-85b6b5ff to v4-678ff471.
  it('the default snapshot identity equals the post-#2045 value v4-678ff471', () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    expect(calculationSnapshotIdentity(snapshot)).toBe('v4-678ff471');
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

  // Measured in this test, not copied: a Marr chart's identity is the same in memory and after a JSON round trip,
  // because the field sits last in the parsed settings (key order is part of the JSON-based identity).
  it('a Marr chart keeps the same identity in memory and after a JSON round trip', () => {
    const marr: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'same-day-and-night' };
    const inMemory = buildCalculationSnapshot(marr, DEFAULT_RULERSHIP_CHOICE);
    const roundTripped = parseCalculationSnapshot(calculationSnapshotToJson(inMemory));
    const identityInMemory = calculationSnapshotIdentity(inMemory);
    const identityAfterJson = calculationSnapshotIdentity(roundTripped);
    expect(identityAfterJson).toBe(identityInMemory);
    expect(roundTripped.settings.fortuneFormula).toBe('same-day-and-night');
  });

  // An explicit 'sect-reversed' is normalized away everywhere: the same identity as the default, the same artifact
  // snapshotHash (measured against the real engine), and a register with no fortuneFormula key.
  it("an explicit 'sect-reversed' gives the default identity, artifact snapshotHash and register", async () => {
    const explicit: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'sect-reversed' };
    const defaults = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    const normalized = buildCalculationSnapshot(explicit, DEFAULT_RULERSHIP_CHOICE);
    expect(calculationSnapshotIdentity(normalized)).toBe(calculationSnapshotIdentity(defaults));
    expect(normalized.settings).not.toHaveProperty('fortuneFormula');

    const artifactFor = async (snapshot: typeof defaults) => {
      const data = await computeChartData(PERSON, engine, {
        ...toChartCalculationOptions(snapshot.settings),
        rulership: snapshot.rulership,
      });
      return buildCalculationArtifact(snapshot, PERSON, data, INPUTS);
    };
    const [fromDefault, fromExplicit] = await Promise.all([artifactFor(defaults), artifactFor(normalized)]);
    expect(fromExplicit.fingerprint.snapshotHash).toBe(fromDefault.fingerprint.snapshotHash);

    expect(JSON.stringify(serializeCalculationSettings(explicit))).not.toContain('fortuneFormula');
    expect(JSON.stringify(serializeCalculationSettings(explicit))).toBe(
      JSON.stringify(serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS)),
    );
  });
});
