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
 * @exports FixedStarParansSetting, FIXED_STAR_PARAN_ORB_DEFAULT, FIXED_STAR_PARAN_ORB_MAX, isParanOrb, isAngleEvent, canonicalParanEvents, DEFAULT_FIXED_STAR_PARANS, withoutFixedStarParans, DEFAULT_EXTENDED_SETTINGS, orbsOf, withOrbsOf, withoutStationWindow, withMotionScore, withPolarMc, settingsForContext, toChartCalculationOptions, toPointVisibilityOptions, toSignWedgeStyle; ExtendedSettings type.
 */
import { DEFAULT_ORB_CONFIG, type OrbConfig, type OrbRule } from '../astrology/aspects.js';
import type { BoundsScheme } from '../astrology/bounds.js';
import { DEFAULT_FORTUNE_FORMULA, type FortuneFormula } from '../astrology/arabic-parts.js';
import { ANGLE_EVENTS, type AngleEvent } from '../astrology/fixed-stars.js';
import {
  CARD_SOURCE,
  orbSettingsFor,
  sourceForContext,
  type OrbContextSource,
  type OrbLibrary,
} from '../astrology/orb-library.js';
import type { ChartCalculationOptions } from '../domain/chart-compute.js';
import type { PointVisibilityOptions } from '../domain/chart-tables.js';
import { DEFAULT_POLAR_MC } from '../ephemeris/polar-mc.js';
import type { Degrees, HouseSystem, PolarMc, Zodiac } from '../ephemeris/types.js';
import { DEFAULT_OBJECT_POLICIES, OBJECT_KEYS, type ObjectKey, type ObjectPolicies } from './object-policy.js';
import type { SignWedgeStyle } from './wheel.js';

