/**
 * Jones chart shapes (#35).
 *
 * Marc Edmund Jones classified a chart's overall "shape" — how the bodies
 * are spread or clustered around the wheel — into seven patterns. Bundle,
 * Bowl and Locomotive are the three "single arc" shapes: they differ only in
 * how much of the circle that arc covers, i.e. how much is left completely
 * empty — a trine (120 degrees), a half (180) or two trines (240).
 *
 * Beyond that, no single empty arc reaches even a third of the chart, so the
 * shape instead depends on how many separate groups the bodies fall into.
 * Groups are cut at every gap of at least a sextile (`SEPARATING_GAP`): one
 * group is a Splash, two are a Seesaw — or a Bucket, if one of the two is a
 * single isolated body playing "handle" — and three or more are a Splay.
 *
 * Real charts are not always this tidy, and this is exactly where
 * implementations disagree: the line between a wide Bowl and a Locomotive,
 * or a sparse Splay and a Splash, is a matter of convention. The 120/180/240
 * breakpoints are Jones' own (thirds and half of the circle); the sextile
 * used to detect a genuine split beyond that is this module's own explicit,
 * documented choice, not a claim of universal agreement.
 *
 * What was checked against Jones's scheme, and what this module chose (#430):
 *
 * - **Which bodies.** Jones used the ten planets, the Sun and Moon through Pluto, and nothing else.
 *   A lunar node, Lilith or an asteroid is not a planet in his scheme, and letting one decide the
 *   shape would make it change with a display setting. `jonesBodyPositions` therefore keeps only
 *   the ten (`JONES_BODY_KEYS`); every caller (the chart screen and the written report) goes
 *   through it, so they cannot disagree about the shape of the same chart.
 * - **The Bucket handle** is a lone body with at least a sextile of empty circle on both sides, the
 *   rest of the planets forming the other group. It is *not* required to sit opposite the cluster,
 *   and the cluster is not required to be a bowl (within half the circle): a lone planet beside a
 *   group spanning up to 240 degrees is a Bucket here, a little wider than Jones's picture of a
 *   bowl with a handle. This is the module's convention, stated here rather than hidden.
 * - **Thresholds are hard lines.** A chart at 118 degrees of span is a Bundle, at 122 a Bowl; the
 *   screen words every shape as "about" for that reason.
 * - **No leading planet** is reported for a Locomotive: only a Bucket returns a handle, because
 *   which planet leads the motion needs a convention this module does not state.
 */

/**
 * @module JonesShapes
 * @purpose Classifies a chart's overall body distribution into Marc Edmund Jones's seven chart shapes (bundle, bowl, locomotive, bucket, seesaw, splay, splash).
 * @conventions Uses only the traditional ten planets (JONES_BODY_KEYS); single-arc shapes (bundle/bowl/locomotive) use span thresholds at 120/180/240 degrees (Jones's own thirds/half-circle breakpoints); group splits beyond that use a sextile (60°) SEPARATING_GAP as this module's own documented, non-universal convention.
 * @exports JONES_BODY_KEYS, jonesBodyPositions, jonesShapeOf
 */
import type { BodyId, Degrees } from '../ephemeris/types.js';
import { bodyByKey } from './bodies.js';

/** The ten planets Jones's shapes are drawn from: the Sun and Moon through Pluto. */
export const JONES_BODY_KEYS = [
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

/** The longitudes of just the ten planets, in `positions`' own order — the input `jonesShapeOf` expects. */
export function jonesBodyPositions(
  positions: readonly { readonly body: BodyId; readonly longitude: Degrees }[],
): ReadonlyMap<BodyId, Degrees> {
  const ids = new Set<BodyId>(JONES_BODY_KEYS.flatMap((key) => bodyByKey(key)?.id ?? []));
  return new Map(positions.filter((position) => ids.has(position.body)).map((p) => [p.body, p.longitude]));
}

const TRINE: Degrees = 120;
const OPPOSITION: Degrees = 180;
const TWO_TRINES: Degrees = 240;

/** Minimum gap treated as a genuine split between groups, rather than ordinary spacing. */
const SEPARATING_GAP: Degrees = 60;

export type JonesShape = 'bundle' | 'bowl' | 'locomotive' | 'bucket' | 'seesaw' | 'splay' | 'splash';

export interface JonesShapeResult {
  readonly shape: JonesShape;
  /** The arc containing every body: 360 minus the single largest empty gap. */
  readonly span: Degrees;
  /**
   * Bodies split into groups by every gap at least `SEPARATING_GAP` wide, in
   * wheel order. A single group holding every body when the shape isn't
   * split at all (bundle, bowl, locomotive, splash).
   */
  readonly groups: readonly (readonly BodyId[])[];
  /** The lone body with empty circle on both sides. Present only for 'bucket' (not necessarily opposite the cluster). */
  readonly handle?: BodyId;
}

/** Gaps between each body and the next, walking the circle; the last wraps back to the first. */
function circularGaps(sortedLongitudes: readonly Degrees[]): readonly Degrees[] {
  const n = sortedLongitudes.length;
  const gaps: Degrees[] = [];
  for (let i = 0; i < n; i++) {
    const current = sortedLongitudes[i];
    const next = sortedLongitudes[(i + 1) % n];
    if (current === undefined || next === undefined) continue;
    gaps.push(i + 1 < n ? next - current : next + 360 - current);
  }
  return gaps;
}

/** Split `bodies` (in wheel order) into contiguous groups at each given gap index. */
function clusterByBoundaries(
  bodies: readonly BodyId[],
  boundaryIndices: readonly number[],
): readonly (readonly BodyId[])[] {
  const n = bodies.length;
  const firstBoundary = boundaryIndices[0];
  if (firstBoundary === undefined) return [bodies];

  const groups: BodyId[][] = [];
  let current: BodyId[] = [];
  for (let offset = 0; offset < n; offset++) {
    const index = (firstBoundary + 1 + offset) % n;
    const body = bodies[index];
    if (body === undefined) continue;
    current.push(body);
    if (boundaryIndices.includes(index)) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

/** Classify the overall distribution of bodies around the chart. */
export function jonesShapeOf(positions: ReadonlyMap<BodyId, Degrees>): JonesShapeResult {
  const sorted = Array.from(positions.entries()).sort((a, b) => a[1] - b[1]);
  if (sorted.length < 2) {
    throw new RangeError('Jones chart shapes require at least two bodies');
  }

  const bodies = sorted.map(([body]) => body);
  const longitudes = sorted.map(([, longitude]) => longitude);
  const gaps = circularGaps(longitudes);

  const maxGap = Math.max(...gaps);
  const span = 360 - maxGap;

  if (span <= TRINE) return { shape: 'bundle', span, groups: [bodies] };
  if (span <= OPPOSITION) return { shape: 'bowl', span, groups: [bodies] };
  if (span <= TWO_TRINES) return { shape: 'locomotive', span, groups: [bodies] };

  const boundaryIndices = gaps.reduce<number[]>((indices, gap, index) => {
    if (gap >= SEPARATING_GAP) indices.push(index);
    return indices;
  }, []);

  if (boundaryIndices.length < 2) return { shape: 'splash', span, groups: [bodies] };

  const groups = clusterByBoundaries(bodies, boundaryIndices);

  if (groups.length === 2) {
    const handleGroup = groups.find((group) => group.length === 1);
    if (handleGroup?.length === 1) {
      const [handle] = handleGroup;
      if (handle !== undefined) return { shape: 'bucket', span, groups, handle };
    }
    return { shape: 'seesaw', span, groups };
  }

  return { shape: 'splay', span, groups };
}
