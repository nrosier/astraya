/**
 * User-defined orb rules (#590): per-aspect overrides and per-body moiety sums, the validator for a
 * set of rules, and how each chart context derives its orbs from the Extended settings (#543).
 * Pure arithmetic, no ephemeris — the real-engine equivalence check lives with the other chart tests.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG, orbFor, type OrbConfig } from '../src/astrology/aspects.js';
import {
  orbConfigForContext,
  ORB_PROFILES,
  SYNASTRY_DEFAULT_ORB_CONFIG,
  SYNASTRY_SCALE_OFFSET,
  validateOrbRules,
} from '../src/astrology/orb-profiles.js';
import { TRANSIT_ORB_CONFIG } from '../src/astrology/transit-importance.js';

describe('orbFor with user-defined rules (#590)', () => {
  it('is exactly the tiered value when neither new field is set', () => {
    expect(orbFor('trine', 'planet', 'planet', DEFAULT_ORB_CONFIG)).toBe(7);
    expect(orbFor('trine', 'luminary', 'planet', DEFAULT_ORB_CONFIG)).toBe(10);
    expect(orbFor('sextile', 'planet', 'planet', DEFAULT_ORB_CONFIG)).toBe(4);
  });

  it('a per-aspect override replaces that aspect’s tier, with the luminary bonus still applied', () => {
    const config: OrbConfig = { ...DEFAULT_ORB_CONFIG, aspectOrbs: { trine: { base: 9, luminaryBonus: 2 } } };
    expect(orbFor('trine', 'planet', 'planet', config)).toBe(9);
    expect(orbFor('trine', 'luminary', 'planet', config)).toBe(11);
    // Other aspects keep their own tier.
    expect(orbFor('square', 'planet', 'planet', config)).toBe(7);
  });

  it('a per-body moiety pair sums both bodies’ half-orbs, overriding the aspect tier', () => {
    const config: OrbConfig = { ...DEFAULT_ORB_CONFIG, bodyOrbs: { venus: 4, mars: 3 } };
    expect(orbFor('conjunction', 'planet', 'planet', config, { a: 'venus', b: 'mars' })).toBe(7);
  });

  it('with only one body of the pair entered, the aspect’s own tier applies (no partial sum)', () => {
    const config: OrbConfig = { ...DEFAULT_ORB_CONFIG, bodyOrbs: { venus: 4 } };
    expect(orbFor('conjunction', 'planet', 'planet', config, { a: 'venus', b: 'mars' })).toBe(7);
  });

  it('a moiety sum is only used when body keys are supplied', () => {
    const config: OrbConfig = { ...DEFAULT_ORB_CONFIG, bodyOrbs: { venus: 4, mars: 3 } };
    expect(orbFor('conjunction', 'planet', 'planet', config)).toBe(7);
  });

  it('scalePercent multiplies whichever rule applied', () => {
    const config: OrbConfig = {
      ...DEFAULT_ORB_CONFIG,
      scalePercent: -50,
      bodyOrbs: { venus: 4, mars: 3 },
    };
    expect(orbFor('conjunction', 'planet', 'planet', config, { a: 'venus', b: 'mars' })).toBe(3.5);
  });
});

describe('validateOrbRules (#590)', () => {
  const good = { aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } }, bodyOrbs: { venus: 4, mars: 3 } };

  it('accepts well-formed rules and rebuilds them from known keys only', () => {
    expect(validateOrbRules({ ...good, notes: 'x' })).toEqual(good);
  });

  it('rejects the whole set when any single entry is malformed, instead of keeping part of it', () => {
    expect(validateOrbRules({ ...good, aspectOrbs: { nonsense: { base: 1, luminaryBonus: 0 } } })).toBeUndefined();
    expect(validateOrbRules({ ...good, bodyOrbs: { notABody: 2 } })).toBeUndefined();
    expect(validateOrbRules({ ...good, bodyOrbs: { venus: 31 } })).toBeUndefined();
    expect(validateOrbRules({ ...good, bodyOrbs: { venus: -1 } })).toBeUndefined();
  });

  it('rejects non-objects and arrays where an object belongs', () => {
    expect(validateOrbRules(null)).toBeUndefined();
    expect(validateOrbRules([])).toBeUndefined();
    expect(validateOrbRules({ ...good, bodyOrbs: [1, 2] })).toBeUndefined();
  });

  it('accepts an empty set', () => {
    expect(validateOrbRules({})).toEqual({ aspectOrbs: {}, bodyOrbs: {} });
  });
});

describe('orbConfigForContext (#590, #543)', () => {
  const settings: OrbConfig = {
    ...DEFAULT_ORB_CONFIG,
    scalePercent: 20,
    aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } },
    bodyOrbs: { venus: 4, mars: 3 },
    enabledMinorAspects: [],
  };

  it('natal uses the Extended settings orbs exactly', () => {
    expect(orbConfigForContext('natal', settings)).toBe(settings);
  });

  it('synastry applies its 30% tighter scale on top of the settings', () => {
    const config = orbConfigForContext('synastry', settings);
    expect(config.scalePercent).toBe(20 + SYNASTRY_SCALE_OFFSET);
    expect(config.aspectOrbs).toEqual(settings.aspectOrbs);
    expect(config.bodyOrbs).toEqual(settings.bodyOrbs);
  });

  it('a default user gets exactly the synastry default it had before (#543)', () => {
    expect(orbConfigForContext('synastry', DEFAULT_ORB_CONFIG)).toEqual(SYNASTRY_DEFAULT_ORB_CONFIG);
  });

  it('transit keeps its three minor aspects on whatever the chart’s minor setting is', () => {
    expect(orbConfigForContext('transit', settings).enabledMinorAspects).toEqual(
      TRANSIT_ORB_CONFIG.enabledMinorAspects,
    );
    expect(orbConfigForContext('transit', settings).scalePercent).toBe(20);
  });
});

describe('built-in orb profiles claim no source they cannot cite (#590)', () => {
  it('has no verified locator and does not attribute its numbers to a named product', () => {
    for (const profile of Object.values(ORB_PROFILES)) {
      expect(profile.source.locator).toBeNull();
      expect(profile.source.authority).toMatch(/^Astraya default/);
      expect(profile.source.authority + profile.description).not.toMatch(/astro-?seek/i);
    }
  });
});
