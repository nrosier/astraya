/**
 * Sect-correct Part of Fortune, Part of Spirit, and the general Arabic/Hermetic
 * lot formula they're both built from (#29).
 *
 * Every classical part reduces to `base + a - b`, wrapped to a longitude.
 * Fortune and Spirit are the two whose `a`/`b` swap between day and night
 * charts — get the sect backwards and the swap goes the wrong way, silently
 * producing the other part's position instead. `sectReversingPart` makes
 * that swap the one place the direction can be gotten wrong, rather than
 * repeating the day/night branch at every call site.
 *
 * Only Fortune and Spirit are implemented here: unlike those two, most of
 * the wider catalogue of Arabic parts (marriage, death, and the rest) has
 * genuinely disputed formulas across sources, and this project would rather
 * leave a part out than guess at an unverified one — the same call made for
 * the Egyptian/Ptolemaic bounds (see #26). `arabicPart` is exported so
 * further parts can be added later once a formula is actually confirmed.
 */

/**
 * @module ArabicParts
 * @purpose Computes the sect-correct Part of Fortune and Part of Spirit (Arabic/Hermetic lots).
 * @conventions General lot formula is base + a - b wrapped to 360; day/night sect reverses the a/b operand order (sectReversingPart); only Fortune and Spirit are implemented, since the wider catalogue of Arabic parts has disputed formulas across sources.
 * @exports arabicPart, sectReversingPart, partOfFortune, partOfSpirit, LotFormula, LOT_FORMULAS, lotFormulaByKey
 */
import type { Degrees } from '../ephemeris/types.js';
import type { Sect } from './sect.js';
import type { DerivedPointKey } from './derived-points.js';

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** The general lot formula: `base + a - b`, wrapped to [0, 360). */
export function arabicPart(base: Degrees, a: Degrees, b: Degrees): Degrees {
  return norm360(base + a - b);
}

/**
 * A part whose `a`/`b` order reverses between day and night charts. `dayA`
 * and `dayB` are the operands in *day-chart* order; night charts swap them.
 */
export function sectReversingPart(sect: Sect, base: Degrees, dayA: Degrees, dayB: Degrees): Degrees {
  return sect === 'day' ? arabicPart(base, dayA, dayB) : arabicPart(base, dayB, dayA);
}

/**
 * Part of Fortune.
 * Day:   Ascendant + Moon - Sun
 * Night: Ascendant + Sun - Moon
 */
export function partOfFortune(sect: Sect, ascendant: Degrees, sunLongitude: Degrees, moonLongitude: Degrees): Degrees {
  return sectReversingPart(sect, ascendant, moonLongitude, sunLongitude);
}

/**
 * Part of Spirit — the mirror of Fortune, swapping Sun and Moon.
 * Day:   Ascendant + Sun - Moon
 * Night: Ascendant + Moon - Sun
 */
export function partOfSpirit(sect: Sect, ascendant: Degrees, sunLongitude: Degrees, moonLongitude: Degrees): Degrees {
  return sectReversingPart(sect, ascendant, sunLongitude, moonLongitude);
}

/**
 * A lot's own formula, displayed rather than only computed (#550): the day/night operand order,
 * whether it reverses by sect at all (both of the two lots here do; a lot added later might not),
 * and who the formula is attributed to. `source` records what was actually checked, not a
 * specific unverified page — see this module's own doc comment for why no new lot beyond these
 * two was added, and the same honesty applies to the provenance of the two that already exist.
 */
export interface LotFormula {
  readonly key: DerivedPointKey;
  readonly name: string;
  readonly dayFormula: string;
  readonly nightFormula: string;
  readonly reversesBySect: boolean;
  readonly authority: string;
  readonly source: string;
}

export const LOT_FORMULAS: readonly LotFormula[] = [
  {
    key: 'part-of-fortune',
    name: 'Part of Fortune',
    dayFormula: 'Ascendant + Moon − Sun',
    nightFormula: 'Ascendant + Sun − Moon',
    reversesBySect: true,
    authority: 'Hellenistic/traditional (attributed across Valens, Dorotheus, and reproduced by Lilly)',
    source:
      'This exact formula and its day/night reversal is repeated identically across every traditional source checked while implementing this — unlike the wider lot catalogue (marriage, death, and the rest), which genuinely does vary by source and is why this project has not added them.',
  },
  {
    key: 'part-of-spirit',
    name: 'Part of Spirit',
    dayFormula: 'Ascendant + Sun − Moon',
    nightFormula: 'Ascendant + Moon − Sun',
    reversesBySect: true,
    authority: 'Hellenistic/traditional (attributed across Valens, Dorotheus, and reproduced by Lilly)',
    source: 'Same confidence as Part of Fortune above — the mirror formula, swapping Sun and Moon.',
  },
];

export function lotFormulaByKey(key: string): LotFormula | undefined {
  return LOT_FORMULAS.find((lot) => lot.key === key);
}
