/**
 * The "Extended settings" panel's one settings bag, and the pure functions
 * that split it into the shapes its three consumers actually want (#52).
 *
 * `ExtendedSettingsPanel` edits one of these; `ChartView` holds the
 * confirmed value and, on every redraw, splits it three ways: the
 * compute-affecting half goes to `computeChartData` as `ChartCalculationOptions`,
 * the display-filter half goes to `chart-tables.ts`'s `PointVisibilityOptions`,
 * and the cosmetic half becomes the wheel's `signWedgeStyle`. Keeping the split
 * here, rather than inline in `ChartView`, means neither that component nor the
 * panel itself needs to know the shape of any of the three destinations.
 */
/**
 * @module chart/extended-settings
 * @purpose Defines the Extended settings panel's single settings bag (`ExtendedSettings`) and the pure split functions that derive each of its three consumers' own option shapes from it.
 * @conventions One settings object is split three ways rather than kept as three separate pieces of UI state: `toChartCalculationOptions` feeds `computeChartData`, `toPointVisibilityOptions` feeds `chart-tables.ts`'s display filtering, and `toSignWedgeStyle` feeds the wheel's cosmetic fill — keeping the split here means neither the panel component nor `ChartView` needs to know any destination's shape.
 * @exports DEFAULT_EXTENDED_SETTINGS, orbsOf, withOrbsOf, settingsForContext, toChartCalculationOptions, toPointVisibilityOptions, toSignWedgeStyle; ExtendedSettings type.
 */
import { DEFAULT_ORB_CONFIG, type OrbConfig, type OrbRule } from '../astrology/aspects.js';
import type { BoundsScheme } from '../astrology/bounds.js';
import {
  CARD_SOURCE,
  orbSettingsFor,
  sourceForContext,
  type OrbContextSource,
  type OrbLibrary,
} from '../astrology/orb-library.js';
import type { ChartCalculationOptions } from '../domain/chart-compute.js';
import type { PointVisibilityOptions } from '../domain/chart-tables.js';
import type { Degrees, HouseSystem, Zodiac } from '../ephemeris/types.js';
import { DEFAULT_OBJECT_POLICIES, OBJECT_KEYS, type ObjectKey, type ObjectPolicies } from './object-policy.js';
import type { SignWedgeStyle } from './wheel.js';

export interface ExtendedSettings {
  readonly houseSystem: HouseSystem;
  readonly zodiac: Zodiac;
  /** -90..90, matching `OrbConfig.scalePercent`. */
  readonly orbScalePercent: number;
  /**
   * Which bound (term) table the dignity/condition/reception/almuten tables use (#549) — not a
   * `computeChartData` input, since no bound lookup happens there; threaded directly into
   * `chart-tables.ts`'s own dignity-consuming functions instead of through `toChartCalculationOptions`.
   */
  readonly boundsScheme: BoundsScheme;
  /** Minor-aspect keys to consider; empty means every minor aspect is off. */
  readonly enabledMinorAspects: readonly string[];
  /**
   * The practitioner's own per-aspect and per-body orb rules (#590), copied by value into the
   * settings, so a chart's orbs are fixed by the settings it was drawn with. Absent (the default)
   * means the tiers apply unchanged.
   */
  readonly orbRules?: {
    readonly aspectOrbs?: Readonly<Record<string, OrbRule>>;
    readonly bodyOrbs?: Readonly<Record<string, number>>;
  };
  readonly lilithVariant: 'mean' | 'true' | 'interpolated';
  readonly nodeVariant: 'mean' | 'true';
  /**
   * Per-object visibility and aspect-participation (#585), covering every planet, node, Lilith
   * variant, Chiron, asteroid, and the Vertex/Fortune/Spirit points — replacing what used to be
   * eleven separate booleans with one policy keyed by `chart/object-policy.ts`'s `ObjectKey`.
   */
  readonly objectPolicies: ObjectPolicies;
  readonly midpointsVisible: boolean;
  /** Draw antiscion/contra-antiscion contacts as chords on the wheel (#556). */
  readonly antisciaVisible: boolean;
  /** Maximum antiscion/contra-antiscion orb shown on the wheel, in degrees. */
  readonly antisciaMaxOrb: Degrees;
  /** Draw parallel/contraparallel declination contacts as chords on the wheel (#556). */
  readonly declinationVisible: boolean;
  /** Maximum parallel/contraparallel declination orb shown on the wheel, in degrees. */
  readonly declinationMaxOrb: Degrees;
  /**
   * The 90°-dial midpoint-tree table's own visibility (#556) — the dial-collapsed midpoint
   * structure (`astrology/midpoints.ts`'s `midpointTree`) was already computed and even had a
   * dead SVG renderer (`chart/dial90.ts`), but no setting reached either; this is its first real
   * opt-in.
   */
  readonly dial90Visible: boolean;
  /** Orb for the dial90 midpoint-tree table above, in degrees. */
  readonly midpointTreeOrb: Degrees;
  readonly rainbowZodiac: boolean;
}

