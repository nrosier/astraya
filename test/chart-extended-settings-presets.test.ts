/** The named starting points for the Extended settings (#442), and the summary of what differs from the defaults. */
import { describe, expect, it } from 'vitest';
import { ayanamsaByKey } from '../src/astrology/ayanamsas.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { applyPreset, matchPreset, PRESET_KEYS, PRESETS } from '../src/chart/extended-settings-presets.js';
import { changedSettings, sameSettings } from '../src/ui/extended-settings-summary.js';

describe('presets', () => {
  it('has the modern preset equal to the defaults, so a fresh chart matches it', () => {
    expect(applyPreset(DEFAULT_EXTENDED_SETTINGS, 'modern')).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(matchPreset(DEFAULT_EXTENDED_SETTINGS, 'modern')).toBe('modern');
  });

  it('sets the zodiac, houses, points and rulers of a tradition, and nothing else', () => {
    const base = {
      ...DEFAULT_EXTENDED_SETTINGS,
      orbScalePercent: 30,
      rainbowZodiac: true,
      nodeVariant: 'true' as const,
    };
    const traditional = applyPreset(base, 'traditional');
    expect(traditional).toMatchObject({ houseSystem: 'W', zodiac: { kind: 'tropical' }, fortuneVisible: true });
    expect(PRESETS.traditional.rulership).toBe('traditional');
    // Orb scale, the node model and appearance are not a tradition's decision here.
    expect(traditional.orbScalePercent).toBe(30);
    expect(traditional.nodeVariant).toBe('true');
    expect(traditional.rainbowZodiac).toBe(true);
  });

  it('uses the Lahiri ayanamsa for the Vedic preset', () => {
    const lahiri = ayanamsaByKey('lahiri');
    expect(lahiri).toBeDefined();
    expect(PRESETS.vedic.zodiac).toEqual({ kind: 'sidereal', ayanamsa: lahiri?.id });
    expect(PRESETS.vedic.houseSystem).toBe('W');
  });

  it('recognises a preset only when the rulers match too, and otherwise says Custom', () => {
    const traditional = applyPreset(DEFAULT_EXTENDED_SETTINGS, 'traditional');
    expect(matchPreset(traditional, 'traditional')).toBe('traditional');
    expect(matchPreset(traditional, 'modern')).toBeUndefined();
    expect(matchPreset({ ...traditional, houseSystem: 'P' }, 'traditional')).toBeUndefined();
    expect(matchPreset(applyPreset(DEFAULT_EXTENDED_SETTINGS, 'vedic'), 'traditional')).toBe('vedic');
  });

  it('asserts no orb figures: every preset leaves the orb scale to the user', () => {
    for (const key of PRESET_KEYS) expect(Object.keys(PRESETS[key])).not.toContain('orbScalePercent');
  });
});

describe('changedSettings', () => {
  it('is empty for the defaults and lists exactly what differs', () => {
    expect(changedSettings(DEFAULT_EXTENDED_SETTINGS)).toEqual([]);
    expect(
      changedSettings({
        ...DEFAULT_EXTENDED_SETTINGS,
        houseSystem: 'W',
        orbScalePercent: -10,
        enabledMinorAspects: ['quintile'],
        chironVisible: false,
        aspectsToLilith: true,
        lilithVariant: 'true',
      }),
    ).toEqual(['houseSystem', 'orbScale', 'minorAspects', 'chiron', 'lilith', 'aspectsTo']);
  });

  it('compares two settings field by field', () => {
    expect(sameSettings(DEFAULT_EXTENDED_SETTINGS, { ...DEFAULT_EXTENDED_SETTINGS })).toBe(true);
    expect(sameSettings(DEFAULT_EXTENDED_SETTINGS, { ...DEFAULT_EXTENDED_SETTINGS, vertexVisible: true })).toBe(false);
  });
});
