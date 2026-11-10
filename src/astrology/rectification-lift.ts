/**
 * The lift of a rectification candidate over the window average (#1445), and re-scoring candidates for a chosen
 * subset of events.
 *
 * Owner decisions (#1445): lift = candidate score / window average; only a lift above 1.0 is a spike worth
 * highlighting, and a candidate at or below 1.0 explains the events no better than chance. The scoring method these
 * scores come from has its citation pending (see `rectification.ts`).
 */
/**
 * @module RectificationLift
 * @purpose Pure lift, window-average and event-subset re-scoring helpers for birth-time rectification candidates.
 * @conventions Scores are contact counts (one point each), so a window of equal scores has an exact average of that score and a lift of exactly 1; an empty window or an average of zero gives lift 0, never NaN or Infinity; a candidate is a spike only when its lift is strictly above 1; re-scoring counts the contacts of the included events, so toggling an event needs no new search; ties rank by earlier Julian day.
 * @exports CHANCE_LIFT, windowAverage, liftOf, isSpike, rescoreForEvents, RescoredCandidate
 */

/** The lift of a candidate that scores exactly like the window average: no better than chance. */
export const CHANCE_LIFT = 1;

/** The mean score across all candidates tested; 0 for an empty window. */
export function windowAverage(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

/** Candidate score over the window average; 0 when the average is 0 (nothing scored anywhere). */
export function liftOf(score: number, average: number): number {
  return average > 0 ? score / average : 0;
}

/** True only for a lift strictly above {@link CHANCE_LIFT}; at 1.0 or below the candidate is not highlighted. */
export function isSpike(lift: number): boolean {
  return lift > CHANCE_LIFT;
}

interface ScoredCandidate {
  readonly jd: number;
  readonly contacts: readonly { readonly eventIndex: number }[];
}

export type RescoredCandidate<T extends ScoredCandidate> = T & {
  /** Contacts of the included events only. */
  readonly score: number;
  readonly lift: number;
};

/**
 * Re-scores every candidate counting only the contacts of the included events (by index into the events the
 * search was run with), and ranks them best first by score, then earlier time. Lift is over the average of the
 * re-scored window.
 */
export function rescoreForEvents<T extends ScoredCandidate>(
  candidates: readonly T[],
  includedEventIndexes: ReadonlySet<number>,
): readonly RescoredCandidate<T>[] {
  const scores = candidates.map(
    (candidate) => candidate.contacts.filter((contact) => includedEventIndexes.has(contact.eventIndex)).length,
  );
  const average = windowAverage(scores);
  return candidates
    .map((candidate, index) => {
      const score = scores[index] ?? 0;
      return { ...candidate, score, lift: liftOf(score, average) };
    })
    .sort((a, b) => b.score - a.score || a.jd - b.jd);
}
