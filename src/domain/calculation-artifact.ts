/**
 * A completed calculation as one verifiable record (#582): the inputs that produced it (the
 * snapshot), the engine and data it ran against (provenance), and SHA-256 fingerprints of both
 * the inputs and the result.
 *
 * `calculationSnapshotIdentity` is a 32-bit display tag over the settings alone; it cannot show
 * that two charts came from the same complete inputs, nor that a stored result is still what the
 * current engine produces. Here the snapshot and the full computed `ChartData` are each reduced
 * to one canonical JSON text — object keys sorted, `Map`s as key-sorted entry lists, non-finite
 * numbers spelled out rather than collapsed to `null` (an undefined house division is `NaN`, not
 * zero) — and hashed. The same inputs on the same engine and data therefore give the same
 * `resultHash`; a change to any input, the ephemeris files, or the calculation itself does not.
 *
 * The birth moment is part of the inputs (`inputHash`), and how its wall-clock time was turned
 * into an instant — offset, its source, zone, calendar, DST ambiguity and the runtime's tzdb
 * fingerprint — is part of the provenance, since a time-zone database update can move a stored
 * chart without any input changing.
 *
 * A natal chart's artifact has no `technique`. A technique built on the natal chart — transits,
 * synastry, primary directions — adds its own inputs there (target date, partner, orbs, key) and
 * its `resultHash` covers that technique's whole result, not just the natal chart under it.
 *
 * `verifyCalculationArtifact` recomputes any artifact from its own recorded inputs: what
 * `full-export-check.ts`'s "Check a calculation file" (#582) runs to tell whether a stored
 * result is still what this engine produces, and, when it is not, which recorded provenance
 * differs. (An earlier version of this comment said a restore, #587, called this — it never
 * did; #587's restore deliberately never reads a `calculation` field at all, by its own module
 * doc. Corrected here rather than left standing after the GitHub issue thread caught it.)
 */
/**
 * @module domain/calculation-artifact
 * @purpose Builds a CalculationArtifact — snapshot, execution provenance and SHA-256 fingerprints of inputs and result — once a chart calculation completes (#582).
 * @conventions Hashes are SHA-256 over a canonical JSON text (sorted keys, Maps as sorted entries, non-finite numbers as strings, `undefined` fields omitted) via Web Crypto, so they are stable across key insertion order and identical in the browser and Node. Provenance values that need the app build or the engine (`astrayaVersion`, `swephVersion`) are passed in, keeping this module pure apart from the digest.
 * @exports PRIMARY_DIRECTIONS_EFFECTIVE_SNAPSHOT, CalculationArtifact, CalculationTechnique, CalculationProvenance, TimeProvenance, CalculationFingerprint, CalculationArtifactInputs, ArtifactVerification, ProvenanceDifference, buildCalculationArtifact, buildTechniqueArtifact, verifyCalculationArtifact, calculationArtifactIdentity, canonicalJson, sha256Hex
 */
import { DEFAULT_ORB_CONFIG, type OrbConfig } from '../astrology/aspects.js';
import { ALL_ASSETS } from '../ephemeris/assets.js';
import type { Degrees, EphemerisProvider, HouseSystem, JulianDayUT } from '../ephemeris/types.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput, OffsetProvenance, TimeWarningCode } from '../time/types.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';
import {
  buildCalculationSnapshot,
  snapshotCalculationOptions,
  type CalculationSnapshot,
} from './calculation-snapshot.js';
import { computeChartData, housesAreDefined, type ChartData } from './chart-compute.js';
import {
  generatePrimaryDirections,
  type PrimaryDirectionKey,
  type PrimaryDirectionsOptions,
} from './primary-directions.js';
import { computeSynastry } from './synastry.js';
import { computeTransit } from './transit.js';

/**
 * How the birth moment's wall-clock time became an instant (#582): the same resolution
 * `computeChartData` performs, recorded so a stored result can be told apart from one a later
 * time-zone database would give for the same input.
 */
export interface TimeProvenance {
  /** Minutes east of UTC that was applied. */
  readonly offsetMinutes: number;
  /** Whether the offset was stated by the user, read from tzdb, or Local Mean Time. */
  readonly offsetSource: OffsetProvenance;
  /** The IANA zone used, or `null` for a stated offset or Local Mean Time. */
  readonly zone: string | null;
  readonly calendar: 'gregorian' | 'julian';
  /** Other offsets that would give the same wall-clock time — non-empty only in a DST overlap. */
  readonly alternativeOffsetMinutes: readonly number[];
  readonly warnings: readonly TimeWarningCode[];
  /** `zones.ts`'s probe of this runtime's tzdb: different text means different historical offsets. */
  readonly tzdbFingerprint: string;
}

