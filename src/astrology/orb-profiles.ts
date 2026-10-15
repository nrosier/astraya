/**
 * Named, versioned orb-scale presets layered on `aspects.ts`'s already fully configurable
 * `OrbConfig` (#543), so a user can pick "Tight" or "Wide" by name instead of hand-tuning the
 * raw scale percentage, and a tighter documented default for synastry — comparing two
 * independently-real natal charts does not carry the same "this aspect matters across a
 * lifetime" argument a single chart's own aspects do, and reusing the natal default there
 * reports too many loosely-related contacts to be useful.
 *
 * Deliberately does not add true per-body "moieties" (a half-orb owned by each planet, summed
 * per pair) that the professional-astrology audit raising this issue also asked for: every
 * classical moiety table checked while implementing this carried numbers that could not be
 * independently verified against a citable primary source here, and CLAUDE.md's domain-
 * integrity rule would rather this profile be absent than guessed at. `aspects.ts`'s own
 * category-tiered luminary bonus already gives a coarser per-body distinction (luminary or
 * not); a true per-body table is a follow-up once a specific edition/page can be cited.
 */
/**
 * @module astrology/orb-profiles
 * @purpose Named, versioned orb-scale presets layered on aspects.ts's OrbConfig, plus a documented tighter default for synastry.
 * @conventions Each profile is immutable once published — a correction creates a new id/version rather than editing one in place, matching `chart/calculation-profiles.ts`'s own convention; `'custom'` is not a profile here, it is the absence of a match from `matchOrbProfile`.
 * @exports OrbProfileId, ORB_PROFILE_IDS, OrbProfile, ORB_PROFILES, orbConfigForProfile, matchOrbProfile, SYNASTRY_DEFAULT_ORB_CONFIG
 */
import { DEFAULT_ORB_CONFIG, type OrbConfig } from './aspects.js';

export type OrbProfileId = 'standard-v1' | 'tight-v1' | 'wide-v1';

export const ORB_PROFILE_IDS: readonly OrbProfileId[] = ['standard-v1', 'tight-v1', 'wide-v1'];

export interface OrbProfile {
  readonly id: OrbProfileId;
  readonly name: string;
  readonly description: string;
  readonly config: OrbConfig;
}

export const ORB_PROFILES: Readonly<Record<OrbProfileId, OrbProfile>> = {
  'standard-v1': {
    id: 'standard-v1',
    name: 'Standard',
    description:
      "This app's long-standing default tiers, unscaled (Astro-Seek's own convention): majors 7°/10° with a luminary, sextile 4°/5°30', minors flat 2°30'.",
    config: DEFAULT_ORB_CONFIG,
  },
  'tight-v1': {
    id: 'tight-v1',
    name: 'Tight',
    description:
      'The standard tiers scaled down by half, for a reading that only wants to see the closest, most clearly active contacts.',
    config: { ...DEFAULT_ORB_CONFIG, scalePercent: -50 },
  },
  'wide-v1': {
    id: 'wide-v1',
    name: 'Wide',
    description:
      'The standard tiers scaled up by 40%, for a reading that wants to catch looser, still-forming contacts too.',
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
