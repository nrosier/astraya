/**
 * Atomic Tier 2 cost caps (#461), against migration 15's
 * `interpretation_cost_reservations` table (`server/db.ts`). The two real
 * dollar caps in `server/interpretation-routes.ts` used to read
 * `interpretation_usage` (`./usage.ts`) once before any provider call, with
 * no recheck between a request's two possible chargeable calls and no
 * visibility between concurrent requests — so under ordinary concurrent
 * usage the caps were only advisory. A reservation closes both gaps: before
 * each chargeable call, a conservative worst-case cost is reserved inside a
 * short `BEGIN IMMEDIATE` transaction that also sums every other still-active
 * reservation, so a concurrent request (or the next call in the same
 * request) sees it immediately, then is reconciled down to the real cost
 * (or released on failure) once the call returns.
 */

/**
 * @module cost-reservation
 * @purpose Atomic reserve/reconcile/release cycle for Tier 2's per-user and total daily dollar caps, closing the race `./usage.ts`'s plain read-then-write functions leave open under concurrency.
 * @conventions `reserveCostCents` and `reconcileReservation` each run inside their own `BEGIN IMMEDIATE` transaction directly on `Database` (which *is* `DatabaseSync`, same raw-transaction pattern `server/db.ts`'s own `migrate()` uses) — short-lived, held only for the SQLite work, never across an `await` of the provider call itself. A reservation is a hold, not a ledger entry: a successful request always ends with it deleted and replaced by a real `./usage.ts` `recordUsage` row, never both or neither existing at once.
 * @exports Reservation, ReservationRejection, reserveCostCents, releaseReservation, reconcileReservation
 */
import { randomUUID } from 'node:crypto';
import type { Database } from '../db.ts';
import { recordUsage, userCostCentsSince, totalCostCentsSince } from './usage.ts';

// Generous relative to `callModel`'s own retry ceiling (two retries, ~1.5s of backoff) plus real
// network latency — long enough that a slow-but-live call is never prematurely treated as
// abandoned, short enough that a genuinely crashed request doesn't hold spend hostage for long.
const RESERVATION_TTL_MS = 5 * 60 * 1000;

export interface Reservation {
  readonly reservationId: string;
}

export interface ReservationRejection {
  readonly reason: 'user-cap' | 'total-cap';
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Deletes reservations whose TTL has lapsed — housekeeping only; the common path never relies on this. */
function pruneExpired(db: Database, now: string): void {
  db.prepare('DELETE FROM interpretation_cost_reservations WHERE expires_at <= ?').run(now);
}

function activeReservedCentsForUser(db: Database, userId: string, now: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(reserved_cents), 0) AS total FROM interpretation_cost_reservations WHERE user_id = ? AND expires_at > ?',
    )
    .get(userId, now) as { total: number };
  return row.total;
}

function activeReservedCentsTotal(db: Database, now: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(reserved_cents), 0) AS total FROM interpretation_cost_reservations WHERE expires_at > ?',
    )
    .get(now) as { total: number };
  return row.total;
}

/**
 * Atomically checks `maxCents` (a conservative upper bound for the call about to be made, from
 * `server/interpretation/llm-client.ts`'s `estimateVerificationMaxCostCents`/
 * `estimateGenerationMaxCostCents`) against both daily caps — committed usage plus every other
 * active reservation — and, if it fits, reserves it. Call this immediately before *every*
 * chargeable provider call, not just the first in a request: that is what makes a second call in
 * the same request, and every concurrent request, see the same up-to-date total.
 */
export function reserveCostCents(
  db: Database,
  params: { userId: string; maxCents: number; userDailyCapCents: number; totalDailyCapCents: number },
): Reservation | ReservationRejection {
  const { userId, maxCents, userDailyCapCents, totalDailyCapCents } = params;
  const now = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    pruneExpired(db, now);
    const userTotal = userCostCentsSince(db, userId) + activeReservedCentsForUser(db, userId, now);
    if (userTotal + maxCents > userDailyCapCents) {
      db.exec('ROLLBACK');
      return { reason: 'user-cap' };
    }
    const grandTotal = totalCostCentsSince(db) + activeReservedCentsTotal(db, now);
    if (grandTotal + maxCents > totalDailyCapCents) {
      db.exec('ROLLBACK');
      return { reason: 'total-cap' };
    }
    const reservationId = randomUUID();
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();
    db.prepare(
      'INSERT INTO interpretation_cost_reservations (id, user_id, reserved_cents, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(reservationId, userId, maxCents, now, expiresAt);
    db.exec('COMMIT');
    return { reservationId };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Call when the reserved-for provider call failed: no cost was incurred, so the hold is simply dropped. */
export function releaseReservation(db: Database, reservationId: string): void {
  db.prepare('DELETE FROM interpretation_cost_reservations WHERE id = ?').run(reservationId);
}

/**
 * Call when the reserved-for provider call succeeded: replaces the reservation with the real
 * `interpretation_usage` row in one transaction, so no concurrent reader ever sees a moment where
 * neither the reservation nor the real usage accounts for this call's spend.
 */
export function reconcileReservation(
  db: Database,
  reservationId: string,
  usage: {
    readonly userId: string;
    readonly promptTokens: number;
    readonly outputTokens: number;
    readonly costCents: number;
  },
): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM interpretation_cost_reservations WHERE id = ?').run(reservationId);
    recordUsage(db, usage);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
