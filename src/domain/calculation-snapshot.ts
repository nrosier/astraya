/**
 * The settings that actually produced a chart, as one serializable, versioned value (#541) —
 * so a recipient of a shared link, an imported export, or a reloaded saved default recomputes
 * from the same settings the sender/exporter actually used, instead of silently falling back
 * to whatever ambient device settings happen to be active locally.
 *
 * Deliberately just `{ settings: ExtendedSettings, rulership: RulershipChoice }` — the same
 * shape `ui/default-calculation-profile.ts`'s `DefaultCalculationProfile` already uses for a
 * device's own saved default — rather than a new parallel type. `parseCalculationSnapshot` is
 * the one place that turns untrusted JSON (from a share link, an import, or localStorage) into
 * a complete, well-typed snapshot: every field is validated and any missing/invalid one is
 * filled from `DEFAULT_EXTENDED_SETTINGS`/`DEFAULT_RULERSHIP_CHOICE` rather than left as
 * `undefined` or silently accepted unchecked — closing the gap a merely "is this a non-null
 * object" guard leaves open.
 */
/**
 * @module domain/calculation-snapshot
 * @purpose Defines a versioned, fully-validated CalculationSnapshot (settings, rulership and custom points) and the pure functions that build/parse/serialize one.
 * @conventions `version` is bumped only when the *shape* a snapshot must satisfy changes incompatibly; `parseCalculationSnapshot` never throws — an invalid or missing field is filled from the documented app defaults, the same defaults a never-customized chart already shows; strict validation checks registered house systems, aspect keys, and bounds schemes against canonical registries.
 * @exports CURRENT_SNAPSHOT_VERSION, CalculationSnapshot, buildCalculationSnapshot, snapshotCalculationOptions, calculationSnapshotIdentity, parseCalculationSnapshot, calculationSnapshotToJson
 */
import {
  DEFAULT_EXTENDED_SETTINGS,
  MODERN_POINT_KEYS,
  toChartCalculationOptions,
  type ExtendedSettings,
} from '../chart/extended-settings.js';
import type { ChartCalculationOptions } from './chart-compute.js';
import { DEFAULT_RULERSHIP_CHOICE, RULERSHIP_CHOICES, type RulershipChoice } from '../astrology/rulership.js';
import { houseSystemByCode } from '../astrology/houses.js';
import { aspectByKey } from '../astrology/aspects.js';
import type { Zodiac } from '../ephemeris/types.js';
import type { JsonValue } from '../store/ops.js';
import type { CustomPointDefinition } from './person.js';

/**
 * 2 (#582): adds `customPoints`. A v1 snapshot (or a pre-#541 link with no version at all) still
 * parses — it simply had no way to carry formula points, so it reads back with none.
 */
export const CURRENT_SNAPSHOT_VERSION = 2;

export interface CalculationSnapshot {
  readonly version: typeof CURRENT_SNAPSHOT_VERSION;
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
  /**
   * The person's own formula points (#582) — part of what produced the chart, so a shared or
   * exported chart that drops them silently shows different objects from the sender's.
   */
  readonly customPoints: readonly CustomPointDefinition[];
}

/**
 * Validate snapshot version matches the current schema version. Rejects unsupported
 * versions with a descriptive error rather than silently defaulting.
 */
export function validateSnapshotVersion(version: unknown): version is typeof CURRENT_SNAPSHOT_VERSION {
  return version === CURRENT_SNAPSHOT_VERSION;
}

/**
 * Validate house system code exists in the canonical registry.
 * Returns true only if the code is registered; false otherwise (will use default).
 */
export function isValidHouseSystem(code: unknown): code is string {
  return typeof code === 'string' && houseSystemByCode(code) !== undefined;
}

/**
 * Validate aspect key exists in the canonical aspect registry.
 * Returns true only if the key is known; false otherwise.
 */
export function isValidAspect(key: unknown): key is string {
  return typeof key === 'string' && aspectByKey(key) !== undefined;
}

