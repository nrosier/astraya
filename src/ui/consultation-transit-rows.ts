/**
 * @module ui/consultation-transit-rows
 * @purpose Pure helpers for the consultation transit tables (#800): the next exact pass of a contact and the per-angle grouping of the secondary transits.
 * @conventions No React, no wording; the view words the results. One group per angle (D-800a), always in Ascendant, Midheaven order, so an angle with no contact still gets its own disclosure.
 * @exports ANGLE_ORDER, AngleGroup, nextExactJd, angleGroups
 */
import type { AngleKey, AngleTransit } from '../domain/angle-transits.js';

/** The angles in the order their disclosures are drawn. */
export const ANGLE_ORDER: readonly AngleKey[] = ['asc', 'mc'];

export interface AngleGroup {
  readonly angle: AngleKey;
  readonly contacts: readonly AngleTransit[];
}

/**
 * The first exact pass at or after now, or `undefined` when every known pass is already behind (a separating contact,
 * D-800b) or the passes are not known. The caller shows an em dash for `undefined`.
 */
export function nextExactJd(exactJds: readonly number[] | undefined, nowJd: number): number | undefined {
  if (exactJds === undefined) return undefined;
  return [...exactJds].sort((a, b) => a - b).find((jd) => jd >= nowJd);
}

/** The angle transits split by angle: one group each for the Ascendant and the Midheaven, kept in the given order. */
export function angleGroups(angles: readonly AngleTransit[]): readonly AngleGroup[] {
  return ANGLE_ORDER.map((angle) => ({ angle, contacts: angles.filter((contact) => contact.angle === angle) }));
}
