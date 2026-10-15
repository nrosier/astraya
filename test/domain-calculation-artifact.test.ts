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
  return buildCalculationArtifact(snapshot, moment, data, INPUTS);
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
    expect(calculationArtifactIdentity(artifact).slice(3, 15)).toBe(artifact.fingerprint.inputHash.slice(0, 12));
  }, 60_000);
});

describe('birth moment and time provenance in the artifact (#582)', () => {
  const DEFAULTS = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);

  it('records a stated offset as manual, with no zone', async () => {
    const artifact = await artifactFor(PERSON, DEFAULTS);
    expect(artifact.moment).toEqual(PERSON);
    expect(artifact.provenance.time).toMatchObject({
      offsetMinutes: -300,
      offsetSource: 'manual',
      zone: null,
      calendar: 'gregorian',
    });
    expect(artifact.provenance.time.tzdbFingerprint).not.toBe('');
  }, 60_000);

  it('records the tzdb zone and its offset when none was stated', async () => {
    const london: BirthMomentInput = {
      civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
      coordinates: { latitude: 51.5072, longitude: -0.1276 },
    };
    const artifact = await artifactFor(london, DEFAULTS);
    expect(artifact.provenance.time).toMatchObject({ offsetMinutes: 60, offsetSource: 'tzdb', zone: 'Europe/London' });
  }, 60_000);

  it('records Local Mean Time, and its warning, before standard time existed', async () => {
    const ada: BirthMomentInput = {
      civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
      coordinates: { latitude: 51.5072, longitude: -0.1276 },
    };
    const artifact = await artifactFor(ada, DEFAULTS);
    expect(artifact.provenance.time.offsetSource).toBe('lmt');
    expect(artifact.provenance.time.warnings).toContain('lmt-used');
  }, 60_000);

  it('changes the input hash, but not the snapshot hash, when only the birth moment changes', async () => {
    const later: BirthMomentInput = { ...PERSON, civil: { ...PERSON.civil, minute: 31 } };
    const [a, b] = [await artifactFor(PERSON, DEFAULTS), await artifactFor(later, DEFAULTS)];
    expect(b.fingerprint.snapshotHash).toBe(a.fingerprint.snapshotHash);
    expect(b.fingerprint.inputHash).not.toBe(a.fingerprint.inputHash);
    expect(b.fingerprint.resultHash).not.toBe(a.fingerprint.resultHash);
  }, 60_000);
});

describe('real-engine parity fixtures (#582)', () => {
  const VARIANTS: readonly (readonly [string, Partial<typeof DEFAULT_EXTENDED_SETTINGS>])[] = [
    ['true node', { nodeVariant: 'true' }],
    ['true (osculating) Lilith', { lilithVariant: 'true' }],
    ['sidereal, Lahiri', { zodiac: { kind: 'sidereal', ayanamsa: 1 } }],
    ['minor aspects on', { enabledMinorAspects: ['semisextile', 'quincunx', 'semisquare', 'sesquiquadrate'] }],
    ['aspects to Chiron', { aspectsToChiron: true }],
    ['aspects to Lilith', { aspectsToLilith: true }],
    ['aspects to the lunar nodes', { aspectsToLunarNodes: true }],
    ['aspects to the Vertex', { aspectsToVertex: true }],
    ['aspects to the Part of Fortune', { aspectsToPartOfFortune: true }],
    ['aspects to the Part of Spirit', { aspectsToPartOfSpirit: true }],
    ['wider orbs', { orbScalePercent: 40 }],
  ];

  async function dataFor(settings: typeof DEFAULT_EXTENDED_SETTINGS) {
    return computeChartData(PERSON, engine, toChartCalculationOptions(settings));
  }

  for (const [label, change] of VARIANTS) {
    it(`${label}: recomputes to the same hashes, and changes the result hash`, async () => {
      const settings = { ...DEFAULT_EXTENDED_SETTINGS, ...change };
      const snapshot = buildCalculationSnapshot(settings, DEFAULT_RULERSHIP_CHOICE);
      const [first, second] = [await artifactFor(PERSON, snapshot), await artifactFor(PERSON, snapshot)];
      expect(second.fingerprint).toEqual(first.fingerprint);

      const baseline = await artifactFor(
        PERSON,
        buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
      );
      expect(first.fingerprint.snapshotHash).not.toBe(baseline.fingerprint.snapshotHash);
      // Every variant here changes this chart's computed data (checked once against the engine), so
      // the result hash must change too — a fixture that changed nothing would prove nothing.
      expect(canonicalJson(await dataFor(settings))).not.toBe(canonicalJson(await dataFor(DEFAULT_EXTENDED_SETTINGS)));
      expect(first.fingerprint.resultHash).not.toBe(baseline.fingerprint.resultHash);
    }, 60_000);
  }

  it('the sidereal result really is the tropical one shifted by the ayanamsa, so the fixture tests a real change', async () => {
    const tropical = await dataFor(DEFAULT_EXTENDED_SETTINGS);
    const sidereal = await dataFor({ ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: 1 } });
    const sunOf = (data: typeof tropical) => data.positions[0]?.longitude ?? Number.NaN;
    const shift = (((sunOf(tropical) - sunOf(sidereal)) % 360) + 360) % 360;
    // Lahiri was about 23.7° in 1990.
    expect(shift).toBeGreaterThan(23.5);
    expect(shift).toBeLessThan(24);
  }, 60_000);

  it('covers each aspect’s applying/separating state: flipping one changes the result hash', async () => {
    const snapshot = buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
    const data = await dataFor(DEFAULT_EXTENDED_SETTINGS);
    const [first, ...rest] = data.aspects;
    if (first === undefined) throw new Error('fixture chart has no aspects');
    const flipped = { ...data, aspects: [{ ...first, applying: !first.applying }, ...rest] };
    const [a, b] = [
      await buildCalculationArtifact(snapshot, PERSON, data, INPUTS),
      await buildCalculationArtifact(snapshot, PERSON, flipped, INPUTS),
    ];
    expect(b.fingerprint.inputHash).toBe(a.fingerprint.inputHash);
    expect(b.fingerprint.resultHash).not.toBe(a.fingerprint.resultHash);
  }, 60_000);
});
