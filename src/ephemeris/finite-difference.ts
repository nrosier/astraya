/**
 * Estimates a point's own instantaneous motion by sampling its longitude a short time apart
 * (#546), for points the ephemeris has no analytic speed for — chart angles, the Vertex, and the
 * two classical lots are arithmetic over houses/luminaries, not bodies, so none of them come with
 * a `longitudeSpeed` of their own the way `BodyPosition` does.
 */
/**
 * @module ephemeris/finite-difference
 * @purpose Estimates a non-body point's own instantaneous motion by sampling its longitude a short time apart.
 * @conventions dtDays is always positive and the second sample is always later (t + dtDays); the rate is the
 *   shortest-path (circularly unwrapped) longitude change divided by dtDays, matching `astrology/aspects.ts`'s
 *   own `signedSeparation` convention, so a sample straddling the 0°/360° seam is never read as a near-reversal.
 * @exports FINITE_DIFFERENCE_DT_DAYS, finiteDifferenceRate
 */
import type { Degrees } from './types.js';

/**
 * The sampling interval used to estimate a point's own motion by finite difference (#546).
 *
 * Pinned, not computed per call, at a sweet spot checked empirically against `engine.houses()`
 * (`test/chart-compute.test.ts`'s own "finite-difference step is converged" test holds the exact
 * numbers): a step much larger than this (an hour, say) still carries real truncation error, since
 * the Ascendant/Midheaven's own rate is itself changing noticeably over that long; a step much
 * smaller than this (a tenth of a second) is measurably *worse*, not better — the engine's own
 * numerical precision adds noise that a finite difference divides by an ever-smaller `dtDays`,
 * amplifying it. Between a minute and ten seconds the computed rate for the Ascendant/Midheaven
 * (roughly 361°/day, the fastest-moving pair sampled here) agrees to within a few hundredths of
 * a degree/day — negligible next to the few-tenths-of-a-degree orbs any aspect this engine
 * reports still has left when its applying/separating direction actually matters — so one minute
 * is kept as the point past which there is nothing further to gain, not an arbitrarily tiny step.
 * At this size the Ascendant/Midheaven only advance about a quarter of a degree over one sample —
 * nowhere near a full lap, so `finiteDifferenceRate`'s circular unwrap never has to resolve more
 * than one branch.
 */
export const FINITE_DIFFERENCE_DT_DAYS = 1 / 1440;

/** Normalise to the half-open interval [0, 360) — the same convention `astrology/aspects.ts` uses. */
function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/**
 * The signed rate implied by a point's longitude at `t` (`longitudeAt`) and at `t + dtDays`
 * (`longitudeAfter`), in degrees/day. Unwraps circularly first, so a sample that happens to
 * straddle the 0°/360° seam is read as a small forward step rather than a near-full-circle
 * reversal.
 */
export function finiteDifferenceRate(longitudeAt: Degrees, longitudeAfter: Degrees, dtDays: number): Degrees {
  const raw = norm360(longitudeAfter - longitudeAt);
  const shortest = raw > 180 ? raw - 360 : raw;
  return shortest / dtDays;
}
