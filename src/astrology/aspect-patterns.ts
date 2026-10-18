/**
 * Multi-body aspect configurations (#640), read off a chart's own aspects the way Astrolog's `-g0` switch reads them
 * off its aspect grid (Astrolog 8.00 documentation, "Description of each command switch",
 * https://www.astrolog.org/ftp/astrolog.htm): "Search through the aspect grid for major aspect configurations or aspect
 * patterns, including the Grand Trine, T-Square, Grand Cross, Yod or "finger of god", Cradle, Mystic Rectangle or
 * "envelope", and Stellium".
 *
 * Because a shape is read off the aspects, every aspect in it must be an aspect within its own orb under whatever
 * `OrbConfig` made them (#590); there is no separate pattern orb. The shapes:
 * - **Stellium**: "three or four objects must all be conjunct with each other"; a three-body stellium inside a
 *   four-body one is not listed again, as in the source.
 * - **Grand Trine**: three bodies in mutual trine.
 * - **T-Square**: an opposition whose two ends both square a third body, the apex. One that is part of a listed Grand
 *   Cross is not listed again (a Grand Cross holds four).
 * - **Grand Cross**: two oppositions whose four ends square in turn.
 * - **Yod**: a sextile whose two ends both quincunx a third body, the apex. The quincunx is a minor aspect, off unless
 *   enabled, so Yods appear only when it is, as the source notes for its own Inconjunct.
 * - **Cradle**: "four objects form three sextiles producing a chain of sextiles half way around the zodiac": the
 *   chain's ends are in opposition (half way around), so the chain cannot fold back on itself.
 * - **Mystic Rectangle**: "two trines and two sextiles forming a rectangle": alternating sextile, trine, sextile,
 *   trine around four bodies whose diagonals are the rectangle's two oppositions.
 *
 * Kite is not detected: the source does not list it, and its construction varies between authors.
 */
/**
 * @module astrology/aspect-patterns
 * @purpose Detects Stellium, Grand Trine, T-Square, Grand Cross, Yod, Cradle and Mystic Rectangle among a chart's own aspects (#640), per the Astrolog 8.00 documentation.
 * @conventions Pure; only the given bodies (Sun to Pluto by the #640 decision) and only aspects already found within orb. Each shape is listed once, its bodies in a stable order (apex first where it has one).
 * @exports AspectPatternKind, AspectPattern, PATTERN_BODY_KEYS, findAspectPatterns
 */
import type { Aspect } from './aspects.js';
import type { BodyId } from '../ephemeris/types.js';

export type AspectPatternKind =
  'stellium' | 'grand-trine' | 't-square' | 'grand-cross' | 'yod' | 'cradle' | 'mystic-rectangle';

export interface AspectPattern {
  readonly kind: AspectPatternKind;
  /** The bodies in the shape; for a T-Square and a Yod the apex comes first, for a Cradle the chain in order. */
  readonly bodies: readonly BodyId[];
}

/** The bodies a pattern may be made of (#640 decision): the ten planets, the bodies the report ranks aspects for. */
export const PATTERN_BODY_KEYS = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const;

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, index) => combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest]));
}