/**
 * The inputs of a technique computed on top of the natal chart (#582) — everything beyond the
 * moment and snapshot that its result depends on, including orbs a caller left at their default,
 * recorded at their actual value so a later default change shows up as a changed input.
 */
export type CalculationTechnique =
  | { readonly kind: 'transit'; readonly targetJd: JulianDayUT; readonly orbConfig: OrbConfig }
  | { readonly kind: 'synastry'; readonly partner: BirthMomentInput; readonly orbConfig: OrbConfig }
  | {
      readonly kind: 'primary-directions';
      readonly key: PrimaryDirectionKey;
      readonly orb: Degrees;
      readonly options: PrimaryDirectionsOptions;
      /**
       * What the engine actually computed with (#797), as opposed to the artifact's own `snapshot`,
       * which is what the practitioner's client record requested. Primary directions are always
       * Placidus and tropical with default rulers and no custom points, so this is
       * `PRIMARY_DIRECTIONS_EFFECTIVE_SNAPSHOT` whatever was requested. Filled in by
       * `buildTechniqueArtifact` when omitted; absent on artifacts written before #797. Part of
       * `inputHash`, so a replay recomputes from this recorded value, not from current defaults.
       */
      readonly effectiveSnapshot?: CalculationSnapshot;
    };

/**
 * The settings primary directions are really computed with (#797): Placidus houses, tropical
 * zodiac, default rulers, no custom points. Locked in `primary-directions.ts`; recorded in the
 * artifact beside the requested snapshot so what was computed is never confused with what was asked.
 */
export const PRIMARY_DIRECTIONS_EFFECTIVE_SNAPSHOT: CalculationSnapshot = buildCalculationSnapshot(
  DEFAULT_EXTENDED_SETTINGS,
  DEFAULT_RULERSHIP_CHOICE,
);

export interface CalculationProvenance {
  readonly time: TimeProvenance;
  /** Synastry only: how the partner's birth time was resolved. */
  readonly partnerTime?: TimeProvenance;
  readonly astrayaVersion: string;
  readonly swephVersion: string;
  /** Pinned SHA-256 of every ephemeris data file, the fixed-star catalogue and the WASM binary, by file name. */
  readonly ephemerisAssetHashes: Readonly<Record<string, string>>;
  readonly requestedHouseSystem: HouseSystem;
  /**
   * The house system the result actually has: the engine's own `HousePositions.system`, which
   * differs from the requested one when Swiss Ephemeris falls back (Placidus or Koch inside a
   * polar circle become Porphyry, #20). `undefined` when the houses have no solution at all.
   */
  readonly effectiveHouseSystem: HouseSystem | undefined;
  /** The engine's own house warning, if any, then `'houses-undefined'` when the houses are unusable. */
  readonly warnings: readonly string[];
  /**
   * The exact orb tiers, scale and rules a natal chart was computed with (#590). Recorded so a later
   * change to the code's default tiers shows up in the provenance, not only as a changed result hash.
   * Informational and outside `inputHash`, so artifacts written before this existed stay verifiable.
   */
  readonly orbs?: OrbConfig | undefined;
}

export interface CalculationFingerprint {
  readonly algorithm: 'sha-256';
  /** Hex SHA-256 of the canonical snapshot: the calculation settings, rulers and custom points. */
  readonly snapshotHash: string;
  /** Hex SHA-256 of the canonical birth moment, snapshot and technique together: the complete calculation inputs. */
  readonly inputHash: string;
  /** Hex SHA-256 of the canonical result: the natal `ChartData`, or the technique's whole result. */
  readonly resultHash: string;
}

export interface CalculationArtifact {
  /** The birth moment as entered: civil time, place and any stated offset or zone. */
  readonly moment: BirthMomentInput;
  readonly snapshot: CalculationSnapshot;
  /** Absent for a natal chart; otherwise the technique computed on top of it, with its own inputs. */
  readonly technique?: CalculationTechnique;
  readonly provenance: CalculationProvenance;
  readonly fingerprint: CalculationFingerprint;
}