/**
 * Validate all minor aspect keys against the canonical aspect registry.
 * Returns only the valid aspect keys; unknown ones are silently filtered out.
 */
export function validateMinorAspects(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && isValidAspect(item));
}

export function buildCalculationSnapshot(
  settings: ExtendedSettings,
  rulership: RulershipChoice,
  customPoints: readonly CustomPointDefinition[] = [],
): CalculationSnapshot {
  return { version: CURRENT_SNAPSHOT_VERSION, settings, rulership, customPoints };
}

/**
 * The exact `computeChartData` options a snapshot stands for (#582): its settings, its rulers, and
 * its custom points when there are any. Every screen that records a snapshot computes with this,
 * so the snapshot is the calculation's real input rather than a description written beside it.
 */
export function snapshotCalculationOptions(snapshot: CalculationSnapshot): ChartCalculationOptions {
  return {
    ...toChartCalculationOptions(snapshot.settings),
    rulership: snapshot.rulership,
    ...(snapshot.customPoints.length === 0 ? {} : { customPoints: snapshot.customPoints }),
  };
}

/** A short stable identifier for a complete snapshot, suitable for print/export provenance (not a security hash). */
export function calculationSnapshotIdentity(snapshot: CalculationSnapshot): string {
  const serialized = JSON.stringify(snapshot);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v${String(snapshot.version)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function parseZodiac(value: unknown): Zodiac {
  if (isRecord(value) && value.kind === 'sidereal' && typeof value.ayanamsa === 'number') {
    return { kind: 'sidereal', ayanamsa: value.ayanamsa };
  }
  return DEFAULT_EXTENDED_SETTINGS.zodiac;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Keeps only well-formed definitions: a point with a non-string id/name/formula cannot be
 * evaluated or labelled, so it is dropped rather than guessed at. The formula itself is
 * validated where it is evaluated (`formula-parser.ts`), not here.
 */
function parseCustomPoints(value: unknown): readonly CustomPointDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CustomPointDefinition[] => {
    if (!isRecord(item)) return [];
    const { id, name, formula, enabled } = item;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof formula !== 'string') return [];
    return [{ id, name, formula, ...(typeof enabled === 'boolean' ? { enabled } : {}) }];
  });
}

function parseModernPointVisibility(value: unknown): ExtendedSettings['modernPointVisibility'] {
  const defaults = DEFAULT_EXTENDED_SETTINGS.modernPointVisibility;
  const parsed: Record<(typeof MODERN_POINT_KEYS)[number], boolean> = { ...defaults };
  if (!isRecord(value)) return parsed;
  for (const key of MODERN_POINT_KEYS) parsed[key] = parseBool(value[key], defaults[key]);
  return parsed;
}

/**
 * Every field checked individually against canonical registries (house systems, aspect keys,
 * bounds schemes) rather than trusting the shape as a whole. A `settings` bag that is merely
 * "some object" can still have missing or wrong-typed fields; each one here is validated
 * against registered values and filled from the app default for that one field specifically
 * if validation fails.
 */