export function findAspectPatterns(aspects: readonly Aspect[], bodies: readonly BodyId[]): readonly AspectPattern[] {
  const allowed = new Set(bodies);
  const between = new Map<string, string>();
  const pairKey = (a: BodyId, b: BodyId): string => (a < b ? `${String(a)}-${String(b)}` : `${String(b)}-${String(a)}`);
  for (const aspect of aspects) {
    if (allowed.has(aspect.bodyA) && allowed.has(aspect.bodyB))
      between.set(pairKey(aspect.bodyA, aspect.bodyB), aspect.aspect.key);
  }
  const is = (a: BodyId, b: BodyId, key: string): boolean => between.get(pairKey(a, b)) === key;
  const ids = [...allowed].sort((a, b) => a - b);
  const patterns: AspectPattern[] = [];

  // Stelliums: four-body ones first, then three-body ones not inside any of them.
  const stellium4 = combinations(ids, 4).filter((group) =>
    combinations(group, 2).every(([a, b]) => a !== undefined && b !== undefined && is(a, b, 'conjunction')),
  );
  const inStellium4 = (group: readonly BodyId[]): boolean =>
    stellium4.some((four) => group.every((body) => four.includes(body)));
  for (const group of combinations(ids, 3)) {
    const mutual = combinations(group, 2).every(
      ([a, b]) => a !== undefined && b !== undefined && is(a, b, 'conjunction'),
    );
    if (mutual && !inStellium4(group)) patterns.push({ kind: 'stellium', bodies: group });
  }
  for (const group of stellium4) patterns.push({ kind: 'stellium', bodies: group });

  for (const group of combinations(ids, 3)) {
    if (combinations(group, 2).every(([a, b]) => a !== undefined && b !== undefined && is(a, b, 'trine'))) {
      patterns.push({ kind: 'grand-trine', bodies: group });
    }
  }

  // Grand Crosses: two oppositions (a–c, b–d) with the four ends squaring in turn.
  const crosses: BodyId[][] = [];
  for (const [a, b, c, d] of combinations(ids, 4)) {
    if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
    for (const [w, x, y, z] of [
      [a, b, c, d],
      [a, c, b, d],
      [a, b, d, c],
    ] as const) {
      if (
        is(w, y, 'opposition') &&
        is(x, z, 'opposition') &&
        is(w, x, 'square') &&
        is(x, y, 'square') &&
        is(y, z, 'square') &&
        is(z, w, 'square')
      ) {
        crosses.push([w, x, y, z]);
        break;
      }
    }
  }
  for (const cross of crosses) patterns.push({ kind: 'grand-cross', bodies: cross });

  // T-Squares and Yods: a base pair and an apex aspecting both ends.
  for (const [a, b] of combinations(ids, 2)) {
    if (a === undefined || b === undefined) continue;
    for (const apex of ids) {
      if (apex === a || apex === b) continue;
      if (is(a, b, 'opposition') && is(apex, a, 'square') && is(apex, b, 'square')) {
        const insideCross = crosses.some((cross) => [apex, a, b].every((body) => cross.includes(body)));
        if (!insideCross) patterns.push({ kind: 't-square', bodies: [apex, a, b] });
      }
      if (is(a, b, 'sextile') && is(apex, a, 'quincunx') && is(apex, b, 'quincunx')) {
        patterns.push({ kind: 'yod', bodies: [apex, a, b] });
      }
    }
  }

  // Cradles and Mystic Rectangles: four bodies around a ring.
  const seen = new Set<string>();
  for (const group of combinations(ids, 4)) {
    for (const ring of orderings(group)) {
      const [w, x, y, z] = ring;
      if (w === undefined || x === undefined || y === undefined || z === undefined) continue;
      const cradle = is(w, x, 'sextile') && is(x, y, 'sextile') && is(y, z, 'sextile') && is(w, z, 'opposition');
      const rectangle =
        is(w, x, 'sextile') &&
        is(x, y, 'trine') &&
        is(y, z, 'sextile') &&
        is(z, w, 'trine') &&
        is(w, y, 'opposition') &&
        is(x, z, 'opposition');
      const kind: AspectPatternKind | undefined = cradle ? 'cradle' : rectangle ? 'mystic-rectangle' : undefined;
      if (kind === undefined) continue;
      const key = `${kind}:${[...group].sort((p, q) => p - q).join('-')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      patterns.push({ kind, bodies: ring });
    }
  }

  return patterns;
}

/** Every order of four bodies, for the shapes whose aspects run around a ring. */
function orderings(group: readonly BodyId[]): BodyId[][] {
  if (group.length <= 1) return [[...group]];
  return group.flatMap((body, index) =>
    orderings([...group.slice(0, index), ...group.slice(index + 1)]).map((rest) => [body, ...rest]),
  );
}