/** What the caller supplies beyond the snapshot and result: values only the app build and the live engine know. */
export interface CalculationArtifactInputs {
  readonly astrayaVersion: string;
  readonly swephVersion: string;
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, entry]): [string, unknown] => [String(key), canonicalValue(entry)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) sorted[key] = canonicalValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * One canonical JSON text for `value`: the same logical value always serializes identically,
 * whatever order its object keys or `Map` entries were inserted in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/** Lower-case hex SHA-256 of `text`'s UTF-8 bytes, via Web Crypto (browser and Node alike). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const EPHEMERIS_ASSET_HASHES: Readonly<Record<string, string>> = Object.fromEntries(
  ALL_ASSETS.map((asset) => [asset.file, asset.sha256]),
);

function timeProvenance(moment: BirthMomentInput): TimeProvenance {
  const resolved = resolveMoment(moment);
  return {
    offsetMinutes: resolved.offsetMinutes,
    offsetSource: resolved.provenance,
    zone: resolved.zone,
    calendar: resolved.calendar,
    alternativeOffsetMinutes: resolved.alternativeOffsetMinutes,
    warnings: resolved.warnings.map((warning) => warning.code),
    tzdbFingerprint: resolved.tzdbFingerprint,
  };
}

/** Builds the artifact for a natal calculation of `moment` that has just completed from `snapshot`, producing `data`. */
export async function buildCalculationArtifact(
  snapshot: CalculationSnapshot,
  moment: BirthMomentInput,
  data: ChartData,
  inputs: CalculationArtifactInputs,
): Promise<CalculationArtifact> {
  return buildArtifact(snapshot, moment, undefined, data, data, inputs);
}

/**
 * Builds the artifact for a technique computed on top of `moment`'s natal chart: `subject` is
 * that natal chart (whose houses the provenance reports), `result` the technique's whole result.
 */
export async function buildTechniqueArtifact(
  snapshot: CalculationSnapshot,
  moment: BirthMomentInput,
  technique: CalculationTechnique,
  subject: ChartData,
  result: unknown,
  inputs: CalculationArtifactInputs,
): Promise<CalculationArtifact> {
  return buildArtifact(snapshot, moment, technique, subject, result, inputs);
}

async function buildArtifact(
  snapshot: CalculationSnapshot,
  moment: BirthMomentInput,
  recordedTechnique: CalculationTechnique | undefined,
  subject: ChartData,
  result: unknown,
  inputs: CalculationArtifactInputs,
): Promise<CalculationArtifact> {
  const technique =
    recordedTechnique?.kind === 'primary-directions' && recordedTechnique.effectiveSnapshot === undefined
      ? { ...recordedTechnique, effectiveSnapshot: PRIMARY_DIRECTIONS_EFFECTIVE_SNAPSHOT }
      : recordedTechnique;
  const housesDefined = housesAreDefined(subject.houses);
  // `technique: undefined` is omitted by `canonicalJson`, so a natal input hash is unchanged by its existence.
  const [snapshotHash, inputHash, resultHash] = await Promise.all([
    sha256Hex(canonicalJson(snapshot)),
    sha256Hex(canonicalJson({ moment, snapshot, technique })),
    sha256Hex(canonicalJson(result)),
  ]);
  return {
    moment,
    snapshot,
    ...(technique === undefined ? {} : { technique }),
    provenance: {
      time: timeProvenance(moment),
      ...(technique?.kind === 'synastry' ? { partnerTime: timeProvenance(technique.partner) } : {}),
      astrayaVersion: inputs.astrayaVersion,
      swephVersion: inputs.swephVersion,
      ephemerisAssetHashes: EPHEMERIS_ASSET_HASHES,
      requestedHouseSystem: snapshot.settings.houseSystem,
      effectiveHouseSystem: housesDefined ? subject.houses.system : undefined,
      warnings: [
        ...(subject.houses.warning === undefined ? [] : [subject.houses.warning]),
        ...(housesDefined ? [] : ['houses-undefined']),
      ],
      ...(technique === undefined
        ? { orbs: snapshotCalculationOptions(snapshot).orbConfig ?? DEFAULT_ORB_CONFIG }
        : {}),
    },
    fingerprint: { algorithm: 'sha-256', snapshotHash, inputHash, resultHash },
  };
}

/** One recorded provenance value that this runtime no longer has — a likely reason for a changed result. */
export interface ProvenanceDifference {
  readonly field:
    'astrayaVersion' | 'swephVersion' | 'ephemerisAssets' | 'tzdb' | 'timeResolution' | 'houseSystem' | 'orbs';
  readonly recorded: string;
  readonly current: string;
}

export type ArtifactVerification =
  /** Recomputing from the recorded inputs gives the recorded result, exactly. */
  | { readonly status: 'verified' }
  /** The recorded inputs no longer match the recorded input hash: the record was edited or damaged. */
  | { readonly status: 'inconsistent'; readonly recordedInputHash: string; readonly actualInputHash: string }
  /** The inputs are intact but this runtime computes a different result; `differences` names the likely causes. */
  | {
      readonly status: 'changed';
      readonly recordedResultHash: string;
      readonly currentResultHash: string;
      readonly differences: readonly ProvenanceDifference[];
    };

