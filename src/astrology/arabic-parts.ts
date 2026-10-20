/**
 * Sect-correct Paulus's seven Hermetic lots, and the general Arabic/Hermetic
 * lot formula they are all built from (#29, #740).
 *
 * Every classical part reduces to `base + a - b`, wrapped to a longitude.
 * Each Hermetic lot is "measure from X to Y, then project the same distance
 * from the Ascendant", and the X/Y order swaps between day and night charts —
 * get the sect backwards and the swap goes the wrong way, silently
 * producing the mirror lot's position instead. `sectReversingPart` makes
 * that swap the one place the direction can be gotten wrong, rather than
 * repeating the day/night branch at every call site.
 *
 * The catalogue is exactly Paulus's seven (Introduction 23, as presented in
 * Hellenistic astrology, Chapter 16, printed pp. 525-526): Fortune and Spirit
 * from the luminaries, and Eros, Necessity, Courage, Victory and Nemesis from
 * a planet and Fortune or Spirit. Eros, Necessity, Courage, Victory and Nemesis
 * take the Fortune and Spirit longitudes as inputs, so compute those first.
 * Other authors' variants (Valens's and Dorotheus's Eros and Necessity) and
 * the family lots (parents, siblings, marriage, children) are deliberately
 * not here: a lot is added only with its author named and its formula checked
 * against the source (the same call made for the Egyptian/Ptolemaic bounds,
 * see #26). `arabicPart` is exported so further lots can be added later.
 */

/**
 * @module ArabicParts
 * @purpose Computes Paulus's seven Hermetic lots (Fortune, Spirit, Eros, Necessity, Courage, Victory, Nemesis) and records each lot's cited formula.
 * @conventions General lot formula is base + a - b wrapped to 360; day/night sect reverses the a/b operand order (sectReversingPart); Eros, Necessity, Courage, Victory and Nemesis take the Fortune/Spirit longitudes as inputs; only Paulus's set is implemented (one named authority per lot). LotKey is separate from DerivedPointKey (the corpus vocabulary), so these lots are not in the Derived points table or corpus.
 * @exports arabicPart, sectReversingPart, partOfFortune, partOfSpirit, lotOfEros, lotOfNecessity, lotOfCourage, lotOfVictory, lotOfNemesis, LotKey, LotFormula, LOT_FORMULAS, lotFormulaByKey
 */
import type { Degrees } from '../ephemeris/types.js';
import type { Sect } from './sect.js';

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
 * Lot of Eros (Paulus, Introduction 23; printed p. 525).
 * Day:   Ascendant + Venus - Spirit  (measure from Spirit to Venus)
 * Night: Ascendant + Spirit - Venus
 */
export function lotOfEros(sect: Sect, ascendant: Degrees, venusLongitude: Degrees, spiritLongitude: Degrees): Degrees {
  return sectReversingPart(sect, ascendant, venusLongitude, spiritLongitude);
}

/**
 * Lot of Necessity (Paulus; printed p. 526).
 * Day:   Ascendant + Fortune - Mercury  (measure from Mercury to Fortune)
 * Night: Ascendant + Mercury - Fortune
 */
export function lotOfNecessity(
  sect: Sect,
  ascendant: Degrees,
  mercuryLongitude: Degrees,
  fortuneLongitude: Degrees,
): Degrees {
  return sectReversingPart(sect, ascendant, fortuneLongitude, mercuryLongitude);
}

/**
 * Lot of Courage (Paulus; printed p. 526).
 * Day:   Ascendant + Fortune - Mars  (measure from Mars to Fortune)
 * Night: Ascendant + Mars - Fortune
 */
export function lotOfCourage(
  sect: Sect,
  ascendant: Degrees,
  marsLongitude: Degrees,
  fortuneLongitude: Degrees,
): Degrees {
  return sectReversingPart(sect, ascendant, fortuneLongitude, marsLongitude);
}

/**
 * Lot of Victory (Paulus; printed p. 526).
 * Day:   Ascendant + Jupiter - Spirit  (measure from Spirit to Jupiter)
 * Night: Ascendant + Spirit - Jupiter
 */
export function lotOfVictory(
  sect: Sect,
  ascendant: Degrees,
  jupiterLongitude: Degrees,
  spiritLongitude: Degrees,
): Degrees {
  return sectReversingPart(sect, ascendant, jupiterLongitude, spiritLongitude);
}

/**
 * Lot of Nemesis (Paulus; printed p. 526).
 * Day:   Ascendant + Fortune - Saturn  (measure from Saturn to Fortune)
 * Night: Ascendant + Saturn - Fortune
 */
