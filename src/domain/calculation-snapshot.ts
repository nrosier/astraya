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
 * @purpose Defines a versioned, fully-validated CalculationSnapshot (settings + rulership) and the pure functions that build/parse/serialize one.
 * @conventions `version` is bumped only when the *shape* a snapshot must satisfy changes incompatibly; `parseCalculationSnapshot` never throws — an invalid or missing field is filled from the documented app defaults, the same defaults a never-customized chart already shows.
 * @exports CURRENT_SNAPSHOT_VERSION, CalculationSnapshot, buildCalculationSnapshot, parseCalculationSnapshot, calculationSnapshotToJson
 */
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE, RULERSHIP_CHOICES, type RulershipChoice } from '../astrology/rulership.js';
import type { Zodiac } from '../ephemeris/types.js';
import type { JsonValue } from '../store/ops.js';

export const CURRENT_SNAPSHOT_VERSION = 1;

export interface CalculationSnapshot {
  readonly version: typeof CURRENT_SNAPSHOT_VERSION;
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
}

export function buildCalculationSnapshot(settings: ExtendedSettings, rulership: RulershipChoice): CalculationSnapshot {
  return { version: CURRENT_SNAPSHOT_VERSION, settings, rulership };
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

function parseStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Every field checked individually, never trusting the shape as a whole — a `settings` bag
 * that is merely "some object" (the old `isDefaultCalculationProfile` guard's entire check)
 * can still have missing or wrong-typed fields; each one here is filled from the app default
 * for that one field specifically rather than the whole object being rejected.
 */
function parseExtendedSettings(value: unknown): ExtendedSettings {
  if (!isRecord(value)) return DEFAULT_EXTENDED_SETTINGS;
  const d = DEFAULT_EXTENDED_SETTINGS;
  return {
    houseSystem: typeof value.houseSystem === 'string' ? value.houseSystem : d.houseSystem,
    zodiac: parseZodiac(value.zodiac),
    orbScalePercent: typeof value.orbScalePercent === 'number' ? value.orbScalePercent : d.orbScalePercent,
    boundsScheme: isOneOf(value.boundsScheme, ['egyptian', 'ptolemaic'] as const) ? value.boundsScheme : d.boundsScheme,
    enabledMinorAspects:
      value.enabledMinorAspects === undefined ? d.enabledMinorAspects : parseStringArray(value.enabledMinorAspects),
    lilithVariant: isOneOf(value.lilithVariant, ['mean', 'true', 'interpolated'] as const)
      ? value.lilithVariant
      : d.lilithVariant,
    nodeVariant: isOneOf(value.nodeVariant, ['mean', 'true'] as const) ? value.nodeVariant : d.nodeVariant,
    fortuneVisible: parseBool(value.fortuneVisible, d.fortuneVisible),
    vertexVisible: parseBool(value.vertexVisible, d.vertexVisible),
    chironVisible: parseBool(value.chironVisible, d.chironVisible),
    spiritVisible: parseBool(value.spiritVisible, d.spiritVisible),
    midpointsVisible: parseBool(value.midpointsVisible, d.midpointsVisible),
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
  return buildCalculationSnapshot(parseExtendedSettings(value.settings), rulership);
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
