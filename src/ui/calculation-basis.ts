/**
 * The calculation basis a chart page states (#509, #510): which profile the chart is cast with, so a reader can tell,
 * at a glance, what the numbers are calculated with.
 */
/**
 * @module ui/calculation-basis
 * @purpose Builds the full calculation-basis line a calculated page states under its title (#1059): "Tropical · Placidus · Modern rulers · Standard orbs".
 * @conventions `buildCalculationBasisLine` is pure (settings, rulers and an explicit vocabulary in; text out); the hooks only gather the translated vocabulary. `useCalculationBasisLine` takes a person's own settings; `useEngineBasisLine` takes the engine defaults plus a chart type's own orbs and rulers. Orbs are named by the device orb profile when one applies, else the built-in profile the scale matches, else "Custom".
 * @exports BasisParts, orbSourceName, BasisWords, buildCalculationBasisLine, withBasisItems, useCalculationBasisLine, useEngineBasisLine
 */
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import { CARD_SOURCE, sourceForContext, type OrbContextSource, type OrbLibrary } from '../astrology/orb-library.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import { CITED_ORB_PRESETS, isCitedOrbPresetId, matchOrbProfile } from '../astrology/orb-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, withOrbsOf, type ExtendedSettings } from '../chart/extended-settings.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';
import { useMessages } from './messages.js';
import { calculationBasisMessages } from './calculation-basis.messages.js';

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

/** `line` followed by the facts only this page adds (a harmonic number, a relocation place), joined like the line itself. */
export function withBasisItems(line: string, ...items: readonly string[]): string {
  return [line, ...items].join(' · ');
}

/**
 * The basis line for a chart type that calculates with the engine defaults (tropical, the default house system) plus
 * only the orbs `orbsFrom` carries and the given rulers: draconic, harmonic, relocated, synastry and composite take
 * no zodiac or house-system option, so naming the person's own would state a basis the chart does not use.
 * `zodiacLabel` replaces "Tropical" for a chart in another zodiac (the draconic one).
 */
export function useEngineBasisLine(
  rulership: RulershipChoice,
  orbsFrom?: ExtendedSettings,
  zodiacLabel?: string,
  orbProfileName?: string,
): string {
  const words = useBasisWords();
  return buildCalculationBasisLine(
    orbsFrom === undefined ? DEFAULT_EXTENDED_SETTINGS : withOrbsOf(DEFAULT_EXTENDED_SETTINGS, orbsFrom),
    rulership,
    zodiacLabel === undefined ? words : { ...words, t: { ...words.t, tropical: zodiacLabel } },
    orbProfileName,
  );
}
