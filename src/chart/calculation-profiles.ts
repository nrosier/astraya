/**
 * The three built-in calculation profiles (#506/#510): named, versioned, complete starting
 * points for the chart's Extended settings, replacing the old tradition presets
 * (`extended-settings-presets.ts`, #442) with the model `docs/UI-UX_GUIDELINES.md` calls for —
 * "a profile contains zodiac/ayanamsa, house system, rulership, orbs, bodies/points, and
 * aspects. Treat a profile as a complete reproducible snapshot rather than a partial preset laid
 * over whatever values were selected previously."
 *
 * Three differences from the old preset model this replaces:
 * - **Stable versioned ids** (`modern-western-v1`, not `'modern'`): a built-in definition is
 *   immutable: a future change to what "Modern Western" means creates a new id, never edits this
 *   one in place, so a chart saved with provenance against an id never silently recomputes
 *   differently later (not yet implemented here — provenance storage is a separate, later slice).
 * - **A complete snapshot, not a partial overlay**: the old presets deliberately left orb scale
 *   and the Lilith/node model untouched ("not a tradition's decision here" — true of real-world
 *   practice, but the guideline asks for something different: a reproducible application default,
 *   not a historical claim). Every field below is asserted, and applying a profile now replaces
 *   all of them — a previously-customized orb scale or node model no longer survives switching
 *   profiles.
 * - **"Sidereal (Lahiri)" replaces "Vedic"**, with the old `'vedic'` key removed outright, no
 *   alias: "Vedic" describes a much broader practice than the settings this app controls.
 *
 * The three profiles use identical bodies/aspects/orbs except where the table below differs —
 * verified against `docs/UI-UX_GUIDELINES.md`'s built-in profile contract, not invented here:
 * five major aspects, no minor aspects, mean lunar node, mean Lilith, and "Astraya standard
 * orbs" (`astrology/aspects.js`'s `DEFAULT_ORB_CONFIG`, unscaled — `orbScalePercent: 0`).
 */
/**
 * @module chart/calculation-profiles
 * @purpose Defines the three built-in, versioned calculation profiles (Modern Western/Traditional Western/Sidereal (Lahiri)) as complete ExtendedSettings+rulership snapshots, replacing the old partial tradition-preset model.
 * @conventions A profile asserts every field it owns (zodiac, house system, rulership, orb scale, Lilith/node variant, visible points, aspects-to toggles) rather than leaving some untouched; applying one fully replaces the draft's owned fields rather than merging. Built-in definitions are immutable — a future change creates a new id.
 * @exports CalculationProfileId, CALCULATION_PROFILE_IDS, CalculationProfile, CALCULATION_PROFILES, applyCalculationProfile, matchCalculationProfile
 */
import { ayanamsaByKey, AYANAMSAS } from '../astrology/ayanamsas.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from './extended-settings.js';

export type CalculationProfileId = 'modern-western-v1' | 'traditional-western-v1' | 'sidereal-lahiri-v1';

export const CALCULATION_PROFILE_IDS: readonly CalculationProfileId[] = [
  'modern-western-v1',
  'traditional-western-v1',
  'sidereal-lahiri-v1',
];

const LAHIRI_AYANAMSA_ID = ayanamsaByKey('lahiri')?.id ?? AYANAMSAS[0]?.id ?? 1;

/** Every field a calculation profile owns: the full computation-and-display half of `ExtendedSettings`, plus the (device-wide) rulership scheme. Appearance (symbols, glyph weight, rainbow wedges) is never profile-owned. */
export type CalculationProfile = Pick<
  ExtendedSettings,
  | 'zodiac'
  | 'houseSystem'
  | 'orbScalePercent'
  | 'enabledMinorAspects'
  | 'lilithVariant'
  | 'nodeVariant'
  | 'fortuneVisible'
  | 'vertexVisible'
  | 'chironVisible'
  | 'modernPointVisibility'
  | 'midpointsVisible'
  | 'aspectsToChiron'
  | 'aspectsToLilith'
  | 'aspectsToLunarNodes'
  | 'aspectsToVertex'
  | 'aspectsToPartOfFortune'
  | 'aspectsToPartOfSpirit'
> & { readonly rulership: RulershipChoice };

/** Fields every built-in profile shares today — five major aspects, no minors, mean node/Lilith, unscaled standard orbs, no aspects to the non-core points, midpoints never shown. */
const COMMON: Pick<
  CalculationProfile,
  | 'orbScalePercent'
  | 'enabledMinorAspects'
  | 'lilithVariant'
  | 'nodeVariant'
  | 'midpointsVisible'
  | 'modernPointVisibility'
  | 'aspectsToChiron'
  | 'aspectsToLilith'
  | 'aspectsToLunarNodes'
  | 'aspectsToVertex'
  | 'aspectsToPartOfFortune'
  | 'aspectsToPartOfSpirit'
