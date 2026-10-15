/**
 * Named orb profiles with per-body and per-aspect rules (#590).
 *
 * Orbs are traditionally expressed as a single flat value ("7° for major aspects"),
 * but different bodies and aspect types warrant different tolerances. This module
 * defines named profiles that can be selected per-chart, each with rules for:
 * - Body-specific overrides (e.g., Sun/Moon wider than other bodies)
 * - Aspect-specific overrides (e.g., conjunction tighter than sextile)
 * - Fallback defaults for unspecified combinations
 *
 * Profiles include provenance (cited source, date) so users can trace and compare
 * different schools of thought (traditional orbs, modern, Astro-Seek, Café Astrology, etc.).
 */

/**
 * @module astrology/orb-profiles
 * @purpose Defines named orb profiles with per-body and per-aspect rules, replacing flat default values.
 * @conventions Each profile is immutable; rules are checked in order (body+aspect most specific, body alone, aspect alone, default); provenance includes source URL and date for traceability; profiles are stored in extended-settings and applied during chart computation.
 * @exports OrbProfile, OrbProfileRegistry, DEFAULT_ORB_PROFILE, getOrbForBodyAspect, getAvailableProfiles
 */

import type { BodyId } from '../ephemeris/types.js';

/** One orb rule override: for a given body and/or aspect type. */
export interface OrbRule {
  /** Body ID, or undefined to apply to all bodies */
  readonly bodyId?: BodyId;
  /** Aspect key, or undefined to apply to all aspects */
  readonly aspectKey?: string;
  /** Base orb in degrees */
  readonly base: number;
  /** Additional orb when either body is a luminary (Sun/Moon) */
  readonly luminaryBonus?: number;
}

/** Named orb profile with rules and provenance. */
export interface OrbProfile {
  readonly key: string;
  readonly label: string;
  /** Where these orbs come from: source URL, astrologer name, tradition, etc. */
  readonly provenance: string;
  /** ISO 8601 date when this profile was added or last verified. */
  readonly date: string;
  /** Ordered list of override rules — most specific (body + aspect) to least (default only). */
  readonly rules: readonly OrbRule[];
  /** Fallback orb when no rule matches */
  readonly defaultBase: number;
  readonly defaultLuminaryBonus?: number;
}

/**
 * Get the effective orb for a body-aspect pair using a profile.
 * Checks rules in order: (body, aspect), then (body), then (aspect), then default.
 */
export function getOrbForBodyAspect(
  bodyId: BodyId,
  aspectKey: string,
  profile: OrbProfile,
): { readonly base: number; readonly luminaryBonus: number } {
  // Most specific: body + aspect
  const specificRule = profile.rules.find(
    (r) => r.bodyId === bodyId && r.aspectKey === aspectKey,
  );
  if (specificRule) {
    return { base: specificRule.base, luminaryBonus: specificRule.luminaryBonus ?? 0 };
  }

  // Body only
  const bodyRule = profile.rules.find((r) => r.bodyId === bodyId && !r.aspectKey);
  if (bodyRule) {
    return { base: bodyRule.base, luminaryBonus: bodyRule.luminaryBonus ?? 0 };
  }

  // Aspect only
  const aspectRule = profile.rules.find((r) => !r.bodyId && r.aspectKey === aspectKey);
  if (aspectRule) {
    return { base: aspectRule.base, luminaryBonus: aspectRule.luminaryBonus ?? 0 };
  }

  // Default
  return { base: profile.defaultBase, luminaryBonus: profile.defaultLuminaryBonus ?? 0 };
}

/**
 * The traditional default orb profile (Astro-Seek conventions):
 * - Major aspects: 7° (10° with luminary)
 * - Sextile: 4° (5.5° with luminary)
 * - Minor aspects: 2.5° flat
 */
export const DEFAULT_ORB_PROFILE: OrbProfile = {
  key: 'default',
  label: 'Default (Astro-Seek)',
  provenance: 'Astro-Seek.com conventions, modern standard',
  date: '2024-01-01',
  rules: [
    // No specific overrides in default profile; all major aspects get the standard treatment
  ],
  defaultBase: 7,
  defaultLuminaryBonus: 3,
};

/**
 * Available built-in orb profiles. Users can eventually add custom profiles too.
 */
export const BUILT_IN_PROFILES: readonly OrbProfile[] = [
  DEFAULT_ORB_PROFILE,
  {
    key: 'tight',
    label: 'Tight (Classical)',
    provenance: 'Classical astrology conventions',
    date: '2024-01-01',
    rules: [],
    defaultBase: 5,
    defaultLuminaryBonus: 2,
  },
  {
    key: 'wide',
    label: 'Wide (Modern)',
    provenance: 'Modern astrology, liberal orb allowance',
    date: '2024-01-01',
    rules: [],
    defaultBase: 9,
    defaultLuminaryBonus: 4,
  },
];

/**
 * Registry of available profiles by key.
 */
export function getAvailableProfiles(): ReadonlyMap<string, OrbProfile> {
  return new Map(BUILT_IN_PROFILES.map((profile) => [profile.key, profile]));
}

/**
 * Get a profile by key, or the default if not found.
 */
export function getProfileByKey(key: string): OrbProfile {
  const profiles = getAvailableProfiles();
  return profiles.get(key) ?? DEFAULT_ORB_PROFILE;
}