/** Placidus, tropical, every default as documented on `DEFAULT_ORB_CONFIG` and `DEFAULT_OBJECT_POLICIES` — matches what a chart looks like with the panel never opened. */
export const DEFAULT_EXTENDED_SETTINGS: ExtendedSettings = {
  houseSystem: 'P',
  zodiac: { kind: 'tropical' },
  orbScalePercent: 0,
  boundsScheme: 'egyptian',
  enabledMinorAspects: [],
  lilithVariant: 'mean',
  nodeVariant: 'mean',
  objectPolicies: DEFAULT_OBJECT_POLICIES,
  midpointsVisible: false,
  antisciaVisible: false,
  antisciaMaxOrb: 1,
  declinationVisible: false,
  declinationMaxOrb: 1,
  dial90Visible: false,
  midpointTreeOrb: 1,
  rainbowZodiac: false,
};

/** The orb options the Extended settings put in force (#590): the scale and the practitioner's own rules, always concrete. */
export function orbsOf(settings: ExtendedSettings): { readonly orbConfig: OrbConfig } {
  return { orbConfig: toChartCalculationOptions(settings).orbConfig ?? DEFAULT_ORB_CONFIG };
}

/**
 * `settings` with only its orb fields (#590) taken from `orbs`: the scale and the practitioner's own rules.
 * A screen whose footer names fixed engine defaults for everything else uses this, so the orbs it
 * calculates with are the device's and the rest of what it says stays true.
 */
export function withOrbsOf(settings: ExtendedSettings, orbs: ExtendedSettings): ExtendedSettings {
  const copy = { ...settings, orbScalePercent: orbs.orbScalePercent };
  delete copy.orbRules;
  return orbs.orbRules === undefined ? copy : { ...copy, orbRules: orbs.orbRules };
}

/**
 * The settings a chart context calculates with, given the device's orb library and per-context choice (#590).
 * With no choice made (the default), this is `settings` unchanged. When the context names a profile, that
 * profile's scale and rules replace the settings' orbs, copied by value so the chart records what it used.
 */
export function settingsForContext(
  settings: ExtendedSettings,
  context: keyof OrbContextSource,
  library: OrbLibrary,
  sources: OrbContextSource,
): ExtendedSettings {
  const choice = sourceForContext(library, sources, context);
  if (choice === CARD_SOURCE) return settings;
  const resolved = orbSettingsFor(library, choice, { scalePercent: settings.orbScalePercent });
  const copy: ExtendedSettings = { ...settings, orbScalePercent: resolved.scalePercent };
  delete (copy as { orbRules?: ExtendedSettings['orbRules'] }).orbRules;
  const aspectOrbs = resolved.aspectOrbs ?? {};
  const bodyOrbs = resolved.bodyOrbs ?? {};
  const hasAspects = Object.keys(aspectOrbs).length > 0;
  const hasBodies = Object.keys(bodyOrbs).length > 0;
  if (!hasAspects && !hasBodies) return copy;
  return {
    ...copy,
    orbRules: { ...(hasAspects ? { aspectOrbs } : {}), ...(hasBodies ? { bodyOrbs } : {}) },
  };
}

/** The half of `ExtendedSettings` that changes what `computeChartData` returns. */
export function toChartCalculationOptions(settings: ExtendedSettings): ChartCalculationOptions {
  const orbConfig: OrbConfig = {
    ...DEFAULT_ORB_CONFIG,
    scalePercent: settings.orbScalePercent,
    enabledMinorAspects: settings.enabledMinorAspects,
    ...(settings.orbRules?.aspectOrbs === undefined ? {} : { aspectOrbs: settings.orbRules.aspectOrbs }),
    ...(settings.orbRules?.bodyOrbs === undefined ? {} : { bodyOrbs: settings.orbRules.bodyOrbs }),
  };
  const aspectsTo = Object.fromEntries(
    OBJECT_KEYS.map((key) => [key, settings.objectPolicies[key].aspectParticipant]),
  ) as Record<ObjectKey, boolean>;
  return {
    houseSystem: settings.houseSystem,
    zodiac: settings.zodiac,
    orbConfig,
    lilithVariant: settings.lilithVariant,
    nodeVariant: settings.nodeVariant,
    aspectsTo,
  };
}

/** The half that only changes which already-computed points the tables/wheel show. */
export function toPointVisibilityOptions(settings: ExtendedSettings): PointVisibilityOptions {
  const bodyVisibility = Object.fromEntries(
    OBJECT_KEYS.map((key) => [key, settings.objectPolicies[key].visible]),
  ) as Record<ObjectKey, boolean>;
  return {
    bodyVisibility,
    midpointsVisible: settings.midpointsVisible,
    antisciaVisible: settings.antisciaVisible,
    antisciaMaxOrb: settings.antisciaMaxOrb,
    declinationVisible: settings.declinationVisible,
    declinationMaxOrb: settings.declinationMaxOrb,
    dial90Visible: settings.dial90Visible,
    midpointTreeOrb: settings.midpointTreeOrb,
  };
}

/** The half that only changes the wheel's cosmetic sign-wedge fill. */
export function toSignWedgeStyle(settings: ExtendedSettings): SignWedgeStyle {
  return settings.rainbowZodiac ? 'rainbow' : 'default';
}
