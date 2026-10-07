/**
 * `server/interpretation/cost-reservation.ts` (#461): the atomic reserve/reconcile/release cycle
 * that makes Tier 2's two daily cost caps real under concurrency, rather than only advisory
 * against a single pre-call read of `interpretation_usage`. Against an in-memory
 * `openDatabase(':memory:')`, same pattern as `test/server-interpretation-usage.test.ts` — no
 * Fastify app needed since these are plain functions over `Database`.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import { recordUsage, userCostCentsSince, totalCostCentsSince } from '../server/interpretation/usage.ts';
import {
  reserveCostCents,
  releaseReservation,
  reconcileReservation,
} from '../server/interpretation/cost-reservation.ts';

function makeUser(db: Database, username: string): string {
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)").run(
    id,
    username,
    'irrelevant-hash',
    new Date().toISOString(),
  );
  return id;
}

describe('reserveCostCents (#461)', () => {
  it('reserves when the amount fits under both caps', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');
    const reservation = reserveCostCents(db, {
      userId: alice,
      maxCents: 10,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    expect(reservation).toHaveProperty('reservationId');
    db.close();
  });

  it('rejects with user-cap when committed usage alone would exceed the per-user cap', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');
    recordUsage(db, { userId: alice, promptTokens: 1, outputTokens: 1, costCents: 45 });

    const reservation = reserveCostCents(db, {
      userId: alice,
      maxCents: 10,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    expect(reservation).toEqual({ reason: 'user-cap' });
    db.close();
  });

  it('rejects with total-cap when committed usage alone would exceed the deployment-wide cap', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');
    const bob = makeUser(db, 'bob');
    recordUsage(db, { userId: bob, promptTokens: 1, outputTokens: 1, costCents: 495 });

    const reservation = reserveCostCents(db, {
      userId: alice,
      maxCents: 10,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    expect(reservation).toEqual({ reason: 'total-cap' });
    db.close();
  });

  it('rejects a second reservation whose sum with an existing active reservation would exceed the per-user cap — the core atomicity property', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');

    // No committed usage at all yet — only another in-flight reservation accounts for this.
    const first = reserveCostCents(db, { userId: alice, maxCents: 45, userDailyCapCents: 50, totalDailyCapCents: 500 });
    expect(first).toHaveProperty('reservationId');

    const second = reserveCostCents(db, {
      userId: alice,
      maxCents: 10,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    expect(second).toEqual({ reason: 'user-cap' });
    db.close();
  });

  it('rejects a second reservation whose sum with an existing active reservation would exceed the total cap, even for a different user', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');
    const bob = makeUser(db, 'bob');

    const first = reserveCostCents(db, {
      userId: alice,
      maxCents: 495,
      userDailyCapCents: 500,
      totalDailyCapCents: 500,
    });
    expect(first).toHaveProperty('reservationId');

    const second = reserveCostCents(db, { userId: bob, maxCents: 10, userDailyCapCents: 500, totalDailyCapCents: 500 });
    expect(second).toEqual({ reason: 'total-cap' });
    db.close();
  });

  it('excludes an expired reservation from the sum a fresh reservation attempt sees', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');

    // Insert an already-expired reservation directly, bypassing reserveCostCents's own TTL —
    // simulating one abandoned by a crashed process well in the past.
    db.prepare(
      'INSERT INTO interpretation_cost_reservations (id, user_id, reserved_cents, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      randomUUID(),
      alice,
      45,
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() - 30_000).toISOString(),
    );

    const reservation = reserveCostCents(db, {
      userId: alice,
      maxCents: 10,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    expect(reservation).toHaveProperty('reservationId');
    db.close();
  });
});

describe('releaseReservation (#461)', () => {
  it('frees the reserved amount so a subsequent reservation can fit', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');

    const first = reserveCostCents(db, { userId: alice, maxCents: 45, userDailyCapCents: 50, totalDailyCapCents: 500 });
    if (!('reservationId' in first)) throw new Error('expected a reservation');
    releaseReservation(db, first.reservationId);

    const second = reserveCostCents(db, {
      userId: alice,
      maxCents: 45,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    expect(second).toHaveProperty('reservationId');
    db.close();
  });
});

describe('reconcileReservation (#461)', () => {
  it('removes the reservation and leaves exactly the real cost recorded', () => {
    const db = openDatabase(':memory:');
    const alice = makeUser(db, 'alice');

    const reservation = reserveCostCents(db, {
      userId: alice,
      maxCents: 45,
      userDailyCapCents: 50,
      totalDailyCapCents: 500,
    });
    if (!('reservationId' in reservation)) throw new Error('expected a reservation');

    reconcileReservation(db, reservation.reservationId, {
      userId: alice,
      promptTokens: 10,
      outputTokens: 5,
      costCents: 3,
    });

    expect(userCostCentsSince(db, alice)).toBe(3);
    expect(totalCostCentsSince(db)).toBe(3);

    // The reservation's hold is gone, so a reservation that would only have fit alongside the
    // real (lower) recorded cost — not alongside the original higher reserved amount — now fits.
    const after = reserveCostCents(db, { userId: alice, maxCents: 46, userDailyCapCents: 50, totalDailyCapCents: 500 });
    expect(after).toHaveProperty('reservationId');
    db.close();
  });
});
