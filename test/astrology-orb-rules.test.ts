/**
 * User-defined orb rules (#590): per-aspect overrides and per-body moiety sums, and the validator
 * for a saved custom profile. Pure arithmetic, no ephemeris — the real-engine equivalence check
 * lives with the other chart tests.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG, orbFor, type OrbConfig } from '../src/astrology/aspects.js';
import {
  ORB_CONTEXT_DEFAULTS,
  ORB_CONTEXTS,
  orbConfigForContext,
  ORB_PROFILES,
  orbConfigFromCustom,
  validateCustomOrbProfile,
  type CustomOrbProfile,
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

describe('validateCustomOrbProfile (#590)', () => {
  const good: CustomOrbProfile = {
    name: 'My house style',
    basedOn: 'standard-v1',
    revision: 2,
    scalePercent: -10,
    aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } },
    bodyOrbs: { venus: 4, mars: 3 },
  };

  it('accepts a well-formed profile and returns it rebuilt from known keys only', () => {
    expect(validateCustomOrbProfile(good)).toEqual(good);
  });

  it('drops unknown extra keys rather than carrying them into a snapshot', () => {
    expect(validateCustomOrbProfile({ ...good, notes: 'x', __proto__pollution: 1 })).toEqual(good);
  });

  it('rejects the whole profile when any single part is malformed, instead of keeping part of it', () => {
    expect(validateCustomOrbProfile({ ...good, basedOn: 'made-up-v9' })).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, revision: 0 })).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, scalePercent: 120 })).toBeUndefined();
    expect(
      validateCustomOrbProfile({ ...good, aspectOrbs: { nonsense: { base: 1, luminaryBonus: 0 } } }),
    ).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, bodyOrbs: { notABody: 2 } })).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, bodyOrbs: { venus: 31 } })).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, bodyOrbs: { venus: -1 } })).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, name: '   ' })).toBeUndefined();
  });

  it('rejects non-objects and arrays where an object belongs', () => {
    expect(validateCustomOrbProfile(null)).toBeUndefined();
    expect(validateCustomOrbProfile([])).toBeUndefined();
    expect(validateCustomOrbProfile({ ...good, bodyOrbs: [1, 2] })).toBeUndefined();
  });

  it('accepts a profile with no per-aspect or per-body rules at all', () => {
    const bare = { name: good.name, basedOn: good.basedOn, revision: good.revision, scalePercent: good.scalePercent };
    expect(validateCustomOrbProfile(bare)).toEqual({ ...bare, aspectOrbs: {}, bodyOrbs: {} });
  });
});

describe('orbConfigFromCustom (#590)', () => {
  it('starts from the basedOn built-in’s tiers and applies only the custom scale and rules', () => {
    const config = orbConfigFromCustom({
      name: 'x',
      basedOn: 'tight-v1',
      revision: 1,
      scalePercent: 0,
      aspectOrbs: { trine: { base: 5, luminaryBonus: 1 } },
      bodyOrbs: { venus: 2 },
    });
    expect(config.majorOrb).toEqual(ORB_PROFILES['tight-v1'].config.majorOrb);
    expect(config.scalePercent).toBe(0);
    expect(config.aspectOrbs).toEqual({ trine: { base: 5, luminaryBonus: 1 } });
    expect(config.bodyOrbs).toEqual({ venus: 2 });
  });

  it('survives a JSON round trip with the same effective orbs (no Set/Map anywhere)', () => {
    const custom = validateCustomOrbProfile({
      name: 'x',
      basedOn: 'wide-v1',
      revision: 1,
      scalePercent: 10,
      aspectOrbs: { square: { base: 6, luminaryBonus: 0 } },
      bodyOrbs: { mars: 3, venus: 4 },
    });
    if (custom === undefined) throw new Error('fixture bug');
    const reread = JSON.parse(JSON.stringify(custom)) as unknown;
    const restored = validateCustomOrbProfile(reread);
    if (restored === undefined) throw new Error('round trip lost the profile');
    const before = orbFor('conjunction', 'planet', 'planet', orbConfigFromCustom(custom), { a: 'mars', b: 'venus' });
    const after = orbFor('conjunction', 'planet', 'planet', orbConfigFromCustom(restored), { a: 'mars', b: 'venus' });
    expect(after).toBe(before);
  });
});

describe('ORB_CONTEXT_DEFAULTS (#590)', () => {
  it('names today’s defaults for each context, unchanged', () => {
    expect(ORB_CONTEXT_DEFAULTS.natal).toBe(DEFAULT_ORB_CONFIG);
    expect(ORB_CONTEXT_DEFAULTS.transit).toBe(TRANSIT_ORB_CONFIG);
    expect(ORB_CONTEXT_DEFAULTS.synastry.scalePercent).toBe(-30);
  });

  it('gives every built-in a source record, and no built-in claims a locator it cannot cite', () => {
    for (const profile of Object.values(ORB_PROFILES)) {
      expect(profile.revision).toBe(1);
      expect(profile.source.locator).toBeNull();
      expect(profile.source.authority.length).toBeGreaterThan(0);
    }
  });
});

describe('orbConfigForContext (#590)', () => {
  const mine: CustomOrbProfile = {
    name: 'Mine',
    basedOn: 'standard-v1',
    revision: 1,
    scalePercent: 20,
    aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } },
    bodyOrbs: { venus: 4, mars: 3 },
  };

  it('is the context’s own built-in default when the person keeps no profile', () => {
    expect(orbConfigForContext('natal')).toBe(DEFAULT_ORB_CONFIG);
    expect(orbConfigForContext('transit')).toBe(TRANSIT_ORB_CONFIG);
    expect(orbConfigForContext('synastry')).toBe(ORB_CONTEXT_DEFAULTS.synastry);
  });

  it('applies the person’s scale and rules in every context', () => {
    for (const context of ORB_CONTEXTS) {
      const config = orbConfigForContext(context, mine);
      expect(config.scalePercent).toBe(20);
      expect(config.aspectOrbs).toEqual(mine.aspectOrbs);
      expect(config.bodyOrbs).toEqual(mine.bodyOrbs);
    }
  });

  it('keeps the context’s own minor aspects: transit shows its three, synastry none', () => {
    expect(orbConfigForContext('transit', mine).enabledMinorAspects).toEqual(TRANSIT_ORB_CONFIG.enabledMinorAspects);
    expect(orbConfigForContext('synastry', mine).enabledMinorAspects).toEqual([]);
  });
});
