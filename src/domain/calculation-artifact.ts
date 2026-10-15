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
 * Not covered yet (tracked on #582): a time-zone database fingerprint and resolved birth-time
 * provenance, calculation warnings beyond the house-division case, and the PDF/export/restore
 * paths consuming the artifact instead of recomputing from ambient settings.
 */
/**
 * @module domain/calculation-artifact
 * @purpose Builds a CalculationArtifact — snapshot, execution provenance and SHA-256 fingerprints of inputs and result — once a chart calculation completes (#582).
 * @conventions Hashes are SHA-256 over a canonical JSON text (sorted keys, Maps as sorted entries, non-finite numbers as strings, `undefined` fields omitted) via Web Crypto, so they are stable across key insertion order and identical in the browser and Node. Provenance values that need the app build or the engine (`astrayaVersion`, `swephVersion`) are passed in, keeping this module pure apart from the digest.
 * @exports CalculationArtifact, CalculationProvenance, CalculationFingerprint, CalculationArtifactInputs, buildCalculationArtifact, calculationArtifactIdentity, canonicalJson, sha256Hex
 */
import { ALL_ASSETS } from '../ephemeris/assets.js';
import type { HouseSystem } from '../ephemeris/types.js';
import type { CalculationSnapshot } from './calculation-snapshot.js';
import { housesAreDefined, type ChartData } from './chart-compute.js';

export interface CalculationProvenance {
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
}

export interface CalculationFingerprint {
  readonly algorithm: 'sha-256';
  /** Hex SHA-256 of the canonical snapshot: the complete calculation inputs. */
  readonly snapshotHash: string;
  /** Hex SHA-256 of the canonical `ChartData`: the complete computed result. */
  readonly resultHash: string;
}

export interface CalculationArtifact {
  readonly snapshot: CalculationSnapshot;
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

/** Builds the artifact for a calculation that has just completed from `snapshot`, producing `data`. */
export async function buildCalculationArtifact(
  snapshot: CalculationSnapshot,
  data: ChartData,
  inputs: CalculationArtifactInputs,
): Promise<CalculationArtifact> {
  const housesDefined = housesAreDefined(data.houses);
  const [snapshotHash, resultHash] = await Promise.all([
    sha256Hex(canonicalJson(snapshot)),
    sha256Hex(canonicalJson(data)),
  ]);
  return {
    snapshot,
    provenance: {
      astrayaVersion: inputs.astrayaVersion,
      swephVersion: inputs.swephVersion,
      ephemerisAssetHashes: EPHEMERIS_ASSET_HASHES,
      requestedHouseSystem: snapshot.settings.houseSystem,
      effectiveHouseSystem: housesDefined ? data.houses.system : undefined,
      warnings: [
        ...(data.houses.warning === undefined ? [] : [data.houses.warning]),
        ...(housesDefined ? [] : ['houses-undefined']),
      ],
    },
    fingerprint: { algorithm: 'sha-256', snapshotHash, resultHash },
  };
}

/**
 * The short form printed on a chart (#564's provenance line): snapshot version, then the first
 * 12 hex digits of the input and result hashes. Enough to tell two printouts apart or match one
 * to its full artifact; the full hashes stay in the artifact itself.
 */
export function calculationArtifactIdentity(artifact: CalculationArtifact): string {
  const { snapshotHash, resultHash } = artifact.fingerprint;
  return `v${String(artifact.snapshot.version)}-${snapshotHash.slice(0, 12)}/${resultHash.slice(0, 12)}`;
}
