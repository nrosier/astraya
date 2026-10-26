/**
 * The calculation basis a chart page states (#509, #510): which profile the chart is cast with and where it came
 * from, so a reader can tell, at a glance, whether the numbers use Astraya's defaults, their own saved default, or
 * a change made for this one chart.
 */
/**
 * @module ui/calculation-basis
 * @purpose Names the effective calculation profile of a chart and the source of its settings, as one line for a page header.
 * @conventions `calculationSource` is pure (settings and rulers against the Astraya default and the saved default); the hook only adds the translated wording. A built-in profile is named by `matchCalculationProfile`, anything else is "Custom".
 * @exports CalculationSource, calculationSource, orbSourceName, useCalculationBasisLine
 */
import { CARD_SOURCE, sourceForContext, type OrbContextSource, type OrbLibrary } from '../astrology/orb-library.js';
import { CITED_ORB_PRESETS, isCitedOrbPresetId } from '../astrology/orb-profiles.js';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { matchCalculationProfile } from '../chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { useDefaultCalculationProfile, type DefaultCalculationProfile } from './default-calculation-profile.js';
import { sameSettings } from './extended-settings-summary.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
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

/**
 * "Calculation profile: Modern Western — Astraya default", in the reader's language. `settings` are the person's own
 * (card) settings, not the ones a context calculates with: a device's orb profile is named by `natalOrbSourceName`
 * rather than counted as a change for this chart (#806).
 */
export function useCalculationBasisLine(
  settings: ExtendedSettings,
  rulership: RulershipChoice,
  natalOrbSourceName?: string,
): string {
  const t = useMessages(calculationBasisMessages);
  const names = useMessages(extendedSettingsPanelMessages).presetOptions;
  const [saved] = useDefaultCalculationProfile();
  const profile = matchCalculationProfile(settings, rulership);
  const line = t.line(
    profile === undefined ? names.custom : names[profile],
    t.sources[calculationSource(settings, rulership, saved)],
  );
  return natalOrbSourceName === undefined ? line : `${line}; ${t.orbSource(natalOrbSourceName)}`;
}
