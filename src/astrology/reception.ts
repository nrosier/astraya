/**
 * Reception (#548): whether a planet stands in another's essential dignity, across all five
 * dignity types (domicile, exaltation, triplicity, bound, face) rather than only domicile
 * (`dispositors.ts`'s existing `isMutualReception` is domicile-only, kept as-is since dispositor
 * chains are specifically a domicile-ruler concept — this module is additive, not a replacement).
 *
 * Mutual reception (classically the strong form) is each planet in the *same* dignity type of
 * the other — e.g. both by domicile, or both by exaltation. Mixed reception is each planet
 * receiving the other, but by different dignity types (e.g. A in B's domicile while B is in A's
 * exaltation) — traditionally weaker than same-type mutual reception, but still a real
 * connection. One-way reception is just one side; this module reports all three distinctly
 * rather than collapsing them into a single boolean.
 *
 * Aspect-linked reception (whether the two receiving bodies are also in aspect) is deliberately
 * not computed here — this module has no dependency on aspect-finding, which already has its
 * own orb/context rules (`aspects.ts`, `orb-profiles.ts`); a caller that already has a chart's
 * computed aspects (`chart-tables.ts`) cross-references them against this module's receptions
 * instead of this module recomputing aspects itself.
 */
/**
 * @module astrology/reception
 * @purpose Computes essential-dignity-based reception (domicile/exaltation/triplicity/bound/face) between two bodies, including mutual and mixed reception.
 * @conventions Reuses the five existing dignity-table lookups (rulership.ts/dignities.ts/triplicity.ts/bounds.ts/decans.ts) as the sole source of truth — no dignity table is duplicated here. Triplicity counts only the chart's sect-appropriate ruler (day ruler in a day chart, night in a night chart), matching almuten.ts's own convention, never the participating ruler.
 * @exports DignityType, DignityRuler, dignityRulersOf, Reception, receptionsOf, ReceptionKind, MutualReceptionResult, mutualReceptionBetween
 */
import type { BodyId, Degrees } from '../ephemeris/types.js';
import type { BoundsScheme } from './bounds.js';
import { boundRulerOf } from './bounds.js';
import { faceRulerOf } from './decans.js';
import { exaltationRulerOf, rulerOf, type RulershipScheme } from './dignities.js';
import type { Sect } from './sect.js';
import { signIndex } from './signs.js';
import { triplicityRulersAt } from './triplicity.js';

export type DignityType = 'domicile' | 'exaltation' | 'triplicity' | 'bound' | 'face';

export interface DignityRuler {
  readonly ruler: BodyId;
  readonly dignityType: DignityType;
}

/**
 * Every dignity-based ruler of a position — i.e. every body that "receives" a planet placed
 * here, and by which dignity. Up to four entries (domicile, triplicity, bound, face always
 * apply; exaltation only for the five signs that have one).
 */
export function dignityRulersOf(
  longitude: Degrees,
  sect: Sect,
  scheme: RulershipScheme = 'traditional',
  boundsScheme: BoundsScheme = 'egyptian',
): readonly DignityRuler[] {
  const sign = signIndex(longitude);
  const triplicity = triplicityRulersAt(longitude);
  const rulers: DignityRuler[] = [
    { ruler: rulerOf(sign, scheme), dignityType: 'domicile' },
    { ruler: sect === 'day' ? triplicity.day : triplicity.night, dignityType: 'triplicity' },
    { ruler: boundRulerOf(longitude, boundsScheme), dignityType: 'bound' },
    { ruler: faceRulerOf(longitude), dignityType: 'face' },
  ];
  const exaltation = exaltationRulerOf(sign);
  if (exaltation !== undefined) rulers.push({ ruler: exaltation, dignityType: 'exaltation' });
  return rulers;
}

export interface Reception {
  /** The body standing in another's dignity. */
  readonly receivedBody: BodyId;
  /** The body whose dignity it is — the one doing the receiving. */
  readonly receivingBody: BodyId;
  readonly dignityType: DignityType;
}

/** Every reception `receivedBody` gets from `receivingBody` — every dignity type `receivingBody` holds at `receivedBody`'s own placement. Empty when `receivingBody` holds none. */
export function receptionsOf(
  receivedBody: BodyId,
  receivedLongitude: Degrees,
  receivingBody: BodyId,
  sect: Sect,
  scheme: RulershipScheme = 'traditional',
  boundsScheme: BoundsScheme = 'egyptian',
): readonly Reception[] {
  return dignityRulersOf(receivedLongitude, sect, scheme, boundsScheme)
    .filter((dignity) => dignity.ruler === receivingBody)
    .map((dignity) => ({ receivedBody, receivingBody, dignityType: dignity.dignityType }));
}

export type ReceptionKind = 'none' | 'oneWay' | 'mutual';

export interface MutualReceptionResult {
  /** `'none'` when neither side receives the other; `'oneWay'` when only one does; `'mutual'` when both do (same type or mixed — see `sameDignityType`). */
  readonly kind: ReceptionKind;
  /** Receptions A receives from B — empty when B holds no dignity at A's placement. */
  readonly aFromB: readonly Reception[];
  /** Receptions B receives from A — empty when A holds no dignity at B's placement. */
  readonly bFromA: readonly Reception[];
  /** True when at least one shared dignity type appears on both sides (classical "mutual reception", e.g. both by domicile) rather than only different types ("mixed reception", e.g. A's domicile for B's exaltation). Always `false` when `kind` isn't `'mutual'`. */
  readonly sameDignityType: boolean;
}

/** Checks reception in both directions between two bodies at once — the usual way reception is actually asked about. */
export function mutualReceptionBetween(
  bodyA: BodyId,
  longitudeA: Degrees,
  bodyB: BodyId,
  longitudeB: Degrees,
  sect: Sect,
  scheme: RulershipScheme = 'traditional',
  boundsScheme: BoundsScheme = 'egyptian',
): MutualReceptionResult {
  const aFromB = receptionsOf(bodyA, longitudeA, bodyB, sect, scheme, boundsScheme);
  const bFromA = receptionsOf(bodyB, longitudeB, bodyA, sect, scheme, boundsScheme);
  const kind: ReceptionKind =
    aFromB.length > 0 && bFromA.length > 0 ? 'mutual' : aFromB.length + bFromA.length > 0 ? 'oneWay' : 'none';
  const sameDignityType = kind === 'mutual' && aFromB.some((a) => bFromA.some((b) => b.dignityType === a.dignityType));
  return { kind, aFromB, bFromA, sameDignityType };
}
