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
 * @conventions `version` is bumped only when the *shape* a snapshot must satisfy changes incompatibly; `parseCalculationSnapshot` never throws — an invalid or missing field is filled from the documented app defaults, the same defaults a never-customized chart already shows (for a device's own saved default); `decodeCalculationSnapshot` is the strict, version-dispatched gate for payloads from outside the device (#717) and refuses rather than repairs; strict validation checks registered house systems, aspect keys, and bounds schemes against canonical registries.
 * @exports CURRENT_SNAPSHOT_VERSION, CalculationSnapshot, buildCalculationSnapshot, snapshotCalculationOptions, calculationSnapshotIdentity, parseCalculationSnapshot, decodeCalculationSnapshot, SnapshotDecodeError, SNAPSHOT_ORB_SCALE_RANGE, calculationSnapshotToJson
 */
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  type ExtendedSettings,
} from '../chart/extended-settings.js';
import {
  DEFAULT_OBJECT_POLICIES,
  OBJECT_KEYS,
  type ObjectKey,
  type ObjectPolicies,
  type ObjectPolicy,
} from '../chart/object-policy.js';
import type { ChartCalculationOptions } from './chart-compute.js';
import { DEFAULT_RULERSHIP_CHOICE, RULERSHIP_CHOICES, type RulershipChoice } from '../astrology/rulership.js';
import { ayanamsaById } from '../astrology/ayanamsas.js';
import { houseSystemByCode } from '../astrology/houses.js';
import { aspectByKey } from '../astrology/aspects.js';
import { validateOrbRules } from '../astrology/orb-profiles.js';
import type { Zodiac } from '../ephemeris/types.js';
import type { JsonValue } from '../store/ops.js';
import type { CustomPointDefinition } from './person.js';

/**
 * 2 (#582): adds `customPoints`. 3 (#585): the eleven scattered point-visibility/`aspectsTo*`
 * booleans collapse into one `objectPolicies` field — a breaking shape change per this file's
 * own versioning policy, even though `parseExtendedSettings` keeps reading an old-shaped
 * snapshot losslessly via `objectPoliciesFromLegacyFields` below, so no existing share link or
 * saved default actually changes behavior. #721's optional `ObjectPolicy.interpreted` is not a
 * bump: absent means included, so every existing snapshot reads back unchanged and one with no exclusions
 * serializes byte for byte as before. A v1 snapshot (or a pre-#541 link with no version at
 * all) still parses — it simply had no way to carry formula points, so it reads back with none.
 */
export const CURRENT_SNAPSHOT_VERSION = 3;

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

/** The orb-scale slider's own bounds (`ExtendedSettingsPanel`), and `orb-library`'s: a percentage outside it was never producible. */
export const SNAPSHOT_ORB_SCALE_RANGE = { min: -90, max: 90 } as const;

/**
 * Validate snapshot version matches the current schema version. Rejects unsupported
 * versions with a descriptive error rather than silently defaulting.
 */
export function validateSnapshotVersion(version: unknown): version is typeof CURRENT_SNAPSHOT_VERSION {
  return version === CURRENT_SNAPSHOT_VERSION;
}

function isOrbScale(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= SNAPSHOT_ORB_SCALE_RANGE.min &&
    value <= SNAPSHOT_ORB_SCALE_RANGE.max
  );
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

function isRegisteredAyanamsa(value: unknown): value is number {
  return typeof value === 'number' && ayanamsaById(value) !== undefined;
}

