/**
 * @module ui/timing-basis
 * @purpose Appends a timing view's own technique items (progression technique and MC method, solar-arc key, primary-direction time key and semi-arc method) to the shared calculation-basis line (#1059).
 * @conventions Pure: the choice and the translated words come in, text goes out. Views append the items with `calculation-basis`'s `withBasisItems`.
 * @exports TimingBasisWords, SolarArcChoice, progressionBasisItems, solarArcBasisItems, primaryDirectionsBasisItems
 */
import type { ProgressedMcMethod } from '../astrology/progressions.js';
import type { PrimaryDirectionMethod } from '../astrology/primary-directions.js';
import type { PrimaryDirectionKey } from '../domain/primary-directions.js';
import type { SolarArcKind, SolarArcMultiplier } from '../astrology/solar-arc-directions.js';
import type { timingBasisMessages } from './timing-basis.messages.js';

export type TimingBasisWords = (typeof timingBasisMessages)['en'];

/** The progression technique, the MC method (secondary only) and the angle method in use. */
export function progressionBasisItems(
  technique: 'secondary' | 'tertiary' | 'minor',
  mcMethod: ProgressedMcMethod,
  t: TimingBasisWords,
): readonly string[] {
  // Tertiary and minor recompute bodies and houses at the progressed moment, i.e. the quotidian angle method.
  return technique === 'secondary'
    ? [t.technique.secondary, t.mcMethod(t.mcMethods[mcMethod]), t.angleMethods[mcMethod]]
    : [t.technique[technique], t.angleMethods.quotidian];
}

/** The arc, its multiplier and the direction in time a Solar Arc screen was set to (#1407). */
export interface SolarArcChoice {
  readonly arcKind: SolarArcKind;
  readonly arcMultiplier: SolarArcMultiplier;
  readonly converse: boolean;
}

/**
 * Solar arc directions: the arc in use (the Sun's progressed arc unless another is chosen), directed in longitude or
 * declination. A non-default choice (#1407) adds its multiplier and converse, and, for the Ascendant and Vertex arcs, how
 * the progressed MC they derive from is reckoned. Declination takes none of these, so they are left out there.
 */
export function solarArcBasisItems(
  t: TimingBasisWords,
  directedIn: 'longitude' | 'declination' = 'longitude',
  choice?: SolarArcChoice,
): readonly string[] {
  if (directedIn === 'declination' || choice === undefined) {
    return [t.solarArc, directedIn === 'declination' ? t.solarArcDeclination : t.solarArcLongitude];
  }
  return [
    t.arcKinds[choice.arcKind],
    t.solarArcLongitude,
    ...(choice.arcKind === 'solar' ? [] : [t.arcAngleMc]),
    ...(choice.arcMultiplier === 1
      ? []
      : [t.arcMultipliers[String(choice.arcMultiplier) as keyof typeof t.arcMultipliers]]),
    ...(choice.converse ? [t.arcConverse] : []),
  ];
}

/** The primary-direction time key, semi-arc method and the fixed ±1° window of arc the view is set to. */
export function primaryDirectionsBasisItems(
  key: PrimaryDirectionKey,
  method: PrimaryDirectionMethod,
  t: TimingBasisWords,
): readonly string[] {
  return [t.directionKeys[key], t.directionMethods[method], t.directionWindow];
}
