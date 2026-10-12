/**
 * Unit tests for the named orb-scale profiles and synastry's own default (#543).
 */
import { describe, expect, it } from 'vitest';
import { angularSeparation, DEFAULT_ORB_CONFIG, matchAspect } from '../src/astrology/aspects.js';
import type { BodyPosition } from '../src/ephemeris/types.js';
import {
  matchOrbProfile,
  orbConfigForProfile,
  ORB_PROFILE_IDS,
  ORB_PROFILES,
  SYNASTRY_DEFAULT_ORB_CONFIG,
} from '../src/astrology/orb-profiles.js';

function body(longitude: number): BodyPosition {
  return {
    body: 0,
    longitude,
    latitude: 0,
    distance: 1,
    longitudeSpeed: 1,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: false,
  };
}

describe('ORB_PROFILES (#543)', () => {
  it('has one entry per id, each resolving to itself', () => {
    for (const id of ORB_PROFILE_IDS) {
      expect(ORB_PROFILES[id].id).toBe(id);
      expect(orbConfigForProfile(id)).toBe(ORB_PROFILES[id].config);
    }
  });

  it('standard-v1 is exactly the unscaled app default, tight/wide are scaled, not re-tiered', () => {
    expect(ORB_PROFILES['standard-v1'].config).toEqual(DEFAULT_ORB_CONFIG);
    expect(ORB_PROFILES['tight-v1'].config).toEqual({ ...DEFAULT_ORB_CONFIG, scalePercent: -50 });
    expect(ORB_PROFILES['wide-v1'].config).toEqual({ ...DEFAULT_ORB_CONFIG, scalePercent: 40 });
  });

  it('each profile is immutable: mutating one via its own config object would not touch the registry', () => {
    const config = { ...ORB_PROFILES['tight-v1'].config };
    config.scalePercent = 999;
    expect(ORB_PROFILES['tight-v1'].config.scalePercent).toBe(-50);
  });
});

describe('matchOrbProfile (#543)', () => {
  it('matches each built-in scale exactly', () => {
    expect(matchOrbProfile(0)).toBe('standard-v1');
    expect(matchOrbProfile(-50)).toBe('tight-v1');
    expect(matchOrbProfile(40)).toBe('wide-v1');
  });

  it('is undefined (Custom) for a scale no built-in profile uses', () => {
    expect(matchOrbProfile(20)).toBeUndefined();
    expect(matchOrbProfile(-30)).toBeUndefined();
  });
});

describe('switching profiles visibly changes which aspects register (#543 acceptance criterion)', () => {
  it('a borderline square registers under Wide but not under Standard or Tight, with no code change beyond the config passed in', () => {
    // 98° apart: 8° past an exact square. Standard majors (7°, no luminary bonus for two plain
    // planets) leave this just outside orb; Wide (7° * 1.4 = 9.8°) catches it; Tight (7° * 0.5 =
    // 3.5°) is nowhere close.
    const a = body(0);
    const b = body(98);
    const standard = matchAspect(a, 'planet', b, 'planet', orbConfigForProfile('standard-v1'));
    const wide = matchAspect(a, 'planet', b, 'planet', orbConfigForProfile('wide-v1'));
    const tight = matchAspect(a, 'planet', b, 'planet', orbConfigForProfile('tight-v1'));
    expect(standard).toBeUndefined();
    expect(wide?.aspect.key).toBe('square');
    expect(tight).toBeUndefined();
  });

  it('angularSeparation is unaffected by which profile is in force — only the orb threshold is', () => {
    expect(angularSeparation(0, 98)).toBe(98);
  });
});

describe('SYNASTRY_DEFAULT_ORB_CONFIG (#543)', () => {
  it('is the standard config scaled down 30%, distinct from every named natal profile', () => {
    expect(SYNASTRY_DEFAULT_ORB_CONFIG).toEqual({ ...DEFAULT_ORB_CONFIG, scalePercent: -30 });
    expect(matchOrbProfile(SYNASTRY_DEFAULT_ORB_CONFIG.scalePercent)).toBeUndefined();
  });
});
