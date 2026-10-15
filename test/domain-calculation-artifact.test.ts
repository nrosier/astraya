/**
 * #582: a completed calculation as a verifiable artifact — canonical, order-independent hashing;
 * SHA-256 that agrees with Node's own implementation; and, against the real engine, fingerprints
 * that are stable for identical inputs, change with any input that changes the chart (custom
 * points, house system), and provenance that reports the engine's own polar house fallback.
 */
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, toChartCalculationOptions } from '../src/chart/extended-settings.js';
import {
  buildCalculationArtifact,
  calculationArtifactIdentity,
  canonicalJson,
  sha256Hex,
} from '../src/domain/calculation-artifact.js';
import { buildCalculationSnapshot, type CalculationSnapshot } from '../src/domain/calculation-snapshot.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ALL_ASSETS } from '../src/ephemeris/assets.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const FORMULA_POINT = { id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' };
const INPUTS = { astrayaVersion: '0.0.0-test', swephVersion: '2.10-test' };

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

async function artifactFor(moment: BirthMomentInput, snapshot: CalculationSnapshot) {
  const data = await computeChartData(moment, engine, {
    ...toChartCalculationOptions(snapshot.settings),
    rulership: snapshot.rulership,
    ...(snapshot.customPoints.length === 0 ? {} : { customPoints: snapshot.customPoints }),
  });
  return buildCalculationArtifact(snapshot, data, INPUTS);
}

describe('canonicalJson (#582)', () => {
  it('serializes the same value identically whatever order its keys and Map entries were inserted in', () => {
    const a = {
      b: 1,
      a: { y: [1, 2], x: 'z' },
      m: new Map([
        ['k2', 2],
        ['k1', 1],
      ]),
    };
    const b = {
      m: new Map([
        ['k1', 1],
        ['k2', 2],
      ]),
      a: { x: 'z', y: [1, 2] },
      b: 1,
    };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"x":"z","y":[1,2]},"b":1,"m":[["k1",1],["k2",2]]}');
  });

  it('keeps non-finite numbers distinguishable instead of collapsing them to null, and omits undefined fields', () => {
    expect(canonicalJson({ cusp: Number.NaN, far: Infinity, gone: undefined, zero: 0 })).toBe(
      '{"cusp":"NaN","far":"Infinity","zero":0}',
    );
    expect(canonicalJson({ cusp: Number.NaN })).not.toBe(canonicalJson({ cusp: null }));
  });

  it('keeps array order, which is meaningful (cusp 1 is not cusp 2)', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('sha256Hex (#582)', () => {
  it('agrees with Node’s own SHA-256, including for non-ASCII text', async () => {
    for (const text of ['', 'abc', 'Astraya ☉ ♈ — Zoë', '{"a":1}']) {
      expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });
});

describe('buildCalculationArtifact against the real engine (#582)', () => {
  it('gives identical fingerprints for identical inputs', async () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE, [FORMULA_POINT]);
    const first = await artifactFor(PERSON, snapshot);
    const second = await artifactFor(PERSON, snapshot);
    expect(second.fingerprint).toEqual(first.fingerprint);
    expect(first.fingerprint.algorithm).toBe('sha-256');
    expect(first.fingerprint.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.fingerprint.resultHash).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it('changes both hashes when a custom point is added — the change a share link used to drop', async () => {
    const without = await artifactFor(
      PERSON,
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
    );
    const withPoint = await artifactFor(
      PERSON,
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE, [FORMULA_POINT]),
    );
    expect(withPoint.fingerprint.snapshotHash).not.toBe(without.fingerprint.snapshotHash);
    expect(withPoint.fingerprint.resultHash).not.toBe(without.fingerprint.resultHash);
  }, 60_000);

  it('changes the result hash when the house system changes', async () => {
    const placidus = await artifactFor(
      PERSON,
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
    );
    const wholeSign = await artifactFor(
      PERSON,
      buildCalculationSnapshot({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' }, DEFAULT_RULERSHIP_CHOICE),
    );
    expect(wholeSign.fingerprint.resultHash).not.toBe(placidus.fingerprint.resultHash);
    expect(wholeSign.provenance.requestedHouseSystem).toBe('W');
    expect(wholeSign.provenance.effectiveHouseSystem).toBe('W');
  }, 60_000);

  it('records the engine’s own Porphyry fallback for Placidus inside the polar circle (#20)', async () => {
    const arctic: BirthMomentInput = { ...PERSON, coordinates: { latitude: 70, longitude: -8 } };
    const artifact = await artifactFor(
      arctic,
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
    );
    expect(artifact.provenance.requestedHouseSystem).toBe('P');
    expect(artifact.provenance.effectiveHouseSystem).toBe('O');
    expect(artifact.provenance.warnings.join(' ')).toMatch(/'P'/);
  }, 60_000);

  it('carries the supplied versions and every pinned ephemeris asset hash', async () => {
    const artifact = await artifactFor(
      PERSON,
      buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
    );
    expect(artifact.provenance.astrayaVersion).toBe(INPUTS.astrayaVersion);
    expect(artifact.provenance.swephVersion).toBe(INPUTS.swephVersion);
    expect(artifact.provenance.ephemerisAssetHashes).toEqual(
      Object.fromEntries(ALL_ASSETS.map((asset) => [asset.file, asset.sha256])),
    );
    expect(calculationArtifactIdentity(artifact)).toMatch(/^v2-[0-9a-f]{12}\/[0-9a-f]{12}$/);
  }, 60_000);
});
