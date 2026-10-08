/**
 * Cost reservation system for Tier 2 LLM calls (#461).
 *
 * Before each provider call, a conservative worst-case cost is reserved atomically —
 * within a `BEGIN IMMEDIATE` transaction that also sums every other active reservation
 * for that user and across the deployment, so concurrent requests can see each other's
 * holds immediately. The reservation is deleted and replaced by a real `interpretation_usage`
 * row once the call's actual cost is known, closing both gaps that allowed the daily caps
 * to be exceeded: no recheck between a request's two possible chargeable calls, and no
 * visibility between concurrent requests. The expense of synchronous `BEGIN IMMEDIATE`
 * is small vs. its atomicity guarantees here.
 */

/**
 * @module cost-reservation
 * @purpose Reserve conservative worst-case cost amounts before chargeable LLM calls, ensuring
 *   daily caps are enforced atomically under concurrency (#461). Mirrors `usage.ts`'s module
 *   conventions (plain functions over `Database`, no class wrappers).
 * @conventions Runs inside `db.exec('BEGIN IMMEDIATE') / COMMIT` (same raw `DatabaseSync` pattern
 *   `db.ts` uses). `RESERVATION_TTL_MS` gives abandoned reservations time to be pruned. Real costs
 *   are recorded via `recordUsage` from `usage.ts` (same call after reconciliation).
 * @exports Reservation, ReservationRejection, reserveCostCents, releaseReservation, reconcileReservation
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { userCostCentsSince, totalCostCentsSince, recordUsage } from './usage.ts';

const RESERVATION_TTL_MS = 5 * 60 * 1000; // generous vs. callModel's retry/backoff ceiling (~1.5s) plus real network latency

export type ReservationRejection = Readonly<{ reason: 'user-cap' | 'total-cap' }>;
export interface Reservation {
  readonly reservationId: string;
}

/**
 * Reserve a conservative worst-case cost in a short atomic transaction, checking both
 * committed usage and every active reservation (this user + all others). Returns the
 * reservation ID on success, or `{ reason }` on rejection. On rejection, the caller
 * should return a 503 to the client; the route layer matches the rejection reason to
 * the existing cap-exceeded message keying off which cap was hit.
 */
export function reserveCostCents(
  db: DatabaseSync,
  params: {
    readonly userId: string;
    readonly maxCents: number;
    readonly userDailyCapCents: number;
    readonly totalDailyCapCents: number;
  },
): Reservation | ReservationRejection {
  const { userId, maxCents, userDailyCapCents, totalDailyCapCents } = params;

  // Use IMMEDIATE to get the strongest isolation, ensuring every other concurrent request
  // reads every active reservation before inserting its own.
  db.exec('BEGIN IMMEDIATE');
  try {
    // Prune expired rows — cheap housekeeping that keeps the table small and ensures
    // the sums below never include an abandoned reservation.
    db.prepare('DELETE FROM interpretation_cost_reservations WHERE expires_at <= ?').run(new Date().toISOString());

    // Sum committed usage + all active reservations for this user.
    const userCommitted = userCostCentsSince(db, userId);
    const userReserved = db
      .prepare(
        `SELECT COALESCE(SUM(reserved_cents), 0) as total FROM interpretation_cost_reservations WHERE user_id = ?`,
      )
      .get(userId) as unknown as { readonly total: number };
    const userTotal = userCommitted + userReserved.total;

    // Sum committed usage + all active reservations globally.
    const totalCommitted = totalCostCentsSince(db);
    const totalReserved = db
      .prepare(`SELECT COALESCE(SUM(reserved_cents), 0) as total FROM interpretation_cost_reservations`)
      .get() as unknown as { readonly total: number };
    const grandTotal = totalCommitted + totalReserved.total;

    // Check caps.
    if (userTotal + maxCents > userDailyCapCents) {
      db.exec('ROLLBACK');
      return { reason: 'user-cap' };
    }
    if (grandTotal + maxCents > totalDailyCapCents) {
      db.exec('ROLLBACK');
      return { reason: 'total-cap' };
    }

    // Insert reservation and commit.
    const reservationId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

    db.prepare(
      `INSERT INTO interpretation_cost_reservations (id, user_id, reserved_cents, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(reservationId, userId, maxCents, now.toISOString(), expiresAt.toISOString());

    db.exec('COMMIT');
    return { reservationId };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors — if COMMIT or ROLLBACK failed, the transaction is already
      // either committed or rolled back by SQLite.
    }
    throw error;
  }
}

/**
 * Release a reservation without recording usage — call on provider-call failure when
 * no charge was incurred. Simple delete, no transaction needed since the reservation
 * ID is unique.
 */
export function releaseReservation(db: DatabaseSync, reservationId: string): void {
  db.prepare('DELETE FROM interpretation_cost_reservations WHERE id = ?').run(reservationId);
}

/**
 * Reconcile a reservation to the actual cost and record usage in one atomic transaction,
 * so no concurrent reader ever observes a moment where neither the reservation nor a
 * real usage row accounts for this call's spend. Call after a successful provider call
 * when the real token counts and cost are known. On success, the reservation is deleted
 * and replaced with a real `interpretation_usage` row. On error, re-raise the error
 * and leave the reservation intact so the caller can decide whether to release it or
 * retry.
 */
export function reconcileReservation(
  db: DatabaseSync,
  reservationId: string,
  usage: Readonly<{ userId: string; promptTokens: number; outputTokens: number; costCents: number }>,
): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    // Delete the reservation.
    db.prepare('DELETE FROM interpretation_cost_reservations WHERE id = ?').run(reservationId);

    // Record the real usage.
    recordUsage(db, {
      userId: usage.userId,
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
      costCents: usage.costCents,
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  }
}
