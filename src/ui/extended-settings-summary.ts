/**
 * Which of the Extended settings differ from their defaults (#442), for the trigger button's summary: it names only
 * what was changed, so a chart on the defaults says nothing and a changed one says what, without opening the card.
 * Pure, so it is tested without a DOM; the words come from the panel's own messages.
 */
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';

export type ChangedSetting =
  | 'houseSystem'
  | 'zodiac'
  | 'orbScale'
  | 'minorAspects'
  | 'fortune'
  | 'vertex'
  | 'chiron'
  | 'midpoints'
  | 'lilith'
  | 'node'
  | 'aspectsTo'
  | 'rainbow';

export function changedSettings(value: ExtendedSettings): readonly ChangedSetting[] {
  const defaults = DEFAULT_EXTENDED_SETTINGS;
  const changed: ChangedSetting[] = [];
  if (value.houseSystem !== defaults.houseSystem) changed.push('houseSystem');
  if (JSON.stringify(value.zodiac) !== JSON.stringify(defaults.zodiac)) changed.push('zodiac');
  if (value.orbScalePercent !== defaults.orbScalePercent) changed.push('orbScale');
  if (value.enabledMinorAspects.length !== defaults.enabledMinorAspects.length) changed.push('minorAspects');
  if (value.fortuneVisible !== defaults.fortuneVisible) changed.push('fortune');
  if (value.vertexVisible !== defaults.vertexVisible) changed.push('vertex');
  if (value.chironVisible !== defaults.chironVisible) changed.push('chiron');
  if (value.midpointsVisible !== defaults.midpointsVisible) changed.push('midpoints');
  if (value.lilithVariant !== defaults.lilithVariant) changed.push('lilith');
  if (value.nodeVariant !== defaults.nodeVariant) changed.push('node');
  if (
    value.aspectsToChiron !== defaults.aspectsToChiron ||
    value.aspectsToLilith !== defaults.aspectsToLilith ||
    value.aspectsToLunarNodes !== defaults.aspectsToLunarNodes
  ) {
    changed.push('aspectsTo');
  }
  if (value.rainbowZodiac !== defaults.rainbowZodiac) changed.push('rainbow');
  return changed;
}

/** Whether two settings are the same in every field (the draft against the applied value). */
export function sameSettings(a: ExtendedSettings, b: ExtendedSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
