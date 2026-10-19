/**
 * Which of the Extended settings differ from their defaults (#442), for the trigger button's summary: it names only
 * what was changed, so a chart on the defaults says nothing and a changed one says what, without opening the card.
 * Pure, so it is tested without a DOM; the words come from the panel's own messages.
 */
/**
 * @module ui/extended-settings-summary
 * @purpose Determines which Extended settings (#442) differ from their defaults, so the settings trigger button can summarize what changed without opening the panel.
 * @conventions Pure, tested without a DOM; the actual wording comes from the Extended settings panel's own messages, keyed by the returned ChangedSetting values.
 * @exports ChangedSetting, changedSettings, sameSettings
 */
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';

export type ChangedSetting =
  | 'houseSystem'
  | 'zodiac'
  | 'orbScale'
  /** The practitioner's own per-aspect or per-body orbs (#590). */
  | 'orbRules'
  | 'boundsScheme'
  | 'minorAspects'
  /** Any object's visibility or aspect-participation differs from the defaults (#585) — collapses what used to be six separate flags (fortune/vertex/spirit/chiron/modernPoints/aspectsTo) into one, since they all now live in one `objectPolicies` field. */
  | 'objectPolicies'
  | 'midpoints'
  | 'lilith'
  | 'node'
  | 'rainbow'
  /** The station window (#724), an Astraya convention, on. */
  | 'stationWindow'
  /** The motion score (#724), on. */
  | 'motionScore';

export function changedSettings(value: ExtendedSettings): readonly ChangedSetting[] {
  const defaults = DEFAULT_EXTENDED_SETTINGS;
  const changed: ChangedSetting[] = [];
  if (value.houseSystem !== defaults.houseSystem) changed.push('houseSystem');
  if (JSON.stringify(value.zodiac) !== JSON.stringify(defaults.zodiac)) changed.push('zodiac');
  if (value.orbScalePercent !== defaults.orbScalePercent) changed.push('orbScale');
  if (value.orbRules !== undefined) changed.push('orbRules');
  if (value.boundsScheme !== defaults.boundsScheme) changed.push('boundsScheme');
  if (value.enabledMinorAspects.length !== defaults.enabledMinorAspects.length) changed.push('minorAspects');
  if (JSON.stringify(value.objectPolicies) !== JSON.stringify(defaults.objectPolicies)) {
    changed.push('objectPolicies');
  }
  if (value.midpointsVisible !== defaults.midpointsVisible) changed.push('midpoints');
  if (value.lilithVariant !== defaults.lilithVariant) changed.push('lilith');
  if (value.nodeVariant !== defaults.nodeVariant) changed.push('node');
  if (value.rainbowZodiac !== defaults.rainbowZodiac) changed.push('rainbow');
  if (value.stationWindow !== undefined) changed.push('stationWindow');
  if (value.motionScore === true) changed.push('motionScore');
  return changed;
}

/** Whether two settings are the same in every field (the draft against the applied value). */
export function sameSettings(a: ExtendedSettings, b: ExtendedSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
