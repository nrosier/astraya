/**
 * Unit tests for the cost reservation system (#461) — atomicity of reservations
 * under concurrency and correct reconciliation to real usage — and its lease-expiry
 * handling (#476): an expired lease is charged, never silently dropped.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.ts';
import {
  RESERVATION_TTL_MS,
  reserveCostCents,
  releaseReservation,
  reconcileReservation,
} from '../server/interpretation/cost-reservation.ts';
import { PROVIDER_CALL_DEADLINE_MS } from '../server/interpretation/llm-client.ts';
import { totalCostCentsSince, userCostCentsSince } from '../server/interpretation/usage.ts';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
  // Insert a test user.
  const userId = 'test-user';
  db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    'testuser',
    'hash',
    'user',
    new Date().toISOString(),
  );
});

describe('cost-reservation', () => {
  test('reserveCostCents accepts a reservation when within user and global caps', () => {
    const userId = 'test-user';
    const reservation = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: 500,
      totalDailyCapCents: 1000,
    });

    expect('reservationId' in reservation).toBe(true);
    if ('reservationId' in reservation) {
      expect(typeof reservation.reservationId).toBe('string');
      expect(reservation.reservationId.length).toBeGreaterThan(0);
    }
  });

  test('reserveCostCents rejects with user-cap when committed usage + reservation exceeds user cap', () => {
    const userId = 'test-user';
    const userCap = 200;

    // Record 150 cents of committed usage.
    db.prepare(
      `INSERT INTO interpretation_usage (user_id, prompt_tokens, output_tokens, cost_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(userId, 1000, 500, 150, new Date().toISOString());

    // Try to reserve 100 more — should fail because 150 + 100 > 200.
    const reservation = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: userCap,
      totalDailyCapCents: 1000,
    });

    expect('reason' in reservation && reservation.reason === 'user-cap').toBe(true);
  });

  test('reserveCostCents rejects with total-cap when global committed usage + reservation exceeds total cap', () => {
    const userCap = 1000;
    const totalCap = 200;

    // Record 150 cents of committed usage globally (from any user).
    db.prepare(
      `INSERT INTO interpretation_usage (user_id, prompt_tokens, output_tokens, cost_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('test-user', 1000, 500, 150, new Date().toISOString());

    // Try to reserve 100 more for any user — should fail because 150 + 100 > 200.
    const reservation = reserveCostCents(db, {
      userId: 'test-user',
      maxCents: 100,
      userDailyCapCents: userCap,
      totalDailyCapCents: totalCap,
    });

    expect('reason' in reservation && reservation.reason === 'total-cap').toBe(true);
  });

  test('reserveCostCents rejects with user-cap when an active reservation plus new reservation exceeds user cap', () => {
    const userId = 'test-user';
    const userCap = 200;

    // Make one reservation for 100 cents.
    const reservation1 = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: userCap,
      totalDailyCapCents: 1000,
    });
    expect('reservationId' in reservation1).toBe(true);

    // Try to make another reservation for 150 — should fail because 100 + 150 > 200.
    const reservation2 = reserveCostCents(db, {
      userId,
      maxCents: 150,
      userDailyCapCents: userCap,
      totalDailyCapCents: 1000,
    });

    expect('reason' in reservation2 && reservation2.reason === 'user-cap').toBe(true);
  });

  test('releaseReservation removes the reservation from the table', () => {
    const userId = 'test-user';

    const reservation = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: 500,
      totalDailyCapCents: 1000,
    });
    expect('reservationId' in reservation).toBe(true);

    if ('reservationId' in reservation) {
      releaseReservation(db, reservation.reservationId);

      // The reservation should be gone, so another one for the same amount should now succeed.
      const newReservation = reserveCostCents(db, {
        userId,
        maxCents: 100,
        userDailyCapCents: 500,
        totalDailyCapCents: 1000,
      });
      expect('reservationId' in newReservation).toBe(true);
    }
  });

  test('reconcileReservation deletes the reservation and records usage', () => {
    const userId = 'test-user';

    const reservation = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: 500,
      totalDailyCapCents: 1000,
    });
    expect('reservationId' in reservation).toBe(true);

    if ('reservationId' in reservation) {
      // Reconcile with real cost 75 cents.
      const outcome = reconcileReservation(db, reservation, {
        userId,
        promptTokens: 1000,
        outputTokens: 500,
        costCents: 75,
      });
      expect(outcome).toBe('reconciled');

      // Check that the reservation is gone.
      const rows = db
        .prepare(`SELECT id FROM interpretation_cost_reservations WHERE id = ?`)
        .all(reservation.reservationId) as unknown[];
      expect(rows.length).toBe(0);

      // Check that usage was recorded.
      const cost = userCostCentsSince(db, userId);
      expect(cost).toBe(75);
    }
  });

  test('expired reservations are pruned and charged at their full reserved amount (#476)', () => {
    const userId = 'test-user';
    const userCap = 200;

    // Insert an old, expired reservation.
    const expiredId = 'expired-id';
    const now = new Date();
    const pastTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

    db.prepare(
      `INSERT INTO interpretation_cost_reservations (id, user_id, reserved_cents, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(expiredId, userId, 150, pastTime.toISOString(), pastTime.toISOString());

    // An expired lease's call may still bill, so its 150 cents are charged when pruned rather than
    // released: 150 + 100 > 200 rejects, and 150 + 50 fits.
    const tooMuch = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: userCap,
      totalDailyCapCents: 1000,
    });
    expect(tooMuch).toEqual({ reason: 'user-cap' });

    const reservation = reserveCostCents(db, {
      userId,
      maxCents: 50,
      userDailyCapCents: userCap,
      totalDailyCapCents: 1000,
    });
    expect('reservationId' in reservation).toBe(true);

    // Confirm the expired reservation was removed and charged exactly once.
    const rows = db.prepare(`SELECT id FROM interpretation_cost_reservations WHERE id = ?`).all(expiredId) as unknown[];
    expect(rows.length).toBe(0);
    expect(userCostCentsSince(db, userId)).toBe(150);
  });
});

describe('cost-reservation lease expiry (#476)', () => {
  const userId = 'test-user';
  const caps = { userDailyCapCents: 100, totalDailyCapCents: 100 } as const;

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Committed usage plus every still-held reservation — the spend the caps must bound. */
  function exposureCents(): number {
    const reserved = db
      .prepare('SELECT COALESCE(SUM(reserved_cents), 0) AS total FROM interpretation_cost_reservations')
      .get() as unknown as { readonly total: number };
    return totalCostCentsSince(db) + reserved.total;
  }

  test('the provider call deadline is shorter than the reservation lease', () => {
    expect(PROVIDER_CALL_DEADLINE_MS).toBeLessThan(RESERVATION_TTL_MS);
  });

  test('late reconciliation after lease expiry cannot exceed cap', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));

    const first = reserveCostCents(db, { userId, maxCents: 100, ...caps });
    if (!('reservationId' in first)) throw new Error('first reservation should be accepted');

    // The first call hangs past its lease.
    vi.setSystemTime(Date.now() + RESERVATION_TTL_MS + 1000);

    // A second reservation prunes the expired lease, but the cap headroom it held is charged, not freed.
    const second = reserveCostCents(db, { userId, maxCents: 100, ...caps });
    expect(second).toEqual({ reason: 'user-cap' });

    // The first call finally completes at its full reserved cost and reconciles late.
    const outcome = reconcileReservation(db, first, { userId, promptTokens: 1000, outputTokens: 500, costCents: 100 });
    expect(outcome).toBe('late');

    expect(totalCostCentsSince(db)).toBe(100);
    expect(exposureCents()).toBeLessThanOrEqual(100);
  });

  test('late reconciliation records only the actual cost above the already-charged reservation', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));

    const first = reserveCostCents(db, { userId, maxCents: 40, userDailyCapCents: 500, totalDailyCapCents: 500 });
    if (!('reservationId' in first)) throw new Error('reservation should be accepted');

    vi.setSystemTime(Date.now() + RESERVATION_TTL_MS + 1000);
    // Pruning happens on the next reservation; this one is unrelated and released straight away.
    const other = reserveCostCents(db, { userId, maxCents: 10, userDailyCapCents: 500, totalDailyCapCents: 500 });
    if (!('reservationId' in other)) throw new Error('reservation should be accepted');
    releaseReservation(db, other.reservationId);
    expect(userCostCentsSince(db, userId)).toBe(40);

    // Cheaper than reserved: already covered, nothing more is added.
    expect(reconcileReservation(db, first, { userId, promptTokens: 10, outputTokens: 10, costCents: 25 })).toBe('late');
    expect(userCostCentsSince(db, userId)).toBe(40);
  });

  test('a late reconciliation above the reserved amount still records the excess', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));

    const first = reserveCostCents(db, { userId, maxCents: 40, userDailyCapCents: 500, totalDailyCapCents: 500 });
    if (!('reservationId' in first)) throw new Error('reservation should be accepted');

    vi.setSystemTime(Date.now() + RESERVATION_TTL_MS + 1000);
    const other = reserveCostCents(db, { userId, maxCents: 10, userDailyCapCents: 500, totalDailyCapCents: 500 });
    if (!('reservationId' in other)) throw new Error('reservation should be accepted');
    releaseReservation(db, other.reservationId);

    reconcileReservation(db, first, { userId, promptTokens: 10, outputTokens: 10, costCents: 55 });
    expect(userCostCentsSince(db, userId)).toBe(55);
  });
});
