/**
 * Per-locale, per-entry evaluation-loop state for #381: without this, every run of
 * evaluate-corpus-batch.mjs re-checks the entire corpus from scratch, re-paying for (and
 * re-flagging) entries already judged clean in a prior pass. A plain JSON array, mirroring
 * corpus-feedback.mjs's own shape/identity convention, so it stays legible to inspect by hand
 * between runs.
 *
 * Two independent reasons an entry stops being re-evaluated:
 * - `clean: true` — evaluate-corpus-batch.mjs's own judge said this entry is correct. Set *only*
 *   there, never by improve-corpus-batch.mjs: a `verdict: 'UNCHANGED'` there means Gemini
 *   declined ChatGPT's complaint, not that the entry is confirmed fine — the two models
 *   disagreeing is a real "not clean" outcome, not a resolution, and #63's acceptance criteria
 *   treats it as exactly that (a small accepted residual, once the loop below exhausts).
 * - `evaluationCount >= limit` — the entry has gone through this many rounds of
 *   improve-corpus-batch.mjs (`IMPROVED` *or* `UNCHANGED` — either verdict consumes one
 *   iteration) without ever reaching `clean`, as many times as the feedback loop is allowed to
 *   run (default 2, see evaluate-corpus-batch.mjs's `--evaluation-limit`), so it stops being
 *   re-queued even though the two models never agreed.
 *
 * `lastRejection?: { issues, reasoning }` — set by improve-corpus-batch.mjs whenever its verdict
 * is `UNCHANGED` (Gemini's own `issues`-it-rejected and the `reasoning` it gave), cleared (never
 * set) on `IMPROVED` since a rewrite means any prior rejection no longer describes the current
 * text. evaluate-corpus-batch.mjs reads this back and hands it to its own judge on the entry's
 * next evaluation (`corpus-evaluation.mjs`'s `priorRejection`), so a disagreement between the two
 * models is visible to both sides across rounds instead of looping blind.
 */
/**
 * @module eval-tracking
 * @purpose Reads/writes per-locale, per-entry evaluation-loop state (#381) tracking whether an
 *   entry is clean, exhausted, or still eligible for re-evaluation, so repeated runs don't re-pay
 *   for already-settled entries.
 * @conventions Plain JSON array file mirroring corpus-feedback.mjs's identity/shape convention.
 *   `clean: true` is set only by evaluate-corpus-batch.mjs's own judge; `evaluationCount >= limit`
 *   is the other, independent way an entry stops being re-queued. `lastRejection` carries a
 *   rejected improvement's issues/reasoning forward to the next evaluation round.
 * @exports readTracking, writeTracking, findTracking, upsertTracking, isEvaluationExhausted.
 */
import { readFile, writeFile } from 'node:fs/promises';

function sameIdentity(a, b) {
  return a.key === b.key;
}

/** Reads a locale's tracking file, or an empty array if it doesn't exist yet. */
export async function readTracking(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/** Writes a locale's tracking array back to its file, pretty-printed so a human can read it directly. */
export async function writeTracking(path, tracking) {
  await writeFile(path, `${JSON.stringify(tracking, null, 2)}\n`, 'utf8');
}

/** Finds the existing record for this key, or `undefined` if this entry has never been tracked. */
export function findTracking(tracking, identity) {
  return tracking.find((existing) => sameIdentity(existing, identity));
}

/** Mutates `tracking` in place: replaces the existing record for this key, or appends. */
export function upsertTracking(tracking, record) {
  const index = tracking.findIndex((existing) => sameIdentity(existing, record));
  if (index === -1) tracking.push(record);
  else tracking[index] = record;
}

/** True once an entry no longer needs re-evaluation — already judged clean, or out of feedback-loop iterations. */
export function isEvaluationExhausted(record, limit) {
  if (record === undefined) return false;
  return record.clean || record.evaluationCount >= limit;
}
