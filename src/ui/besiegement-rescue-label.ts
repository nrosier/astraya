/**
 * @module ui/besiegement-rescue-label
 * @purpose Words the fortunes easing a besieged planet (#724) as en/nl text shared by the condition table and the consultation highlights.
 * @conventions Pure; names come from `astro-names.messages` so planets and aspects read the same as everywhere else; the surrounding phrase ("eased by ...") stays in each view's own catalogue.
 * @exports besiegementRescueList
 */
import type { BesiegementRescue } from '../astrology/planetary-condition.js';
import type { Locale } from '../interpretation/schema.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';

/** "Jupiter, trine; Venus, sextile" — each easing fortune with the aspect it casts, in the order given. */
export function besiegementRescueList(rescues: readonly BesiegementRescue[], locale: Locale): string {
  return rescues
    .map(
      (rescue) =>
        `${bodyDisplayName(rescue.bodyKey, locale)}, ${aspectDisplayName(rescue.aspect, locale).toLowerCase()}`,
    )
    .join('; ');
}
