/**
 * @module ui/acg-star-tooltip
 * @purpose The words of the fixed-star line tooltip on the Astrocartography map (#2018): the star's name, the angle and the star's right ascension and declination.
 * @conventions Pure; looks the hovered line up by the `data-star` and `data-angle` the map markup carries. No orb and no distance, by the owner's decision on #2018: a fixed-star line has no orb of its own. Words from AstrocartographyView.messages.
 * @exports starTooltipOf, StarTooltip
 */
import type { AcgMapInput } from '../chart/acg-map.js';
import type { Locale } from '../interpretation/schema.js';
import { starPositionText } from './acg-map-equivalent.js';
import { astrocartographyViewMessages } from './AstrocartographyView.messages.js';

/** The two lines of the tooltip: `Regulus MC`, then `RA 152.09° · Dec 11.97°`. */
export interface StarTooltip {
  readonly title: string;
  readonly position: string;
}

const ANGLES: readonly string[] = ['MC', 'IC', 'AC', 'DC'];

/** The tooltip for the star line named `star` at `angle`, or `undefined` when the map has no such line. */
export function starTooltipOf(
  input: AcgMapInput,
  star: string | null,
  angle: string | null,
  locale: Locale,
): StarTooltip | undefined {
  if (star === null || angle === null || !ANGLES.includes(angle)) return undefined;
  const entry = input.fixedStarLines?.find(
    (candidate) => candidate.star === star && candidate.lines.some((line) => line.kind === angle),
  );
  if (entry === undefined) return undefined;
  return { title: `${entry.star} ${angle}`, position: starPositionText(entry, astrocartographyViewMessages[locale]) };
}
