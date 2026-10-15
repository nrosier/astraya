/**
 * The three built-in calculation profiles (#506/#510): each a complete, versioned snapshot of
 * the zodiac, house system, rulership, orbs, visible points and aspects — not a partial overlay
 * the way the old tradition presets (#442) were.
 */
import { describe, expect, it } from 'vitest';
import { ayanamsaByKey } from '../src/astrology/ayanamsas.js';
import {
  applyCalculationProfile,
  CALCULATION_PROFILE_IDS,
  CALCULATION_PROFILES,
  matchCalculationProfile,
} from '../src/chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';

describe('calculation profiles', () => {
  it('has Modern Western equal to the defaults, so a fresh chart matches it', () => {
    expect(applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'modern-western-v1')).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(matchCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'modern')).toBe('modern-western-v1');
  });

  it('replaces every field it owns — a complete snapshot, not an overlay', () => {
    const base = {
      ...DEFAULT_EXTENDED_SETTINGS,
      orbScalePercent: 30,
      rainbowZodiac: true,
      nodeVariant: 'true' as const,
      lilithVariant: 'true' as const,
    };
    const traditional = applyCalculationProfile(base, 'traditional-western-v1');
    expect(traditional).toMatchObject({
      houseSystem: 'W',
      zodiac: { kind: 'tropical' },
    });
    expect(traditional.objectPolicies.partOfFortune.visible).toBe(true);
    expect(traditional.objectPolicies.chiron.visible).toBe(false);
    expect(CALCULATION_PROFILES['traditional-western-v1'].rulership).toBe('traditional');
    // Orb scale and the node/Lilith model ARE profile-owned now (unlike the old presets):
    // applying a profile overwrites a previously-customized value rather than leaving it.
    expect(traditional.orbScalePercent).toBe(0);
    expect(traditional.nodeVariant).toBe('mean');
    expect(traditional.lilithVariant).toBe('mean');
    // Appearance stays untouched — never profile-owned.
    expect(traditional.rainbowZodiac).toBe(true);
  });

  it('uses the Lahiri ayanamsa for the Sidereal (Lahiri) profile', () => {
    const lahiri = ayanamsaByKey('lahiri');
    expect(lahiri).toBeDefined();
    expect(CALCULATION_PROFILES['sidereal-lahiri-v1'].zodiac).toEqual({ kind: 'sidereal', ayanamsa: lahiri?.id });
    expect(CALCULATION_PROFILES['sidereal-lahiri-v1'].houseSystem).toBe('W');
  });

  it('recognises a profile only when the rulers match too, and otherwise says Custom', () => {
    const traditional = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'traditional-western-v1');
    expect(matchCalculationProfile(traditional, 'traditional')).toBe('traditional-western-v1');
    expect(matchCalculationProfile(traditional, 'modern')).toBeUndefined();
    expect(matchCalculationProfile({ ...traditional, houseSystem: 'P' }, 'traditional')).toBeUndefined();
    expect(
      matchCalculationProfile(applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'sidereal-lahiri-v1'), 'traditional'),
    ).toBe('sidereal-lahiri-v1');
  });

  it('shows Custom as soon as a profile-owned value the old presets ignored changes — orb scale or the node/Lilith model', () => {
    const traditional = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'traditional-western-v1');
    expect(matchCalculationProfile(traditional, 'traditional')).toBe('traditional-western-v1');
    expect(matchCalculationProfile({ ...traditional, orbScalePercent: 10 }, 'traditional')).toBeUndefined();
    expect(matchCalculationProfile({ ...traditional, nodeVariant: 'true' }, 'traditional')).toBeUndefined();
    expect(matchCalculationProfile({ ...traditional, lilithVariant: 'true' }, 'traditional')).toBeUndefined();
  });

  it('asserts standard orbs (0% scale) and mean node/Lilith for every built-in profile — a complete snapshot', () => {
    for (const id of CALCULATION_PROFILE_IDS) {
      const profile = CALCULATION_PROFILES[id];
      expect(profile.orbScalePercent).toBe(0);
      expect(profile.nodeVariant).toBe('mean');
      expect(profile.lilithVariant).toBe('mean');
      expect(profile.enabledMinorAspects).toEqual([]);
      expect(profile.midpointsVisible).toBe(false);
    }
  });
});
