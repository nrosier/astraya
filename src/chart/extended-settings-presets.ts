/**
 * Named starting points for the chart's Extended settings (#442): what a practitioner of a tradition sets once,
 * so they need not tick a dozen options one by one. A preset fills the *profile* settings only (the zodiac, the house
 * system, which points and aspects are on, and the rulership scheme); it never touches appearance (the symbols,
 * their weight, the rainbow wedges), the orb scale or the Lilith and node models, which are not a tradition's
 * decision here.
 *
 * What is asserted is only what is not in doubt. Hellenistic and traditional work uses the tropical zodiac and Whole
 * Sign houses, the seven classical rulers and the Part of Fortune; Jyotish uses the sidereal zodiac with the Lahiri
 * ayanamsa (the Indian standard), Whole Sign houses and the classical rulers. No orb figures are set (traditional
 * practice uses per-planet moieties, which this app does not model, so a number would be invented), and neither
 * the mean nor the true node is claimed for any tradition.
 */
import { ayanamsaByKey, AYANAMSAS } from '../astrology/ayanamsas.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from './extended-settings.js';

export type PresetKey = 'modern' | 'traditional' | 'vedic';

export const PRESET_KEYS: readonly PresetKey[] = ['modern', 'traditional', 'vedic'];

const LAHIRI_AYANAMSA_ID = ayanamsaByKey('lahiri')?.id ?? AYANAMSAS[0]?.id ?? 1;

/** The settings a preset decides: a part of `ExtendedSettings` plus the (device-wide) rulership scheme. */
export type PresetProfile = Pick<
  ExtendedSettings,
  | 'zodiac'
  | 'houseSystem'
  | 'fortuneVisible'
  | 'vertexVisible'
  | 'chironVisible'
  | 'enabledMinorAspects'
  | 'aspectsToChiron'
  | 'aspectsToLilith'
  | 'aspectsToLunarNodes'
> & { readonly rulership: RulershipChoice };

export const PRESETS: Readonly<Record<PresetKey, PresetProfile>> = {
  modern: {
    zodiac: DEFAULT_EXTENDED_SETTINGS.zodiac,
    houseSystem: DEFAULT_EXTENDED_SETTINGS.houseSystem,
    fortuneVisible: DEFAULT_EXTENDED_SETTINGS.fortuneVisible,
    vertexVisible: DEFAULT_EXTENDED_SETTINGS.vertexVisible,
    chironVisible: DEFAULT_EXTENDED_SETTINGS.chironVisible,
    enabledMinorAspects: DEFAULT_EXTENDED_SETTINGS.enabledMinorAspects,
    aspectsToChiron: DEFAULT_EXTENDED_SETTINGS.aspectsToChiron,
    aspectsToLilith: DEFAULT_EXTENDED_SETTINGS.aspectsToLilith,
    aspectsToLunarNodes: DEFAULT_EXTENDED_SETTINGS.aspectsToLunarNodes,
    rulership: 'modern',
  },
  traditional: {
    zodiac: { kind: 'tropical' },
    houseSystem: 'W',
    fortuneVisible: true,
    vertexVisible: false,
    chironVisible: false,
    enabledMinorAspects: [],
    aspectsToChiron: false,
    aspectsToLilith: false,
    aspectsToLunarNodes: false,
    rulership: 'traditional',
  },
  vedic: {
    zodiac: { kind: 'sidereal', ayanamsa: LAHIRI_AYANAMSA_ID },
    houseSystem: 'W',
    fortuneVisible: false,
    vertexVisible: false,
    chironVisible: false,
    enabledMinorAspects: [],
    aspectsToChiron: false,
    aspectsToLilith: false,
    aspectsToLunarNodes: false,
    rulership: 'traditional',
  },
};

/** `settings` with a preset's choices laid over it. */
export function applyPreset(settings: ExtendedSettings, key: PresetKey): ExtendedSettings {
  const preset = PRESETS[key];
  return {
    ...settings,
    zodiac: preset.zodiac,
    houseSystem: preset.houseSystem,
    fortuneVisible: preset.fortuneVisible,
    vertexVisible: preset.vertexVisible,
    chironVisible: preset.chironVisible,
    enabledMinorAspects: preset.enabledMinorAspects,
    aspectsToChiron: preset.aspectsToChiron,
    aspectsToLilith: preset.aspectsToLilith,
    aspectsToLunarNodes: preset.aspectsToLunarNodes,
  };
}

function sameZodiac(a: ExtendedSettings['zodiac'], b: ExtendedSettings['zodiac']): boolean {
  return a.kind === b.kind && (a.kind !== 'sidereal' || (b.kind === 'sidereal' && a.ayanamsa === b.ayanamsa));
}

/**
 * Which preset the settings (and the rulership scheme they will be used with) match exactly on every field the
 * presets decide, or `undefined` for "Custom". Orb scale, the Lilith and node models, the display-only points not in
 * the profile and everything about appearance are not compared.
 */
export function matchPreset(settings: ExtendedSettings, rulership: RulershipChoice): PresetKey | undefined {
  return PRESET_KEYS.find((key) => {
    const preset = PRESETS[key];
    return (
      sameZodiac(settings.zodiac, preset.zodiac) &&
      settings.houseSystem === preset.houseSystem &&
      settings.fortuneVisible === preset.fortuneVisible &&
      settings.vertexVisible === preset.vertexVisible &&
      settings.chironVisible === preset.chironVisible &&
      settings.enabledMinorAspects.length === preset.enabledMinorAspects.length &&
      settings.enabledMinorAspects.every((aspect) => preset.enabledMinorAspects.includes(aspect)) &&
      settings.aspectsToChiron === preset.aspectsToChiron &&
      settings.aspectsToLilith === preset.aspectsToLilith &&
      settings.aspectsToLunarNodes === preset.aspectsToLunarNodes &&
      rulership === preset.rulership
    );
  });
}