function parseZodiac(value: unknown): Zodiac {
  if (isRecord(value) && value.kind === 'sidereal' && isRegisteredAyanamsa(value.ayanamsa)) {
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

function parseObjectPolicy(value: unknown, fallback: ObjectPolicy): ObjectPolicy {
  if (!isRecord(value)) return fallback;
  return {
    visible: parseBool(value.visible, fallback.visible),
    aspectParticipant: parseBool(value.aspectParticipant, fallback.aspectParticipant),
    // Only an explicit exclusion is carried (#721); absent means included, so a default round-trips byte for byte.
    ...(value.interpreted === false ? { interpreted: false } : {}),
  };
}

/**
 * Reconstructs #585's unified `ObjectPolicies` from the pre-#585 scattered fields a share link,
 * saved default or export made before this shipped still carries, so it keeps parsing to the
 * identical effective policy rather than silently resetting to the new defaults. Only used when
 * `objectPolicies` itself is absent (`parseObjectPolicies` below) — a snapshot that already has
 * the new field never consults this.
 */
function objectPoliciesFromLegacyFields(value: Record<string, unknown>): ObjectPolicies {
  const legacyModernVisibility = isRecord(value.modernPointVisibility) ? value.modernPointVisibility : {};
  const visible = (key: ObjectKey, fallback: boolean): boolean => {
    if (key in legacyModernVisibility) return parseBool(legacyModernVisibility[key], fallback);
    if (key === 'chiron') return parseBool(value.chironVisible, fallback);
    if (key === 'vertex') return parseBool(value.vertexVisible, fallback);
    if (key === 'partOfFortune') return parseBool(value.fortuneVisible, fallback);
    if (key === 'partOfSpirit') return parseBool(value.spiritVisible, fallback);
    return fallback; // Sun..Pluto: no legacy field existed, so they always defaulted visible.
  };
  const participant = (key: ObjectKey, fallback: boolean): boolean => {
    if (key === 'chiron') return parseBool(value.aspectsToChiron, fallback);
    if (key === 'meanLilith' || key === 'osculatingLilith' || key === 'interpolatedLilith') {
      return parseBool(value.aspectsToLilith, fallback);
    }
    if (key === 'meanNode' || key === 'trueNode') return parseBool(value.aspectsToLunarNodes, fallback);
    if (key === 'vertex') return parseBool(value.aspectsToVertex, fallback);
    if (key === 'partOfFortune') return parseBool(value.aspectsToPartOfFortune, fallback);
    if (key === 'partOfSpirit') return parseBool(value.aspectsToPartOfSpirit, fallback);
    return fallback; // Sun..Pluto and the four asteroids: no participation gate existed at all.
  };
  return Object.fromEntries(
    OBJECT_KEYS.map((key) => [
      key,
      {
        visible: visible(key, DEFAULT_OBJECT_POLICIES[key].visible),
        aspectParticipant: participant(key, DEFAULT_OBJECT_POLICIES[key].aspectParticipant),
      },
    ]),
  ) as ObjectPolicies;
}

/** Per-key, per-field repair when `value` already has the new shape; a full legacy-field migration when it doesn't. */
function parseObjectPolicies(value: unknown, legacySource: Record<string, unknown>): ObjectPolicies {
  if (isRecord(value)) {
    return Object.fromEntries(
      OBJECT_KEYS.map((key) => [key, parseObjectPolicy(value[key], DEFAULT_OBJECT_POLICIES[key])]),
    ) as ObjectPolicies;
  }
  return objectPoliciesFromLegacyFields(legacySource);
}

/**
 * Every field checked individually against canonical registries (house systems, aspect keys,
 * bounds schemes) rather than trusting the shape as a whole. A `settings` bag that is merely
 * "some object" can still have missing or wrong-typed fields; each one here is validated
 * against registered values and filled from the app default for that one field specifically
 * if validation fails.
 */
/**
 * Orb rules (#590) are parsed only when the whole bag is valid: a malformed part drops the rules
 * entirely rather than applying half of them. Empty rule sets are dropped too, so a settings bag
 * with no rules is byte-identical to one written before this field existed.
 */
function parseOrbRules(value: unknown): { orbRules?: NonNullable<ExtendedSettings['orbRules']> } {
  const rules = validateOrbRules(value);
  if (rules === undefined) return {};
  const hasAspects = Object.keys(rules.aspectOrbs).length > 0;
  const hasBodies = Object.keys(rules.bodyOrbs).length > 0;
  if (!hasAspects && !hasBodies) return {};
  return {
    orbRules: {
      ...(hasAspects ? { aspectOrbs: rules.aspectOrbs } : {}),
      ...(hasBodies ? { bodyOrbs: rules.bodyOrbs } : {}),
    },
  };
}

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
    orbScalePercent: isOrbScale(value.orbScalePercent) ? value.orbScalePercent : d.orbScalePercent,
    boundsScheme: isOneOf(value.boundsScheme, ['egyptian', 'ptolemaic'] as const) ? value.boundsScheme : d.boundsScheme,
    enabledMinorAspects: enabledMinorAspects.length > 0 ? enabledMinorAspects : d.enabledMinorAspects,
    lilithVariant: isOneOf(value.lilithVariant, ['mean', 'true', 'interpolated'] as const)
      ? value.lilithVariant
      : d.lilithVariant,
    nodeVariant: isOneOf(value.nodeVariant, ['mean', 'true'] as const) ? value.nodeVariant : d.nodeVariant,
    objectPolicies: parseObjectPolicies(value.objectPolicies, value),
    // An absent or invalid rules bag is simply no rules: the same result a never-customized chart
    // has. Validation happens here, so a snapshot's orb rules are always well-formed when used.
    ...parseOrbRules(value.orbRules),
    midpointsVisible: parseBool(value.midpointsVisible, d.midpointsVisible),
    antisciaVisible: parseBool(value.antisciaVisible, d.antisciaVisible),
    antisciaMaxOrb: parseNonNegativeNumber(value.antisciaMaxOrb, d.antisciaMaxOrb),
    declinationVisible: parseBool(value.declinationVisible, d.declinationVisible),
    declinationMaxOrb: parseNonNegativeNumber(value.declinationMaxOrb, d.declinationMaxOrb),
    dial90Visible: parseBool(value.dial90Visible, d.dial90Visible),
    midpointTreeOrb: parseNonNegativeNumber(value.midpointTreeOrb, d.midpointTreeOrb),
    rainbowZodiac: parseBool(value.rainbowZodiac, d.rainbowZodiac),
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

/** Why a payload from outside the device was refused instead of repaired (#717). */
export class SnapshotDecodeError extends Error {
  readonly code: 'unsupported-version' | 'invalid-field';

  constructor(code: 'unsupported-version' | 'invalid-field', message: string) {
    super(message);
    this.name = 'SnapshotDecodeError';
    this.code = code;
  }
}

const SNAPSHOT_BOUNDS_SCHEMES = ['egyptian', 'ptolemaic'] as const;
const SNAPSHOT_LILITH_VARIANTS = ['mean', 'true', 'interpolated'] as const;
const SNAPSHOT_NODE_VARIANTS = ['mean', 'true'] as const;

/** Each calculation-changing field that is *present* but not a registered/in-range value; an absent field is not a problem (older snapshots simply lacked it). */
function invalidSettingFields(settings: Record<string, unknown>): readonly string[] {
  const problems: string[] = [];
  const present = (key: string): boolean => settings[key] !== undefined;
  if (present('houseSystem') && !isValidHouseSystem(settings.houseSystem)) problems.push('houseSystem');
  if (present('zodiac')) {
    const zodiac = settings.zodiac;
    const tropical = isRecord(zodiac) && zodiac.kind === 'tropical';
    const sidereal = isRecord(zodiac) && zodiac.kind === 'sidereal' && isRegisteredAyanamsa(zodiac.ayanamsa);
    if (!tropical && !sidereal) problems.push('zodiac');
  }
  if (present('orbScalePercent') && !isOrbScale(settings.orbScalePercent)) problems.push('orbScalePercent');
  if (present('boundsScheme') && !isOneOf(settings.boundsScheme, SNAPSHOT_BOUNDS_SCHEMES))
    problems.push('boundsScheme');
  if (present('lilithVariant') && !isOneOf(settings.lilithVariant, SNAPSHOT_LILITH_VARIANTS)) {
    problems.push('lilithVariant');
  }
  if (present('nodeVariant') && !isOneOf(settings.nodeVariant, SNAPSHOT_NODE_VARIANTS)) problems.push('nodeVariant');
  if (present('enabledMinorAspects')) {
    const aspects = settings.enabledMinorAspects;
    if (!Array.isArray(aspects) || !aspects.every((key) => isValidAspect(key))) problems.push('enabledMinorAspects');
  }
  if (present('orbRules') && validateOrbRules(settings.orbRules) === undefined) problems.push('orbRules');
  return problems;
}

/**
 * The strict gate for a snapshot that arrives from outside this device — a share link or an
 * import (#717). Unlike {@link parseCalculationSnapshot}, which repairs a device's own saved
 * default field by field, this refuses anything it would otherwise have to guess at:
 * - a `version` newer than this app understands, or not a positive whole number, is an
 *   `'unsupported-version'` error, never read as the current schema;
 * - a calculation-changing field that is present but unregistered or out of range (house
 *   system, ayanamsa, orb scale, bounds scheme, Lilith/node variant, minor aspects, orb rules)
 *   is an `'invalid-field'` error naming it, never a silent swap for the app default.
 *
 * Versions 1 and 2, and a payload with no `version` at all (a pre-#541 link), migrate
 * deterministically: they simply lack the fields later versions added, which read as their
 * documented defaults — v1 had no way to carry custom points, and a pre-#585 bag still carries
 * the scattered visibility fields `parseCalculationSnapshot` folds into `objectPolicies`.
 * A missing or non-object payload is the historical "nothing was carried" case: app defaults.
 */
export function decodeCalculationSnapshot(value: unknown): CalculationSnapshot {
  if (!isRecord(value)) return parseCalculationSnapshot(value);
  const { version } = value;
  if (version !== undefined) {
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new SnapshotDecodeError(
        'unsupported-version',
        `The snapshot version ${JSON.stringify(version)} is not valid.`,
      );
    }
    if (version > CURRENT_SNAPSHOT_VERSION) {
      throw new SnapshotDecodeError(
        'unsupported-version',
        `This chart was made by a newer version of Astraya (snapshot v${String(version)}) than this one understands (v${String(CURRENT_SNAPSHOT_VERSION)}). Open it in an up-to-date copy of the app.`,
      );
    }
  }
  if (value.rulership !== undefined && !isOneOf(value.rulership, RULERSHIP_CHOICES)) {
    throw new SnapshotDecodeError('invalid-field', 'The snapshot names an unknown rulership choice (rulership).');
  }
  if (isRecord(value.settings)) {
    const problems = invalidSettingFields(value.settings);
    if (problems.length > 0) {
      throw new SnapshotDecodeError(
        'invalid-field',
        `The snapshot carries values this app does not recognise (${problems.join(', ')}).`,
      );
    }
  }
  return parseCalculationSnapshot(value);
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
