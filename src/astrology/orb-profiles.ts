/**
 * Named, versioned orb-scale presets layered on `aspects.ts`'s already fully configurable
 * `OrbConfig` (#543), so a user can pick "Tight" or "Wide" by name instead of hand-tuning the
 * raw scale percentage, and a tighter documented default for synastry — comparing two
 * independently-real natal charts does not carry the same "this aspect matters across a
 * lifetime" argument a single chart's own aspects do, and reusing the natal default there
 * reports too many loosely-related contacts to be useful.
 *
 * The built-ins never ship a per-body "moiety" (a half-orb owned by each planet, summed per pair):
 * every classical moiety table checked carried numbers that could not be verified against a
 * citable primary source, and CLAUDE.md's domain-integrity rule would rather a value be absent
 * than guessed at. #590 adds the *mechanism* (`OrbConfig.bodyOrbs`, `OrbRulesValue`) so a practitioner
 * can enter their own moieties; a built-in moiety preset waits for a cited source.
 */
/**
 * @module astrology/orb-profiles
 * @purpose Named, versioned orb presets over aspects.ts's OrbConfig (Standard/Tight/Wide), the synastry scale offset, and validated per-aspect and per-body orb rules (#590).
 * @conventions Built-ins are immutable: a changed value gets a new id, and `revision` counts revisions. A built-in's source is `null`-locator until a passage is cited in docs/references. Rules are validated as a whole: malformed input yields `undefined`, never a partial set.
 * @exports OrbProfileId, ORB_PROFILE_IDS, OrbProfileSource, OrbProfile, ORB_PROFILES, orbConfigForProfile, matchOrbProfile, SYNASTRY_SCALE_OFFSET, SYNASTRY_DEFAULT_ORB_CONFIG, OrbContext, ORB_CONTEXTS, OrbRulesValue, validateOrbRules, orbConfigForContext
 */
import { aspectByKey, DEFAULT_ORB_CONFIG, type OrbConfig, type OrbRule } from './aspects.js';
import { bodyByKey } from './bodies.js';
import { TRANSIT_ORB_CONFIG } from './transit-importance.js';

export type OrbProfileId = 'standard-v1' | 'tight-v1' | 'wide-v1';

export const ORB_PROFILE_IDS: readonly OrbProfileId[] = ['standard-v1', 'tight-v1', 'wide-v1'];

/**
 * Where a profile's numbers come from (#590). A built-in's `authority` says it is an Astraya
 * default rather than a named historical source, and `locator` is `null` until a specific,
 * citable passage has been extracted into `docs/references/`.
 */
export interface OrbProfileSource {
  readonly authority: string;
  readonly locator: string | null;
}

export interface OrbProfile {
  readonly id: OrbProfileId;
  /** Bumped when a built-in's values change; a changed profile gets a new id rather than editing in place. */
  readonly revision: number;
  readonly name: string;
  readonly description: string;
  readonly source: OrbProfileSource;
  readonly config: OrbConfig;
}

const ASTRAYA_DEFAULT_SOURCE: OrbProfileSource = {
  authority: 'Astraya default; no published source has been verified for these numbers',
  locator: null,
};

export const ORB_PROFILES: Readonly<Record<OrbProfileId, OrbProfile>> = {
  'standard-v1': {
    id: 'standard-v1',
    revision: 1,
    name: 'Standard',
    description:
      "This app's long-standing default tiers, unscaled: majors 7°/10° with a luminary, sextile 4°/5°30', minors flat 2°30'.",
    source: ASTRAYA_DEFAULT_SOURCE,
    config: DEFAULT_ORB_CONFIG,
  },
  'tight-v1': {
    id: 'tight-v1',
    revision: 1,
    name: 'Tight',
    description:
      'The standard tiers scaled down by half, for a reading that only wants to see the closest, most clearly active contacts.',
    source: ASTRAYA_DEFAULT_SOURCE,
    config: { ...DEFAULT_ORB_CONFIG, scalePercent: -50 },
  },
  'wide-v1': {
    id: 'wide-v1',
    revision: 1,
    name: 'Wide',
    description:
      'The standard tiers scaled up by 40%, for a reading that wants to catch looser, still-forming contacts too.',
    source: ASTRAYA_DEFAULT_SOURCE,
    config: { ...DEFAULT_ORB_CONFIG, scalePercent: 40 },
  },
};

export function orbConfigForProfile(id: OrbProfileId): OrbConfig {
  return ORB_PROFILES[id].config;
}

