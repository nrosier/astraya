/**
 * Which Extended settings sit under a tab's collapsed Advanced group (#856, owner decisions of 2026-10-28 and
 * 2026-11-06), and how many of a tab's Advanced values differ from the active profile's baseline.
 *
 * Grouping is display only: every setting stays in the draft whether its group is open or closed, so Apply never
 * overwrites a value the reader cannot see. A closed group says how many of its values are customised, measured
 * against the baseline of the calculation profile the draft is closest to (so Traditional Western's Whole Sign is not
 * "customised" under that profile). The group never opens by itself: its open or closed state is a device preference.
 *
 * The placement table is typed over every `ExtendedSettings` key, so a new setting cannot be added without choosing
 * where it lives.
 */
/**
 * @module ui/settings-groups
 * @purpose Pure placement of each Extended setting on a first screen, in a tab's Advanced group or on the Display tab, and the per-tab count of Advanced values that differ from the active profile's baseline.
 * @conventions No React, no storage. `PLACEMENT` is exhaustive over `keyof ExtendedSettings` at compile time. A value is compared as canonical JSON. The orb scale counts only when it sits between the three named steps, because on a step the first-screen segment already shows it.
 * @exports AdvancedTab, ADVANCED_TABS, isAdvancedTab, SettingPlacement, PLACEMENT, advancedFields, ORB_SCALE_SEGMENTS, baselineSettings, customisedCount
 */
import {
  applyCalculationProfile,
  CALCULATION_PROFILE_IDS,
  type CalculationProfileId,
} from '../chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';

/** The tabs of the Extended settings drawer that have an Advanced group. The Display tab has none (it is appearance). */
export const ADVANCED_TABS = ['profile', 'bodies', 'special'] as const;
export type AdvancedTab = (typeof ADVANCED_TABS)[number];

export function isAdvancedTab(value: unknown): value is AdvancedTab {
  return ADVANCED_TABS.some((tab) => tab === value);
}

/** Where a setting is edited: always on a first screen, in a tab's Advanced group, or on the Display tab. */
export type SettingPlacement = 'first' | 'display' | AdvancedTab;

/**
 * Every Extended setting, and where it lives. `houseSystem` is `first` because the first-screen select always shows
 * the current system (Placidus, Whole Sign and the selected one); the Advanced group holds the same field's full list.
 */
export const PLACEMENT: Readonly<Record<keyof ExtendedSettings, SettingPlacement>> = {
  houseSystem: 'first',
  zodiac: 'first',
  orbRules: 'first',
  midpointsVisible: 'first',
  rainbowZodiac: 'display',
  boundsScheme: 'profile',
  orbScalePercent: 'bodies',
  enabledMinorAspects: 'bodies',
  objectPolicies: 'bodies',
  lilithVariant: 'special',
  nodeVariant: 'special',
  antisciaVisible: 'special',
  antisciaMaxOrb: 'special',
  declinationVisible: 'special',
  declinationMaxOrb: 'special',
  dial90Visible: 'special',
  midpointTreeOrb: 'special',
  stationWindow: 'special',
  motionScore: 'special',
};

/** The settings a tab's Advanced group holds. */
export function advancedFields(tab: AdvancedTab): readonly (keyof ExtendedSettings)[] {
  return (Object.keys(PLACEMENT) as (keyof ExtendedSettings)[]).filter((field) => PLACEMENT[field] === tab);
}

/** The orb scale's three named steps (#824): the first-screen segment's values, and the only ones it can show. */
export const ORB_SCALE_SEGMENTS = [
  { value: 'tight', label: '-50%', percent: -50 },
  { value: 'standard', label: '0%', percent: 0 },
  { value: 'wide', label: '+40%', percent: 40 },
] as const;

/** The profile fields a profile defines, used to find the profile a draft is closest to. */
const PROFILE_FIELDS: readonly (keyof ExtendedSettings)[] = [
  'zodiac',
  'houseSystem',
  'orbScalePercent',
  'enabledMinorAspects',
  'lilithVariant',
  'nodeVariant',
  'objectPolicies',
  'midpointsVisible',
];

/** A stable text for comparing two values of one setting, whatever order their keys were written in. */
function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Readonly<Record<string, unknown>>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

function differs(field: keyof ExtendedSettings, a: ExtendedSettings, b: ExtendedSettings): boolean {
  // An aspect list is a set: the same aspects in another order are the same choice.
  if (field === 'enabledMinorAspects') return [...a[field]].sort().join() !== [...b[field]].sort().join();
  return canonical(a[field]) !== canonical(b[field]);
}

/**
 * The settings the draft's profile would have: the built-in profile the draft matches, or when it matches none the
 * one it differs from least, applied to the Astraya defaults. A profile does not define the bounds scheme or the
 * special-point settings, so those compare against the defaults.
 */
export function baselineSettings(draft: ExtendedSettings): ExtendedSettings {
  let best: CalculationProfileId | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const id of CALCULATION_PROFILE_IDS) {
    const candidate = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, id);
    const score = PROFILE_FIELDS.filter((field) => differs(field, draft, candidate)).length;
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best === undefined ? DEFAULT_EXTENDED_SETTINGS : applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, best);
}

/**
 * How many values in a tab's Advanced group differ from the baseline, plus `extra` (values kept outside the settings
 * object, such as the formula points on the Bodies tab). Zero means the closed group hides nothing customised.
 */
export function customisedCount(tab: AdvancedTab, draft: ExtendedSettings, extra = 0): number {
  const baseline = baselineSettings(draft);
  const hidden = advancedFields(tab).filter((field) => {
    if (
      field === 'orbScalePercent' &&
      ORB_SCALE_SEGMENTS.some((segment) => segment.percent === draft.orbScalePercent)
    ) {
      return false;
    }
    return differs(field, draft, baseline);
  });
  return hidden.length + extra;
}
