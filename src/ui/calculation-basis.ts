/**
 * The calculation basis a chart page states (#509, #510): which profile the chart is cast with and where it came
 * from, so a reader can tell, at a glance, whether the numbers use Astraya's defaults, their own saved default, or
 * a change made for this one chart.
 */
/**
 * @module ui/calculation-basis
 * @purpose Builds the full calculation-basis line a calculated page states under its title (#1059): "Tropical · Placidus · Modern rulers · Standard orbs".
 * @conventions `buildCalculationBasisLine` and `calculationSource` are pure (settings, rulers and an explicit vocabulary in; text out); the two hooks only gather the translated vocabulary. `useCalculationBasisLine` takes a person's own settings; `useDeviceCalculationBasisLine` takes the device defaults, for views with no person. Orbs are named by the device orb profile when one applies, else the built-in profile the scale matches, else "Custom".
 * @exports BasisParts, CalculationSource, calculationSource, orbSourceName, BasisWords, buildCalculationBasisLine, useCalculationBasisLine, useDeviceCalculationBasisLine
 */
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import { CARD_SOURCE, sourceForContext, type OrbContextSource, type OrbLibrary } from '../astrology/orb-library.js';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { CITED_ORB_PRESETS, isCitedOrbPresetId, matchOrbProfile } from '../astrology/orb-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { useDefaultCalculationProfile, type DefaultCalculationProfile } from './default-calculation-profile.js';
import { sameSettings } from './extended-settings-summary.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';
import { useMessages } from './messages.js';
import { calculationBasisMessages } from './calculation-basis.messages.js';

export type CalculationSource = 'astraya-default' | 'my-default' | 'this-chart';

/** Where `settings` and `rulership` come from: the shipped default, the user's saved one, or neither (changed for this chart). */
export function calculationSource(
  settings: ExtendedSettings,
  rulership: RulershipChoice,
  saved: DefaultCalculationProfile | undefined,
): CalculationSource {
  if (sameSettings(settings, DEFAULT_EXTENDED_SETTINGS) && rulership === DEFAULT_RULERSHIP_CHOICE) {
    return 'astraya-default';
  }
  if (saved !== undefined && sameSettings(settings, saved.settings) && rulership === saved.rulership) {
    return 'my-default';
  }
  return 'this-chart';
}

/**
 * The name of the orb profile `context` calculates with (#590), or undefined when the card's own orbs apply or the
 * profile it names no longer exists (`sourceForContext` falls back to the card then).
 */
export function orbSourceName(
  library: OrbLibrary,
  sources: OrbContextSource,
  context: keyof OrbContextSource,
): string | undefined {
  const choice = sourceForContext(library, sources, context);
  if (choice === CARD_SOURCE) return undefined;
  if (isCitedOrbPresetId(choice)) return CITED_ORB_PRESETS[choice].name;
  return library.profiles.find((profile) => profile.id === choice)?.name;
}

/** The translated words the line is assembled from, passed in so the builder stays pure. */
export interface BasisWords {
  readonly t: (typeof calculationBasisMessages)['en'];
  readonly rulerTitles: Readonly<Record<RulershipChoice, string>>;
  readonly orbProfileTitles: Readonly<Record<'custom' | 'standard-v1' | 'tight-v1' | 'wide-v1', string>>;
}

/**
 * Which items of the line a view states, for views whose calculation does not use all four (#1059). Default: all
 * four, houses from the settings. `houses: 'whole-sign'` is for profections, which count whole-sign houses whatever
 * the house system.
 */
export interface BasisParts {
  readonly houses?: 'settings' | 'whole-sign';
  readonly rulers?: boolean;
  readonly orbs?: boolean;
}

function houseSystemName(code: string): string {
  const key = HOUSE_SYSTEMS.find((system) => system.code === code)?.key ?? code;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * "Tropical · Placidus · Modern rulers · Standard orbs": the zodiac, house system, rulership and orbs `settings`
 * resolve to. `deviceOrbProfile` is the name of an orb profile the device applies on top of the card's own orbs
 * (#806); it names the orbs when present. Orbs edited on the card, or matching no built-in profile, read "Custom".
 */
export function buildCalculationBasisLine(
  settings: ExtendedSettings,
  rulership: RulershipChoice,
  words: BasisWords,
  deviceOrbProfile?: string,
  parts: BasisParts = {},
): string {
  const { t } = words;
  const builtIn = settings.orbRules === undefined ? matchOrbProfile(settings.orbScalePercent) : undefined;
  const zodiac = settings.zodiac.kind === 'sidereal' ? t.sidereal : t.tropical;
  const houses = parts.houses === 'whole-sign' ? t.wholeSign : houseSystemName(settings.houseSystem);
  const rulers = t.rulers(words.rulerTitles[rulership]);
  const orbs = t.orbs(deviceOrbProfile ?? words.orbProfileTitles[builtIn ?? 'custom']);
  if (parts.houses === undefined && parts.rulers !== false && parts.orbs !== false) {
    return t.line(zodiac, houses, rulers, orbs);
  }
  return [zodiac, houses, parts.rulers === false ? '' : rulers, parts.orbs === false ? '' : orbs]
    .filter((item) => item !== '')
    .join(' · ');
}

function useBasisWords(): BasisWords {
  return {
    t: useMessages(calculationBasisMessages),
    rulerTitles: useMessages(rulershipSettingMessages).titles,
    orbProfileTitles: useMessages(extendedSettingsPanelMessages).orbProfileOptions,
  };
}

/**
 * The basis line for a person's own `settings` and `rulership`, in the reader's language. `settings` are the card's,
 * not the ones a context calculates with: a device's orb profile is named by `natalOrbSourceName` (#806).
 */
export function useCalculationBasisLine(
  settings: ExtendedSettings,
  rulership: RulershipChoice,
  natalOrbSourceName?: string,
  parts?: BasisParts,
): string {
  return buildCalculationBasisLine(settings, rulership, useBasisWords(), natalOrbSourceName, parts);
}

/**
 * The basis line for a view with no person (Cycles, Event search, Eclipses, Electional, Rectification, Horary): the
 * device's saved default profile, else Astraya's shipped default, which is what such a view calculates with.
 */
export function useDeviceCalculationBasisLine(deviceOrbProfile?: string): string {
  const [saved] = useDefaultCalculationProfile();
  return buildCalculationBasisLine(
    saved?.settings ?? DEFAULT_EXTENDED_SETTINGS,
    saved?.rulership ?? DEFAULT_RULERSHIP_CHOICE,
    useBasisWords(),
    deviceOrbProfile,
  );
}
