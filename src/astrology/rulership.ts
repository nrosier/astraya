/**
 * Which planets rule which signs, as the reader chooses it (#426) — the one place that defines the
 * rulers for each choice, so the chart ruler, the houses a planet rules, dispositors, essential
 * dignities, profections, the almuten and the AI payload all read the same thing.
 *
 * - **Modern** (the default): Pluto rules Scorpio, Uranus Aquarius, Neptune Pisces.
 * - **Traditional**: the seven classical planets only — Mars rules Scorpio, Saturn Aquarius,
 *   Jupiter Pisces.
 * - **Both**: co-rulers. Scorpio is ruled by Mars and Pluto, Aquarius by Saturn and Uranus, Pisces
 *   by Jupiter and Neptune, listed traditional ruler first. Every question "who rules this sign?"
 *   then has up to two answers, and a planet holds a dignity if it holds it under either.
 *
 * Only Scorpio, Aquarius and Pisces differ between the choices. Exaltation and fall are not part of
 * the choice: no tradition gives the outer planets one, so they hold only ruler and detriment.
 *
 * Anything that needs *one* ruler (a dispositor chain, a single "lord of the year") follows the
 * `primaryRulerOf` — the traditional ruler under Traditional, the modern one otherwise — and says
 * so where the reader can see it.
 */
import type { BodyId, Degrees } from '../ephemeris/types.js';
import { exaltationRulerOf, fallRulerOf, rulerOf, type EssentialDignities, type RulershipScheme } from './dignities.js';
import { signIndex } from './signs.js';

export type RulershipChoice = RulershipScheme | 'both';

export const RULERSHIP_CHOICES: readonly RulershipChoice[] = ['modern', 'traditional', 'both'];
export const DEFAULT_RULERSHIP_CHOICE: RulershipChoice = 'modern';

export function isRulershipChoice(value: unknown): value is RulershipChoice {
  return value === 'modern' || value === 'traditional' || value === 'both';
}

/** Every planet that rules `sign` (0 = Aries … 11 = Pisces): one, or two co-rulers under `both`. */
export function rulersOf(sign: number, choice: RulershipChoice): readonly BodyId[] {
  if (choice === 'both') {
    const traditional = rulerOf(sign, 'traditional');
    const modern = rulerOf(sign, 'modern');
    return traditional === modern ? [traditional] : [traditional, modern];
  }
  return [rulerOf(sign, choice)];
}

/** The scheme to walk when one ruler is needed: traditional under Traditional, modern under Modern and Both. */
export function singleRulerScheme(choice: RulershipChoice): RulershipScheme {
  return choice === 'traditional' ? 'traditional' : 'modern';
}

/** The ruler a single-path question follows (see the file doc). */
export function primaryRulerOf(sign: number, choice: RulershipChoice): BodyId {
  return rulerOf(sign, singleRulerScheme(choice));
}

/** The rulers of the sign opposite `sign`: whoever is in detriment in `sign`. */
export function detrimentRulersOf(sign: number, choice: RulershipChoice): readonly BodyId[] {
  return rulersOf((sign + 6) % 12, choice);
}

/** Which essential dignities `body` holds at `longitude` under `choice` (`essentialDignities`, for a reader's choice). */
export function essentialDignitiesFor(body: BodyId, longitude: Degrees, choice: RulershipChoice): EssentialDignities {
  const sign = signIndex(longitude);
  return {
    ruler: rulersOf(sign, choice).includes(body),
    exalted: exaltationRulerOf(sign) === body,
    detriment: detrimentRulersOf(sign, choice).includes(body),
    fall: fallRulerOf(sign) === body,
  };
}
