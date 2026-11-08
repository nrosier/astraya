/**
 * Corrections that signed-in users submit to the admins (#1338, slice 2): data access against the
 * `corpus_submissions` table (`server/db.ts` migration 17). A submission is a key, a language, a text and the
 * licence acceptance; the submitter's user id is kept for the admin queue and nothing else.
 *
 * Unlike `corpus-candidates.ts`, a row is never deleted here: a decision (slice 3) sets `status`, `decided_by` and
 * `decided_at` and leaves the row as history (#1338 D4). There is no delete.
 */

/**
 * @module corpus-submissions
 * @purpose Data-access layer for user-submitted interpretation corrections awaiting admin review, backed by the `corpus_submissions` table.
 * @conventions Insert, list, fetch and decide, with no delete: a decision only ever moves a pending row to approved or rejected and keeps it; the pending and per-day caps are counted here and enforced by the route inside the same synchronous handler, so the check and the insert cannot interleave; `submitterId` appears only in the admin listing shape.
 * @exports PENDING_CAP, DAILY_CAP, SubmissionStatus, CorpusSubmission, countPendingSubmissions, countRecentSubmissions, insertCorpusSubmission, listCorpusSubmissions, getCorpusSubmission, markSubmissionDecided
 */
import { randomUUID } from 'node:crypto';
import type { Database } from './db.ts';
import type { Locale } from './corpus-overrides.ts';

/** At most this many pending submissions per user at once (#1338 D5). */
export const PENDING_CAP = 5;
/** At most this many new submissions per user in any 24 hours (#1338 D5). */
export const DAILY_CAP = 20;

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface CorpusSubmission {
  readonly id: string;
  readonly key: string;
  readonly locale: Locale;
  readonly text: string;
  readonly status: SubmissionStatus;
  readonly submitterId: string;
  readonly submitterUsername: string | undefined;
  readonly licenceVersion: string;
  readonly acceptedAt: string;
  readonly createdAt: string;
  readonly decidedAt: string | undefined;
  readonly decidedByUsername: string | undefined;
}

interface SubmissionRow {
  readonly id: string;
  readonly key: string;
  readonly locale: string;
  readonly text: string;
  readonly status: string;
  readonly submitted_by: string;
  readonly submitter_username: string | null;
  readonly licence_version: string;
  readonly accepted_at: string;
  readonly created_at: string;
  readonly decided_at: string | null;
  readonly decided_by_username: string | null;
}

function toSubmission(row: SubmissionRow): CorpusSubmission {
  return {
    id: row.id,
    key: row.key,
    locale: row.locale as Locale,
    text: row.text,
    status: row.status as SubmissionStatus,
    submitterId: row.submitted_by,
    submitterUsername: row.submitter_username ?? undefined,
    licenceVersion: row.licence_version,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
    decidedByUsername: row.decided_by_username ?? undefined,
  };
}

export function countPendingSubmissions(db: Database, userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM corpus_submissions WHERE submitted_by = ? AND status = 'pending'")
    .get(userId) as unknown as { n: number };
  return row.n;
}

/** Submissions of any status created since `sinceIso`, so a decided row still counts against the day. */
export function countRecentSubmissions(db: Database, userId: string, sinceIso: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM corpus_submissions WHERE submitted_by = ? AND created_at >= ?')
    .get(userId, sinceIso) as unknown as { n: number };
  return row.n;
}

export function insertCorpusSubmission(
  db: Database,
  params: {
    readonly key: string;
    readonly locale: Locale;
    readonly text: string;
    readonly submittedBy: string;
    readonly licenceVersion: string;
    readonly now: string;
  },
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO corpus_submissions
       (id, key, locale, text, submitted_by, status, licence_accepted, licence_version, accepted_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)`,
  ).run(id, params.key, params.locale, params.text, params.submittedBy, params.licenceVersion, params.now, params.now);
  return id;
}

/** Newest first. Admin queue only: the rows carry the submitter id. */
export function listCorpusSubmissions(
  db: Database,
  filter: { readonly status?: SubmissionStatus } = {},
): CorpusSubmission[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.key, s.locale, s.text, s.status, s.submitted_by, s.licence_version, s.accepted_at,
              s.created_at, s.decided_at, u.username AS submitter_username, d.username AS decided_by_username
         FROM corpus_submissions s
         LEFT JOIN users u ON u.id = s.submitted_by
         LEFT JOIN users d ON d.id = s.decided_by
        WHERE (? IS NULL OR s.status = ?)
        ORDER BY s.created_at DESC, s.id`,
    )
    .all(filter.status ?? null, filter.status ?? null) as unknown as SubmissionRow[];
  return rows.map(toSubmission);
}

/** One submission by id, or undefined. */
export function getCorpusSubmission(db: Database, id: string): CorpusSubmission | undefined {
  const row = db
    .prepare(
      `SELECT s.id, s.key, s.locale, s.text, s.status, s.submitted_by, s.licence_version, s.accepted_at,
              s.created_at, s.decided_at, u.username AS submitter_username, d.username AS decided_by_username
         FROM corpus_submissions s
         LEFT JOIN users u ON u.id = s.submitted_by
         LEFT JOIN users d ON d.id = s.decided_by
        WHERE s.id = ?`,
    )
    .get(id) as unknown as SubmissionRow | undefined;
  return row === undefined ? undefined : toSubmission(row);
}

/**
 * Moves a pending row to approved or rejected and records the decider and the time (#1338 D4). The row is kept.
 * Returns false when the row is not pending (already decided, or no such id), in which case nothing changes.
 */
export function markSubmissionDecided(
  db: Database,
  params: {
    readonly id: string;
    readonly status: 'approved' | 'rejected';
    readonly decidedBy: string;
    readonly now: string;
  },
): boolean {
  const result = db
    .prepare(
      "UPDATE corpus_submissions SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
    )
    .run(params.status, params.decidedBy, params.now, params.id);
  return result.changes > 0;
}
