/**
 * @module ui/timing-basis
 * @purpose Appends a timing view's own technique items (progression technique and MC method, solar-arc key, primary-direction time key and semi-arc method) to the shared calculation-basis line (#1059).
 * @conventions Pure: the choice and the translated words come in, text goes out. Views append the items with `calculation-basis`'s `withBasisItems`.
 * @exports TimingBasisWords, progressionBasisItems, solarArcBasisItems, primaryDirectionsBasisItems
 */
import type { ProgressedMcMethod } from '../astrology/progressions.js';
import type { PrimaryDirectionMethod } from '../astrology/primary-directions.js';
import type { PrimaryDirectionKey } from '../domain/primary-directions.js';
import type { timingBasisMessages } from './timing-basis.messages.js';

export type TimingBasisWords = (typeof timingBasisMessages)['en'];

/** The progression technique, and for secondary progressions the MC method the view is set to. */
export function progressionBasisItems(
  technique: 'secondary' | 'tertiary' | 'minor',
  mcMethod: ProgressedMcMethod,
  t: TimingBasisWords,
): readonly string[] {
  return technique === 'secondary'
    ? [t.technique.secondary, t.mcMethod(t.mcMethods[mcMethod])]
    : [t.technique[technique]];
}

/** Solar arc directions use one key: the Sun's own progressed arc. */
export function solarArcBasisItems(t: TimingBasisWords): readonly string[] {
  return [t.solarArc];
}

/** The primary-direction time key, semi-arc method and the fixed ±1° window of arc the view is set to. */
export function primaryDirectionsBasisItems(
  key: PrimaryDirectionKey,
  method: PrimaryDirectionMethod,
  t: TimingBasisWords,
): readonly string[] {
  return [t.directionKeys[key], t.directionMethods[method], t.directionWindow];
}
