/**
 * Which of a person's requested calculation settings primary directions ignore (#797).
 */
/**
 * @module domain/primary-directions-settings
 * @purpose Pure comparison of a requested calculation snapshot against the locked settings primary directions are computed with.
 * @conventions Compares only the settings that change a primary-direction result or its labels: house system, zodiac (kind and ayanamsa), rulership, node variant and Lilith variant. Returns stable setting keys, never display text, so the UI owns the wording.
 * @exports PrimaryDirectionsMismatch, differingPrimaryDirectionsSettings
 */
import type { CalculationSnapshot } from './calculation-snapshot.js';
import { PRIMARY_DIRECTIONS_EFFECTIVE_SNAPSHOT } from './calculation-artifact.js';

export type PrimaryDirectionsMismatch = 'houseSystem' | 'zodiac' | 'rulership' | 'nodeVariant' | 'lilithVariant';

/** The settings in `requested` that differ from what primary directions really use, in a fixed order. */
export function differingPrimaryDirectionsSettings(
  requested: CalculationSnapshot,
  effective: CalculationSnapshot = PRIMARY_DIRECTIONS_EFFECTIVE_SNAPSHOT,
): readonly PrimaryDirectionsMismatch[] {
  const a = requested.settings;
  const b = effective.settings;
  const differing: PrimaryDirectionsMismatch[] = [];
  if (a.houseSystem !== b.houseSystem) differing.push('houseSystem');
  if (JSON.stringify(a.zodiac) !== JSON.stringify(b.zodiac)) differing.push('zodiac');
  if (requested.rulership !== effective.rulership) differing.push('rulership');
  if (a.nodeVariant !== b.nodeVariant) differing.push('nodeVariant');
  if (a.lilithVariant !== b.lilithVariant) differing.push('lilithVariant');
  return differing;
}
