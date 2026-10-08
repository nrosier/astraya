/**
 * Unit tests for the cost reservation system (#461) — atomicity of reservations
 * under concurrency and correct reconciliation to real usage.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.ts';
import {
  reserveCostCents,
  releaseReservation,
  reconcileReservation,
} from '../server/interpretation/cost-reservation.ts';
import { userCostCentsSince, totalCostCentsSince } from '../server/interpretation/usage.ts';

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
      reconcileReservation(db, reservation.reservationId, {
        userId,
        promptTokens: 1000,
        outputTokens: 500,
        costCents: 75,
      });

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

  test('expired reservations are pruned and do not count against caps', () => {
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

    // Try to reserve 100 cents — should succeed because the expired reservation is pruned.
    const reservation = reserveCostCents(db, {
      userId,
      maxCents: 100,
      userDailyCapCents: userCap,
      totalDailyCapCents: 1000,
    });

    expect('reservationId' in reservation).toBe(true);

    // Confirm the expired reservation was removed.
    const rows = db.prepare(`SELECT id FROM interpretation_cost_reservations WHERE id = ?`).all(expiredId) as unknown[];
    expect(rows.length).toBe(0);
  });
});