/**
 * Which named profile a given orb scale matches exactly, or `undefined` for "Custom" — the same
 * "Custom means no exact match" convention `chart/calculation-profiles.ts`'s `matchCalculationProfile`
 * uses. Compares only `scalePercent`, the one field these profiles vary — `enabledMinorAspects`
 * stays its own independent setting, exactly as `ExtendedSettings` already treats the two.
 */
export function matchOrbProfile(scalePercent: number): OrbProfileId | undefined {
  return ORB_PROFILE_IDS.find((id) => ORB_PROFILES[id].config.scalePercent === scalePercent);
}

/**
 * Synastry's own default when no caller supplies an explicit `OrbConfig` (#543) — tighter than
 * `DEFAULT_ORB_CONFIG`, which this app's natal chart, progressions, directions and returns all
 * share by default. Picked here as a documented, overridable default rather than a specific
 * named source's exact numbers: every synastry-specific orb table checked while implementing
 * this varies by author, so the scale percentage below is this app's own choice, not a citation.
 */
/**
 * Synastry's scale offset from the orbs in force (#543): a 30% tighter contact limit. An Astraya default
 * choice: no published synastry orb table has been verified for it (#590).
 */
export const SYNASTRY_SCALE_OFFSET = -30;

export const SYNASTRY_DEFAULT_ORB_CONFIG: OrbConfig = { ...DEFAULT_ORB_CONFIG, scalePercent: SYNASTRY_SCALE_OFFSET };

/**
 * The chart contexts that calculate orbs (#590, #543). Every chart uses the Extended settings' orbs
 * (`ExtendedSettings`), except synastry, which tightens them, and transit, which keeps the three minor
 * aspects its filter can show even when the chart's own minors are off.
 */
export type OrbContext = 'natal' | 'transit' | 'synastry';

export const ORB_CONTEXTS: readonly OrbContext[] = ['natal', 'transit', 'synastry'];

/** Bounds on a user-entered orb (#590): wide enough for any practitioner's rule, narrow enough to reject a typo'd magnitude. */
const MAX_CUSTOM_ORB_DEG = 30;

/** The per-aspect and per-body rules a settings bag may carry, validated (#590). */
export interface OrbRulesValue {
  readonly aspectOrbs: Readonly<Record<string, OrbRule>>;
  readonly bodyOrbs: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOrbDegrees(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_CUSTOM_ORB_DEG;
}

/**
 * Validates a practitioner's per-aspect and per-body orb rules (#590). Used wherever rules come in
 * from outside: the Extended settings card, a share link, a saved default. A malformed part makes the
 * whole set `undefined`, never a partial set. Keys are checked against the aspect and body registries.
 */
export function validateOrbRules(value: unknown): OrbRulesValue | undefined {
  if (!isRecord(value)) return undefined;
  const { aspectOrbs, bodyOrbs } = value;

  const cleanAspects: Record<string, OrbRule> = {};
  if (aspectOrbs !== undefined) {
    if (!isRecord(aspectOrbs)) return undefined;
    for (const [key, rule] of Object.entries(aspectOrbs)) {
      if (aspectByKey(key) === undefined || !isRecord(rule)) return undefined;
      const { base, luminaryBonus } = rule;
      if (!isOrbDegrees(base) || !isOrbDegrees(luminaryBonus)) return undefined;
      cleanAspects[key] = { base, luminaryBonus };
    }
  }

  const cleanBodies: Record<string, number> = {};
  if (bodyOrbs !== undefined) {
    if (!isRecord(bodyOrbs)) return undefined;
    for (const [key, degrees] of Object.entries(bodyOrbs)) {
      if (bodyByKey(key) === undefined || !isOrbDegrees(degrees)) return undefined;
      cleanBodies[key] = degrees;
    }
  }

  return { aspectOrbs: cleanAspects, bodyOrbs: cleanBodies };
}

/**
 * The orbs a context calculates with, given the orbs the Extended settings put in force (#590, #543).
 * Natal and returns use them as they are. Synastry applies its own tighter scale on top, so a default
 * user sees the same synastry contacts as before. Transit keeps its own three minor aspects on, since
 * its filter shows them whatever the chart's minor-aspect setting is.
 */
export function orbConfigForContext(context: OrbContext, settings: OrbConfig): OrbConfig {
  if (context === 'synastry') return { ...settings, scalePercent: settings.scalePercent + SYNASTRY_SCALE_OFFSET };
  if (context === 'transit') return { ...settings, enabledMinorAspects: [...TRANSIT_ORB_CONFIG.enabledMinorAspects] };
  return settings;
}
