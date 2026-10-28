/**
 * The "considerations before judgment" of horary astrology (#406): the standard checks that a
 * chart cast for the moment a question was asked is fit to be judged at all.
 *
 * Horary reads a chart cast for the moment of a *question*, not a birth, and the tradition opens
 * with a short list of conditions under which the chart is said not to be "radical" — not safe to
 * answer from (William Lilly, *Christian Astrology*, 1647, Book I, "Considerations before Judgment",
 * pp. 121-123; the same list is repeated in most later horary texts). They are warnings to the astrologer, not hard prohibitions: a chart
 * that trips one is still a chart, and some practitioners would judge it anyway with care.
 *
 * Stated here, since schools differ on the finer points:
 *
 * - **Ascendant too early / too late** — Lilly says not to judge when 0, 1 or 2 degrees ascend, or when
 *   27, 28 or 29 degrees ascend (p. 122), which is the first and last 3° of the sign: too early, the
 *   matter is not yet ripe to judge; too late, it is already decided.
 * - **Moon void of course** — the Moon will make no further exact aspect before leaving its sign
 *   (see `void-of-course.ts` for the convention used: major aspects to the Sun and Mercury–Pluto).
 *   "Nothing will come of the matter." Lilly (Book I p. 122; Book II aphorism 9, p. 299) says matters "goe hardly on"
 *   when the Moon is void, yet she "performes somewhat" in Taurus, Cancer, Sagittarius or Pisces, "for then she is not
 *   much impedited": there the caution is still shown but is softened, and does not make the chart not radical.
 * - **Moon in the Via Combusta** — the Moon between 15° Libra and 15° Scorpio, the "burnt way" (Lilly
 *   gives it as "as some say", p. 122).
 * - **Saturn in the seventh house** — Saturn, as the traditional malefic, in the house of the
 *   astrologer, impairs the astrologer's own judgment (Lilly attributes this to Alkindus and the Arabians,
 *   pp. 122-123).
 *
 * Only these four are checked. Lilly lists further considerations (the lord of the Ascendant
 * combust, the querent's and quesited's significators afflicted, and so on) that depend on *what
 * was asked*, which no chart can tell — those belong to the judgment itself, which this module does
 * not attempt.
 *
 * One consideration Lilly states about the chart alone is deliberately NOT checked: that it is "not safe
 * to judge when the Moon is in the later degrees of a Signe, especially in Gemini, Scorpio or
 * Capricorn" (Book I, p. 122). He gives no number for "the later degrees", and this module does not
 * invent one: using the Ascendant's 27° would present a guess as his rule. A chart with the Moon at the
 * end of a sign can therefore read as fit to be judged. See `lilly-i-moon-later-degrees` in
 * `docs/references/topics/orb-conventions.json`; if a source gives a threshold, add it there first.
 */

/**
 * @module Horary
 * @purpose Checks the classical "considerations before judgment" that determine whether a horary chart is fit to be judged (radical).
 * @conventions Based on Lilly's Christian Astrology (1647), Book I, "Considerations before Judgment", pp. 121-123 (transcribed in docs/references/topics/orb-conventions.json); only four of Lilly's considerations are checked (Ascendant too early/late, Moon void of course, Moon in the Via Combusta, Saturn in the seventh house), since the rest depend on the content of the question asked, which no chart alone can tell.
 * @exports horaryConsiderations, isRadical, ASCENDANT_EARLY_LIMIT_DEG, ASCENDANT_LATE_LIMIT_DEG, VIA_COMBUSTA_START_DEG, VIA_COMBUSTA_END_DEG
 */
import type { Degrees } from '../ephemeris/types.js';
import { degreesInSign, signIndex } from './signs.js';

export type HoraryConsiderationKey =
  'ascendant-too-early' | 'ascendant-too-late' | 'moon-void-of-course' | 'moon-via-combusta' | 'saturn-in-seventh';

/** The Ascendant is "too early" below 3° into its sign and "too late" above 27° (Lilly, Book I, p. 122: 0-2 and 27-29 degrees). */
export const ASCENDANT_EARLY_LIMIT_DEG = 3;
export const ASCENDANT_LATE_LIMIT_DEG = 27;

/** The Via Combusta runs from 15° Libra (195°) up to, but not including, 15° Scorpio (225°). */
export const VIA_COMBUSTA_START_DEG = 195;
export const VIA_COMBUSTA_END_DEG = 225;

export interface HoraryConsideration {
  readonly key: HoraryConsiderationKey;
  /** True when the condition holds, i.e. the chart carries this caution. */
  readonly applies: boolean;
  /**
   * True when the condition holds but Lilly says it weighs less: a void Moon in Taurus, Cancer, Sagittarius or
   * Pisces. Such a consideration still applies and is still shown, but does not make the chart not radical.
   */
  readonly softened: boolean;
}

/** Signs in which a void Moon is "not much impedited" (Lilly, Book II, aphorism 9, p. 299; Book I, p. 122): Taurus, Cancer, Sagittarius, Pisces. */
export const VOID_MOON_SOFTENED_SIGNS: readonly number[] = [1, 3, 8, 11];

export interface HoraryInput {
  readonly ascendant: Degrees;
  readonly moonLongitude: Degrees;
  /** Which house Saturn is in (1-12), or `undefined` when the houses cannot be cast. */
  readonly saturnHouse: number | undefined;
  readonly moonIsVoid: boolean;
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

export function horaryConsiderations(input: HoraryInput): readonly HoraryConsideration[] {
  const ascendantDegree = degreesInSign(input.ascendant);
  const moon = norm360(input.moonLongitude);
  const voidMoonSoftened = input.moonIsVoid && VOID_MOON_SOFTENED_SIGNS.includes(signIndex(moon));
  return [
    { key: 'ascendant-too-early', applies: ascendantDegree < ASCENDANT_EARLY_LIMIT_DEG, softened: false },
    { key: 'ascendant-too-late', applies: ascendantDegree > ASCENDANT_LATE_LIMIT_DEG, softened: false },
    { key: 'moon-void-of-course', applies: input.moonIsVoid, softened: voidMoonSoftened },
    {
      key: 'moon-via-combusta',
      applies: moon >= VIA_COMBUSTA_START_DEG && moon < VIA_COMBUSTA_END_DEG,
      softened: false,
    },
    { key: 'saturn-in-seventh', applies: input.saturnHouse === 7, softened: false },
  ];
}

/** A chart is "radical" — fit to be judged — when it carries none of the cautions. A softened caution does not count against it. */
export function isRadical(considerations: readonly HoraryConsideration[]): boolean {
  return considerations.every((consideration) => !consideration.applies || consideration.softened);
}
