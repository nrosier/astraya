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
 *
 * Lease expiry (#476): a reservation that outlives its lease is never silently dropped. Pruning
 * an expired reservation charges its full reserved amount as real usage in the same transaction,
 * so the cap headroom it held is not handed to a later reservation while the original provider
 * call might still complete and bill. A late `reconcileReservation` for an already-pruned lease
 * then only tops up any actual cost above that charge. `llm-client.ts` also aborts every provider
 * call sequence well before the lease ends, so in normal operation no lease expires mid-call.
 */

/**
 * @module cost-reservation
 * @purpose Reserve conservative worst-case cost amounts before chargeable LLM calls, ensuring
 *   daily caps are enforced atomically under concurrency (#461). Mirrors `usage.ts`'s module
 *   conventions (plain functions over `Database`, no class wrappers).
 * @conventions Runs inside `db.exec('BEGIN IMMEDIATE') / COMMIT` (same raw `DatabaseSync` pattern
 *   `db.ts` uses). `RESERVATION_TTL_MS` must stay above `llm-client.ts`'s `PROVIDER_CALL_DEADLINE_MS`
 *   (asserted in tests). Expired leases are charged at their full reserved amount when pruned, never
 *   dropped (#476). Real costs are recorded via `recordUsage` from `usage.ts`.
 * @exports RESERVATION_TTL_MS, Reservation, ReservationRejection, ReconcileOutcome, reserveCostCents, releaseReservation, reconcileReservation
 */

import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { userCostCentsSince, totalCostCentsSince, recordUsage } from './usage.ts';

/**
 * Lease length. Must exceed `PROVIDER_CALL_DEADLINE_MS` in `llm-client.ts` (4.5 min), which bounds
 * a whole provider call including retries and backoff — so a call is aborted before its lease can
 * expire (#476). `test/server-interpretation-cost-reservation.test.ts` asserts that ordering.
 */
export const RESERVATION_TTL_MS = 5 * 60 * 1000;

export type ReservationRejection = Readonly<{ reason: 'user-cap' | 'total-cap' }>;
export interface Reservation {
  readonly reservationId: string;
  /** The amount held, kept by the caller so a late reconciliation can tell how much was already charged (#476). */
  readonly reservedCents: number;
}

/**
 * `'reconciled'`: the lease was still held and is replaced by the actual cost. `'late'`: the lease
 * had already expired and been charged at its full reserved amount when pruned, so only any
 * actual cost above that amount was added (#476) — the caller should log this, since the provider
 * deadline is meant to make it unreachable.
 */
export type ReconcileOutcome = 'reconciled' | 'late';

interface ExpiredReservationRow {
  readonly user_id: string;
  readonly reserved_cents: number;
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
    // Prune expired rows, charging each one's full reserved amount as real usage (#476): an
    // expired lease may belong to a provider call that is still in flight and will bill, so its
    // headroom must not be released to this reservation. Committed in the same transaction as the
    // delete, so the sums below count every expired hold exactly once, as usage.
    const expired = db
      .prepare('DELETE FROM interpretation_cost_reservations WHERE expires_at <= ? RETURNING user_id, reserved_cents')
      .all(new Date().toISOString()) as unknown as readonly ExpiredReservationRow[];
    for (const row of expired) {
      recordUsage(db, { userId: row.user_id, promptTokens: 0, outputTokens: 0, costCents: row.reserved_cents });
    }

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

    // Check caps. A rejection still commits: nothing was inserted, but the prune-and-charge above
    // must persist so an expired lease is settled once, not resurrected by a rollback (#476).
    if (userTotal + maxCents > userDailyCapCents) {
      db.exec('COMMIT');
      return { reason: 'user-cap' };
    }
    if (grandTotal + maxCents > totalDailyCapCents) {
      db.exec('COMMIT');
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
    return { reservationId, reservedCents: maxCents };
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
 * ID is unique. If the lease already expired, the full-amount charge made when it was
 * pruned stays in place (#476): the call's outcome was ambiguous for that long.
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
 *
 * The delete's outcome is checked (#476): if no row was deleted, the lease had expired and
 * `reserveCostCents` already charged its full reserved amount when pruning it, so only the
 * part of the actual cost above that amount is recorded — never the full cost a second time,
 * and never less than what was spent. Returns which of the two cases applied.
 */
export function reconcileReservation(
  db: DatabaseSync,
  reservation: Reservation,
  usage: Readonly<{ userId: string; promptTokens: number; outputTokens: number; costCents: number }>,
): ReconcileOutcome {
  db.exec('BEGIN IMMEDIATE');
  try {
    const deleted = db
      .prepare('DELETE FROM interpretation_cost_reservations WHERE id = ?')
      .run(reservation.reservationId);
    const outcome: ReconcileOutcome = Number(deleted.changes) === 0 ? 'late' : 'reconciled';

    recordUsage(db, {
      userId: usage.userId,
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
      costCents: outcome === 'late' ? Math.max(0, usage.costCents - reservation.reservedCents) : usage.costCents,
    });

    db.exec('COMMIT');
    return outcome;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  }
}
