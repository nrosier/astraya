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
 * than guessed at. #590 adds the *mechanism* (`OrbConfig.bodyOrbs`, `CustomOrbProfile`) so a
 * practitioner can enter their own moieties; a built-in moiety preset waits for a cited source.
 */
/**
 * @module astrology/orb-profiles
 * @purpose Named, versioned orb profiles over aspects.ts's OrbConfig: the three built-ins (each with its revision and source), per-context defaults for natal/transit/synastry, and validated user-defined custom profiles (#590).
 * @conventions Built-ins are immutable: a changed value gets a new id, and `revision` counts revisions of a custom profile. A built-in's source is `null`-locator until a passage is cited in docs/references. Custom profiles hold plain objects only, never Set/Map, and are validated before use — malformed input yields `undefined`, not a partial profile. `'custom'` is not a profile here; it is the absence of a match from `matchOrbProfile`.
 * @exports OrbProfileId, ORB_PROFILE_IDS, OrbProfileSource, OrbProfile, ORB_PROFILES, orbConfigForProfile, matchOrbProfile, SYNASTRY_DEFAULT_ORB_CONFIG, OrbContext, ORB_CONTEXTS, ORB_CONTEXT_DEFAULTS, CustomOrbProfile, validateCustomOrbProfile, validateOrbRules, orbConfigFromCustom, orbConfigForContext
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
  authority: "Astraya default; tiers follow Astro-Seek's published defaults",
  locator: null,
};

export const ORB_PROFILES: Readonly<Record<OrbProfileId, OrbProfile>> = {
  'standard-v1': {
    id: 'standard-v1',
    revision: 1,
    name: 'Standard',
    description:
      "This app's long-standing default tiers, unscaled (Astro-Seek's own convention): majors 7°/10° with a luminary, sextile 4°/5°30', minors flat 2°30'.",
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
export const SYNASTRY_DEFAULT_ORB_CONFIG: OrbConfig = { ...DEFAULT_ORB_CONFIG, scalePercent: -30 };

/**
 * The chart contexts an orb profile can apply to (#590). Natal orbs live in `ExtendedSettings`;
 * transit and synastry each have a fixed default today, named here so they can be inspected and
 * overridden per context rather than being invisible constants.
 */
export type OrbContext = 'natal' | 'transit' | 'synastry';

export const ORB_CONTEXTS: readonly OrbContext[] = ['natal', 'transit', 'synastry'];

/** Each context's built-in default. `natal` is the Standard profile; transit and synastry are the constants above. */
export const ORB_CONTEXT_DEFAULTS: Readonly<Record<OrbContext, OrbConfig>> = {
  natal: DEFAULT_ORB_CONFIG,
  transit: TRANSIT_ORB_CONFIG,
  synastry: SYNASTRY_DEFAULT_ORB_CONFIG,
};

/** Bounds on a user-entered orb (#590): wide enough for any practitioner's rule, narrow enough to reject a typo'd magnitude. */
const MAX_CUSTOM_ORB_DEG = 30;
const SCALE_RANGE = { min: -90, max: 90 } as const;

/**
 * A practitioner's own orb rules, saved as an immutable value (#590). `basedOn` names the built-in
 * it started from, and `revision` counts edits, so two saves of the same name stay distinguishable.
 * Holds plain objects only — never a Set/Map — so it survives share links, saved defaults and exports.
 */
export interface CustomOrbProfile {
  readonly name: string;
  readonly basedOn: OrbProfileId;
  readonly revision: number;
  readonly scalePercent: number;
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
 * Validates just the per-aspect and per-body rules a settings bag may carry, with the same checks
 * `validateCustomOrbProfile` applies to a saved profile. `undefined` when either part is malformed.
 */
export function validateOrbRules(value: unknown):
  | {
      readonly aspectOrbs: Readonly<Record<string, OrbRule>>;
      readonly bodyOrbs: Readonly<Record<string, number>>;
    }
  | undefined {
  const probe = validateCustomOrbProfile({
    name: 'rules',
    basedOn: 'standard-v1',
    revision: 1,
    scalePercent: 0,
    aspectOrbs: isRecord(value) ? value.aspectOrbs : undefined,
    bodyOrbs: isRecord(value) ? value.bodyOrbs : undefined,
  });
  if (!isRecord(value) || probe === undefined) return undefined;
  return { aspectOrbs: probe.aspectOrbs, bodyOrbs: probe.bodyOrbs };
}

/**
 * Checks untrusted input (a share link, a saved default, an import) against the rules above and
 * rebuilds it from known keys only. Returns the cleaned profile, or `undefined` if any part is
 * malformed — the caller then drops the whole custom profile rather than guessing at part of it.
 */
export function validateCustomOrbProfile(value: unknown): CustomOrbProfile | undefined {
  if (!isRecord(value)) return undefined;
  const { name, basedOn, revision, scalePercent, aspectOrbs, bodyOrbs } = value;
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80) return undefined;
  if (typeof basedOn !== 'string' || !(ORB_PROFILE_IDS as readonly string[]).includes(basedOn)) return undefined;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) return undefined;
  if (typeof scalePercent !== 'number' || !Number.isFinite(scalePercent)) return undefined;
  if (scalePercent < SCALE_RANGE.min || scalePercent > SCALE_RANGE.max) return undefined;

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

  return {
    name,
    basedOn: basedOn as OrbProfileId,
    revision,
    scalePercent,
    aspectOrbs: cleanAspects,
    bodyOrbs: cleanBodies,
  };
}

/** The `OrbConfig` a custom profile stands for: its `basedOn` built-in's tiers, with its own scale and rules applied. */
export function orbConfigFromCustom(profile: CustomOrbProfile): OrbConfig {
  const base = ORB_PROFILES[profile.basedOn].config;
  return {
    ...base,
    scalePercent: profile.scalePercent,
    aspectOrbs: profile.aspectOrbs,
    bodyOrbs: profile.bodyOrbs,
  };
}

/**
 * The orbs a chart context calculates with (#590): that context's built-in default, or the person's
 * own profile when they keep one. A profile replaces the scale and the per-aspect and per-body rules
 * but never the context's minor-aspect set, so a transit still calculates the minors its filter can
 * show and a synastry still leaves them off.
 */
export function orbConfigForContext(context: OrbContext, custom?: CustomOrbProfile): OrbConfig {
  const builtIn = ORB_CONTEXT_DEFAULTS[context];
  if (custom === undefined) return builtIn;
  return { ...orbConfigFromCustom(custom), enabledMinorAspects: builtIn.enabledMinorAspects };
}
