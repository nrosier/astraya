/**
 * The calculation basis a chart page states (#509, #510): which profile the chart is cast with and where it came
 * from, so a reader can tell, at a glance, whether the numbers use Astraya's defaults, their own saved default, or
 * a change made for this one chart.
 */
/**
 * @module ui/calculation-basis
 * @purpose Names the effective calculation profile of a chart and the source of its settings, as one line for a page header.
 * @conventions `calculationSource` is pure (settings and rulers against the Astraya default and the saved default); the hook only adds the translated wording. A built-in profile is named by `matchCalculationProfile`, anything else is "Custom".
 * @exports CalculationSource, calculationSource, useCalculationBasisLine
 */
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

/** "Calculation profile: Modern Western — Astraya default", in the reader's language. */
export function useCalculationBasisLine(settings: ExtendedSettings, rulership: RulershipChoice): string {
  const t = useMessages(calculationBasisMessages);
  const names = useMessages(extendedSettingsPanelMessages).presetOptions;
  const [saved] = useDefaultCalculationProfile();
  const profile = matchCalculationProfile(settings, rulership);
  return t.line(
    profile === undefined ? names.custom : names[profile],
    t.sources[calculationSource(settings, rulership, saved)],
  );
}