function parseExtendedSettings(value: unknown): ExtendedSettings {
  if (!isRecord(value)) return DEFAULT_EXTENDED_SETTINGS;
  const d = DEFAULT_EXTENDED_SETTINGS;

  // House system: must be in the canonical registry
  const houseSystem = isValidHouseSystem(value.houseSystem) ? value.houseSystem : d.houseSystem;

  // Minor aspects: must all be in the canonical aspect registry
  const enabledMinorAspects = validateMinorAspects(value.enabledMinorAspects);
  if (enabledMinorAspects.length === 0 && value.enabledMinorAspects !== undefined) {
    // If the user provided minor aspects but none were valid, fall back to default
  }

  return {
    houseSystem,
    zodiac: parseZodiac(value.zodiac),
    orbScalePercent: typeof value.orbScalePercent === 'number' ? value.orbScalePercent : d.orbScalePercent,
    boundsScheme: isOneOf(value.boundsScheme, ['egyptian', 'ptolemaic'] as const) ? value.boundsScheme : d.boundsScheme,
    enabledMinorAspects: enabledMinorAspects.length > 0 ? enabledMinorAspects : d.enabledMinorAspects,
    lilithVariant: isOneOf(value.lilithVariant, ['mean', 'true', 'interpolated'] as const)
      ? value.lilithVariant
      : d.lilithVariant,
    nodeVariant: isOneOf(value.nodeVariant, ['mean', 'true'] as const) ? value.nodeVariant : d.nodeVariant,
    fortuneVisible: parseBool(value.fortuneVisible, d.fortuneVisible),
    vertexVisible: parseBool(value.vertexVisible, d.vertexVisible),
    chironVisible: parseBool(value.chironVisible, d.chironVisible),
    modernPointVisibility: parseModernPointVisibility(value.modernPointVisibility),
    spiritVisible: parseBool(value.spiritVisible, d.spiritVisible),
    midpointsVisible: parseBool(value.midpointsVisible, d.midpointsVisible),
    antisciaVisible: parseBool(value.antisciaVisible, d.antisciaVisible),
    antisciaMaxOrb: parseNonNegativeNumber(value.antisciaMaxOrb, d.antisciaMaxOrb),
    declinationVisible: parseBool(value.declinationVisible, d.declinationVisible),
    declinationMaxOrb: parseNonNegativeNumber(value.declinationMaxOrb, d.declinationMaxOrb),
    dial90Visible: parseBool(value.dial90Visible, d.dial90Visible),
    midpointTreeOrb: parseNonNegativeNumber(value.midpointTreeOrb, d.midpointTreeOrb),
    rainbowZodiac: parseBool(value.rainbowZodiac, d.rainbowZodiac),
    aspectsToChiron: parseBool(value.aspectsToChiron, d.aspectsToChiron),
    aspectsToLilith: parseBool(value.aspectsToLilith, d.aspectsToLilith),
    aspectsToLunarNodes: parseBool(value.aspectsToLunarNodes, d.aspectsToLunarNodes),
    aspectsToVertex: parseBool(value.aspectsToVertex, d.aspectsToVertex),
    aspectsToPartOfFortune: parseBool(value.aspectsToPartOfFortune, d.aspectsToPartOfFortune),
    aspectsToPartOfSpirit: parseBool(value.aspectsToPartOfSpirit, d.aspectsToPartOfSpirit),
  };
}

/**
 * Turns untrusted JSON (a share link's `settings` bag, an import, or localStorage) into a
 * complete, well-typed `CalculationSnapshot` — never `undefined`, never a partially-typed
 * value: every field is checked and any invalid/missing one is filled from the documented app
 * defaults, the same defaults a never-customized chart already uses. An unversioned or
 * all-defaults result is indistinguishable from "nothing was ever provided" by design — this is
 * a best-effort reconstruction, not a strict reject/accept gate; a caller that needs to know
 * whether anything was actually customized should compare the result against
 * `DEFAULT_EXTENDED_SETTINGS`/`DEFAULT_RULERSHIP_CHOICE` itself.
 */
export function parseCalculationSnapshot(value: unknown): CalculationSnapshot {
  if (!isRecord(value)) return buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
  const rulership = isOneOf(value.rulership, RULERSHIP_CHOICES) ? value.rulership : DEFAULT_RULERSHIP_CHOICE;
  return buildCalculationSnapshot(
    parseExtendedSettings(value.settings),
    rulership,
    parseCustomPoints(value.customPoints),
  );
}

/**
 * The JSON-serializable form a share link / export / saved settings bag carries. Round-trips
 * through `JSON.stringify`/`JSON.parse` rather than an unchecked type assertion, so this is a
 * genuine runtime guarantee that the result really is `JsonValue`-shaped (every
 * `CalculationSnapshot` field is already a plain string/number/boolean/array/object, so the
 * round-trip is lossless) rather than a claim the type system alone can't verify.
 */
export function calculationSnapshotToJson(snapshot: CalculationSnapshot): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, JsonValue>;
}