/** Recomputes the result an artifact's own inputs describe, the same way the screen that recorded it did. */
async function recompute(
  artifact: CalculationArtifact,
  provider: EphemerisProvider,
): Promise<{ readonly subject: ChartData; readonly result: unknown }> {
  const options = snapshotCalculationOptions(artifact.snapshot);
  const technique = artifact.technique;
  if (technique === undefined) {
    const data = await computeChartData(artifact.moment, provider, options);
    return { subject: data, result: data };
  }
  switch (technique.kind) {
    case 'transit': {
      const data = await computeTransit(artifact.moment, technique.targetJd, provider, {
        ...options,
        orbConfig: technique.orbConfig,
      });
      return { subject: data.natal, result: data };
    }
    case 'synastry': {
      const data = await computeSynastry(artifact.moment, technique.partner, provider, {
        ...options,
        orbConfig: technique.orbConfig,
      });
      return { subject: data.chartA, result: data };
    }
    case 'primary-directions': {
      // Directions are locked to the effective settings recorded in `technique.effectiveSnapshot`
      // (#797), never the artifact's requested `snapshot`; that value is part of `inputHash`, so an
      // edited claim is reported as inconsistent before this runs.
      const data = await generatePrimaryDirections(
        artifact.moment,
        provider,
        technique.key,
        technique.orb,
        technique.options,
      );
      return { subject: data.natal, result: data };
    }
  }
}

function differencesBetween(recorded: CalculationProvenance, current: CalculationProvenance): ProvenanceDifference[] {
  const differences: ProvenanceDifference[] = [];
  const add = (field: ProvenanceDifference['field'], a: string, b: string): void => {
    if (a !== b) differences.push({ field, recorded: a, current: b });
  };
  add('astrayaVersion', recorded.astrayaVersion, current.astrayaVersion);
  add('swephVersion', recorded.swephVersion, current.swephVersion);
  add('ephemerisAssets', canonicalJson(recorded.ephemerisAssetHashes), canonicalJson(current.ephemerisAssetHashes));
  add('tzdb', recorded.time.tzdbFingerprint, current.time.tzdbFingerprint);
  const resolution = (time: TimeProvenance | undefined): string =>
    time === undefined ? '' : canonicalJson({ ...time, tzdbFingerprint: undefined });
  add(
    'timeResolution',
    resolution(recorded.time) + resolution(recorded.partnerTime),
    resolution(current.time) + resolution(current.partnerTime),
  );
  add('houseSystem', recorded.effectiveHouseSystem ?? 'undefined', current.effectiveHouseSystem ?? 'undefined');
  // Only a natal record carries its tiers (#590); a technique's own orbConfig is already part of its input hash.
  if (recorded.orbs !== undefined && current.orbs !== undefined) {
    add('orbs', canonicalJson(recorded.orbs), canonicalJson(current.orbs));
  }
  return differences;
}

/**
 * Recomputes `artifact` from its own recorded inputs on `provider` and compares. `current` is
 * this runtime's own app and engine version, recorded into the comparison artifact so a changed
 * result comes back with the provenance that differs — the likely reason it changed.
 */
export async function verifyCalculationArtifact(
  artifact: CalculationArtifact,
  provider: EphemerisProvider,
  current: CalculationArtifactInputs,
): Promise<ArtifactVerification> {
  const actualInputHash = await sha256Hex(
    canonicalJson({ moment: artifact.moment, snapshot: artifact.snapshot, technique: artifact.technique }),
  );
  if (actualInputHash !== artifact.fingerprint.inputHash) {
    return { status: 'inconsistent', recordedInputHash: artifact.fingerprint.inputHash, actualInputHash };
  }
  const { subject, result } = await recompute(artifact, provider);
  const now = await buildArtifact(artifact.snapshot, artifact.moment, artifact.technique, subject, result, current);
  if (now.fingerprint.resultHash === artifact.fingerprint.resultHash) return { status: 'verified' };
  return {
    status: 'changed',
    recordedResultHash: artifact.fingerprint.resultHash,
    currentResultHash: now.fingerprint.resultHash,
    differences: differencesBetween(artifact.provenance, now.provenance),
  };
}

/**
 * The short form printed on a chart (#564's provenance line): snapshot version, then the first
 * 12 hex digits of the complete-input and result hashes. Enough to tell two printouts apart or match one
 * to its full artifact; the full hashes stay in the artifact itself.
 */
export function calculationArtifactIdentity(artifact: CalculationArtifact): string {
  const { inputHash, resultHash } = artifact.fingerprint;
  return `v${String(artifact.snapshot.version)}-${inputHash.slice(0, 12)}/${resultHash.slice(0, 12)}`;
}