> = {
  orbScalePercent: 0,
  enabledMinorAspects: [],
  lilithVariant: 'mean',
  nodeVariant: 'mean',
  midpointsVisible: false,
  modernPointVisibility: DEFAULT_EXTENDED_SETTINGS.modernPointVisibility,
  aspectsToChiron: false,
  aspectsToLilith: false,
  aspectsToLunarNodes: false,
  aspectsToVertex: false,
  aspectsToPartOfFortune: false,
  aspectsToPartOfSpirit: false,
};

export const CALCULATION_PROFILES: Readonly<Record<CalculationProfileId, CalculationProfile>> = {
  'modern-western-v1': {
    ...COMMON,
    zodiac: DEFAULT_EXTENDED_SETTINGS.zodiac,
    houseSystem: DEFAULT_EXTENDED_SETTINGS.houseSystem,
    fortuneVisible: false,
    vertexVisible: false,
    chironVisible: true,
    rulership: 'modern',
  },
  'traditional-western-v1': {
    ...COMMON,
    zodiac: { kind: 'tropical' },
    houseSystem: 'W',
    fortuneVisible: true,
    vertexVisible: false,
    chironVisible: false,
    rulership: 'traditional',
  },
  'sidereal-lahiri-v1': {
    ...COMMON,
    zodiac: { kind: 'sidereal', ayanamsa: LAHIRI_AYANAMSA_ID },
    houseSystem: 'W',
    fortuneVisible: false,
    vertexVisible: false,
    chironVisible: false,
    rulership: 'traditional',
  },
};

/** `settings` with every field `profile` owns replaced by it — a full snapshot, not a merge: a previously-customized orb scale or node model does not survive. */
export function applyCalculationProfile(settings: ExtendedSettings, id: CalculationProfileId): ExtendedSettings {
  const profile = CALCULATION_PROFILES[id];
  return {
    ...settings,
    zodiac: profile.zodiac,
    houseSystem: profile.houseSystem,
    orbScalePercent: profile.orbScalePercent,
    enabledMinorAspects: profile.enabledMinorAspects,
    lilithVariant: profile.lilithVariant,
    nodeVariant: profile.nodeVariant,
    fortuneVisible: profile.fortuneVisible,
    vertexVisible: profile.vertexVisible,
    chironVisible: profile.chironVisible,
    modernPointVisibility: profile.modernPointVisibility,
    midpointsVisible: profile.midpointsVisible,
    aspectsToChiron: profile.aspectsToChiron,
    aspectsToLilith: profile.aspectsToLilith,
    aspectsToLunarNodes: profile.aspectsToLunarNodes,
    aspectsToVertex: profile.aspectsToVertex,
    aspectsToPartOfFortune: profile.aspectsToPartOfFortune,
    aspectsToPartOfSpirit: profile.aspectsToPartOfSpirit,
  };
}

function sameZodiac(a: ExtendedSettings['zodiac'], b: ExtendedSettings['zodiac']): boolean {
  return a.kind === b.kind && (a.kind !== 'sidereal' || (b.kind === 'sidereal' && a.ayanamsa === b.ayanamsa));
}

/**
 * Which built-in profile `settings` (and the rulership scheme they will be used with) match
 * exactly on every field a profile owns, or `undefined` for "Custom" — every owned field is
 * compared now that profiles are complete snapshots, including orb scale and the Lilith/node
 * model the old preset model deliberately left out.
 */
export function matchCalculationProfile(
  settings: ExtendedSettings,
  rulership: RulershipChoice,
): CalculationProfileId | undefined {
  return CALCULATION_PROFILE_IDS.find((id) => {
    const profile = CALCULATION_PROFILES[id];
    return (
      sameZodiac(settings.zodiac, profile.zodiac) &&
      settings.houseSystem === profile.houseSystem &&
      settings.orbScalePercent === profile.orbScalePercent &&
      settings.enabledMinorAspects.length === profile.enabledMinorAspects.length &&
      settings.enabledMinorAspects.every((aspect) => profile.enabledMinorAspects.includes(aspect)) &&
      settings.lilithVariant === profile.lilithVariant &&
      settings.nodeVariant === profile.nodeVariant &&
      settings.fortuneVisible === profile.fortuneVisible &&
      settings.vertexVisible === profile.vertexVisible &&
      settings.chironVisible === profile.chironVisible &&
      JSON.stringify(settings.modernPointVisibility) === JSON.stringify(profile.modernPointVisibility) &&
      settings.midpointsVisible === profile.midpointsVisible &&
      settings.aspectsToChiron === profile.aspectsToChiron &&
      settings.aspectsToLilith === profile.aspectsToLilith &&
      settings.aspectsToLunarNodes === profile.aspectsToLunarNodes &&
      settings.aspectsToVertex === profile.aspectsToVertex &&
      settings.aspectsToPartOfFortune === profile.aspectsToPartOfFortune &&
      settings.aspectsToPartOfSpirit === profile.aspectsToPartOfSpirit &&
      rulership === profile.rulership
    );
  });
}