export function lotOfNemesis(
  sect: Sect,
  ascendant: Degrees,
  saturnLongitude: Degrees,
  fortuneLongitude: Degrees,
): Degrees {
  return sectReversingPart(sect, ascendant, fortuneLongitude, saturnLongitude);
}

/** The keys of the lots in `LOT_FORMULAS`: Paulus's seven Hermetic lots. Not the corpus vocabulary (`DerivedPointKey`). */
export type LotKey =
  | 'part-of-fortune'
  | 'part-of-spirit'
  | 'lot-of-eros'
  | 'lot-of-necessity'
  | 'lot-of-courage'
  | 'lot-of-victory'
  | 'lot-of-nemesis';

/**
 * A lot's own formula, displayed rather than only computed (#550): the day/night operand order,
 * whether it reverses by sect at all (all seven do; a lot added later might not), and who the
 * formula is attributed to. `source` records what was actually checked, with the printed pages.
 */
export interface LotFormula {
  readonly key: LotKey;
  readonly name: string;
  readonly dayFormula: string;
  readonly nightFormula: string;
  readonly reversesBySect: boolean;
  readonly authority: string;
  readonly source: string;
}

const PAULUS_AUTHORITY = 'Paulus, Introduction 23 (via Hellenistic astrology, Chapter 16, pp. 525–526)';

export const LOT_FORMULAS: readonly LotFormula[] = [
  {
    key: 'part-of-fortune',
    name: 'Part of Fortune',
    dayFormula: 'Ascendant + Moon − Sun',
    nightFormula: 'Ascendant + Sun − Moon',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 525 (The Seven Hermetic Lots): by day measure from the Sun to the Moon, by night from the Moon to the Sun, then the same distance from the Ascendant. Valens and Dorotheus use the same reversed calculation (p. 522).',
  },
  {
    key: 'part-of-spirit',
    name: 'Part of Spirit',
    dayFormula: 'Ascendant + Sun − Moon',
    nightFormula: 'Ascendant + Moon − Sun',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 525: by day measure from the Moon to the Sun, by night from the Sun to the Moon, then the same distance from the Ascendant. The mirror of Fortune.',
  },
  {
    key: 'lot-of-eros',
    name: 'Lot of Eros',
    dayFormula: 'Ascendant + Venus − Part of Spirit',
    nightFormula: 'Ascendant + Part of Spirit − Venus',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 525: by day measure from the Lot of Spirit to Venus, by night from Venus to the Lot of Spirit, then the same from the Ascendant. Paulus’s version only; the Valens/Dorotheus variant (pp. 527–528) is not used.',
  },
  {
    key: 'lot-of-necessity',
    name: 'Lot of Necessity',
    dayFormula: 'Ascendant + Part of Fortune − Mercury',
    nightFormula: 'Ascendant + Mercury − Part of Fortune',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 526: by day measure from Mercury to the Lot of Fortune, by night from the Lot of Fortune to Mercury, then the same from the Ascendant. Paulus’s version only; the Valens/Dorotheus variant (pp. 527–528) is not used.',
  },
  {
    key: 'lot-of-courage',
    name: 'Lot of Courage',
    dayFormula: 'Ascendant + Part of Fortune − Mars',
    nightFormula: 'Ascendant + Mars − Part of Fortune',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 526: from Mars to the Lot of Fortune by day, by night from the Lot of Fortune to Mars, then the same from the Ascendant.',
  },
  {
    key: 'lot-of-victory',
    name: 'Lot of Victory',
    dayFormula: 'Ascendant + Jupiter − Part of Spirit',
    nightFormula: 'Ascendant + Part of Spirit − Jupiter',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 526: from the Lot of Spirit to Jupiter by day, by night from Jupiter to the Lot of Spirit. The book gives no explicit "then from the Ascendant" clause for Victory; the chapter’s pattern for the other Hermetic lots is applied.',
  },
  {
    key: 'lot-of-nemesis',
    name: 'Lot of Nemesis',
    dayFormula: 'Ascendant + Part of Fortune − Saturn',
    nightFormula: 'Ascendant + Saturn − Part of Fortune',
    reversesBySect: true,
    authority: PAULUS_AUTHORITY,
    source:
      'Hellenistic astrology, Chapter 16, printed p. 526: from Saturn to the Lot of Fortune by day, by night from the Lot of Fortune to Saturn, then the same from the Ascendant. Holden calls it the Lot of Retribution.',
  },
];

export function lotFormulaByKey(key: string): LotFormula | undefined {
  return LOT_FORMULAS.find((lot) => lot.key === key);
}