export interface ExtendedSettings {
  readonly houseSystem: HouseSystem;
  /**
   * Solar Fire's "MC in Polar Regions" (#2012; guide section 30.3.1.6): which of the two meridian points is the MC
   * where Regiomontanus and Campanus houses are cast at polar latitudes. Saved with the chart, so a chart keeps the
   * convention it was calculated with. Absent is the default, 'towardsEquator' (`DEFAULT_POLAR_MC`): the stored form
   * keeps a default chart's snapshot identity and register byte for byte as before, like `fortuneFormula`.
   */
  readonly polarMc?: PolarMc;
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
   * Part of Fortune / Spirit day-night formula (#1794). The stored value is either absent or `'same-day-and-night'`
   * (Marr): absent is the default `DEFAULT_FORTUNE_FORMULA` (`'sect-reversed'`, Paulus). The type is `FortuneFormula`,
   * so `'sect-reversed'` is accepted on input; `normalizeFortuneFormula` (calculation-snapshot) removes it before any
   * snapshot, identity, artifact hash or register sees it.
   */
  readonly fortuneFormula?: FortuneFormula;
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
  /**
   * Orb for the dial90 midpoint-tree table above, in degrees on the dial scale. The 1° default is Astraya's own and,
   * on the 90° dial, 4 times wider than Solar Fire's initial 1°00′, which is measured on the 360° circle
   * (`docs/domain/SOLAR_FIRE_DIFFERENCES.md`; #2045 changes it to match).
   */
  readonly midpointTreeOrb: Degrees;
  readonly rainbowZodiac: boolean;
  /**
   * The station window (#724): when present, a planet with |longitudeSpeed| at most `k` times its mean daily speed is
   * stationary, and marked first or second station. **An Astraya convention**, uncited (Avelar & Ribeiro give no
   * threshold). Absent, the default, means off, so the settings and every calculation are as before.
   */
  readonly stationWindow?: { readonly k: number };
  /**
   * Show the motion score on the condition table (#724): a display-only setting that changes no calculated value and
   * never the Almuten. Absent or `false` means off, the default.
   */
  readonly motionScore?: boolean;
  /**
   * The fixed-star paran table (#1407; Solar Fire Deluxe guide §21.1.2): present means on, absent (the default) means
   * off, so every existing settings bag, snapshot and chart calculation is as before. `orb` is the paran orb in degrees
   * of sidereal time, 0-10 as Solar Fire lets the user enter it; its default of 1 degree is the owner's choice
   * (2026-11-21), since Solar Fire states none. `events` are the angle events a paran may use, in the canonical order of
   * `ANGLE_EVENTS`: a paran is listed only when both its events are in the set, as in Solar Fire's "Parans to Use".
   */
  readonly fixedStarParans?: FixedStarParansSetting;
}

/** The fixed-star paran table's own settings (#1407): the orb and the angle events a paran may use. */
export interface FixedStarParansSetting {
  readonly orb: Degrees;
  readonly events: readonly AngleEvent[];
}

/** The paran orb a newly switched-on table starts with: 1 degree, the owner's choice (#1407, 2026-11-21). */
export const FIXED_STAR_PARAN_ORB_DEFAULT: Degrees = 1;
/** The widest paran orb Solar Fire lets the user enter (guide ch. 21, "any orb may be entered from 0 to 10 degrees"). */
export const FIXED_STAR_PARAN_ORB_MAX: Degrees = 10;

/** Whether `value` is a usable paran orb: a finite number from 0 to `FIXED_STAR_PARAN_ORB_MAX` degrees. */
export function isParanOrb(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= FIXED_STAR_PARAN_ORB_MAX;
}

/** Whether `value` is one of the four angle events a paran can use. */
export function isAngleEvent(value: unknown): value is AngleEvent {
  return typeof value === 'string' && (ANGLE_EVENTS as readonly string[]).includes(value);
}

/** The paran events in canonical order, without duplicates or anything that is not an angle event. */
export function canonicalParanEvents(events: readonly unknown[]): readonly AngleEvent[] {
  return ANGLE_EVENTS.filter((event) => events.includes(event));
}

/** The settings of a switched-on paran table: one degree, every event. */
export const DEFAULT_FIXED_STAR_PARANS: FixedStarParansSetting = {
  orb: FIXED_STAR_PARAN_ORB_DEFAULT,
  events: ANGLE_EVENTS,
};

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

/**
 * `settings` with the station window switched off (#724), by removing the field rather than storing `undefined`: an
 * absent field is the off state, and the canonical form every serializer and comparison relies on.
 */
export function withoutStationWindow(settings: ExtendedSettings): ExtendedSettings {
  const copy = { ...settings };
  delete copy.stationWindow;
  return copy;
}

/**
 * `settings` with the fixed-star paran table switched off (#1407), by removing the field rather than storing
 * `undefined`: an absent field is the off state, and the canonical form every serializer and comparison relies on.
 */
export function withoutFixedStarParans(settings: ExtendedSettings): ExtendedSettings {
  const copy = { ...settings };
  delete copy.fixedStarParans;
  return copy;
}

/** `settings` with the polar MC convention set (#2012), keeping the canonical form: the default is the field absent. */
export function withPolarMc(settings: ExtendedSettings, polarMc: PolarMc): ExtendedSettings {
  const copy = { ...settings };
  delete copy.polarMc;
  return polarMc === DEFAULT_POLAR_MC ? copy : { ...copy, polarMc };
}

/** `settings` with the motion score set (#724), keeping the canonical form: off is the field absent, not `false`. */
export function withMotionScore(settings: ExtendedSettings, on: boolean): ExtendedSettings {
  const copy = { ...settings };
  delete copy.motionScore;
  return on ? { ...copy, motionScore: true } : copy;
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
  const pholus = settings.objectPolicies.pholus;
  return {
    houseSystem: settings.houseSystem,
    polarMc: settings.polarMc ?? DEFAULT_POLAR_MC,
    zodiac: settings.zodiac,
    orbConfig,
    lilithVariant: settings.lilithVariant,
    nodeVariant: settings.nodeVariant,
    fortuneFormula: settings.fortuneFormula ?? DEFAULT_FORTUNE_FORMULA,
    aspectsTo,
    // Pholus (#804) is computed only when the user turned it on, so every other chart's options are unchanged.
    ...(pholus.visible || pholus.aspectParticipant ? { includePholus: true } : {}),
    ...(settings.stationWindow === undefined ? {} : { stationWindow: settings.stationWindow }),
    // The star and body equatorial coordinates the paran table needs are computed only when it is on (#1407).
    ...(settings.fixedStarParans === undefined ? {} : { paranStars: true }),
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
    motionScoreVisible: settings.motionScore === true,
    ...(settings.fixedStarParans === undefined ? {} : { fixedStarParans: settings.fixedStarParans }),
  };
}

/** The half that only changes the wheel's cosmetic sign-wedge fill. */
export function toSignWedgeStyle(settings: ExtendedSettings): SignWedgeStyle {
  return settings.rainbowZodiac ? 'rainbow' : 'default';
}
