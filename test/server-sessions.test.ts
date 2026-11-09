/**
 * `server/auth/sessions.ts` in isolation, against a real in-memory schema —
 * closes a gap in #85's checklist: nothing exercised `touchSession`'s sliding
 * expiry or the shorter OIDC TTL directly before this file existed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.ts';
import {
  createSession,
  getSession,
  revokeAllSessionsForUser,
  revokeSession,
  SWEEP_BATCH_SIZE,
  sweepExpiredSessions,
  TOUCH_INTERVAL_MS,
  touchSession,
} from '../server/auth/sessions.ts';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OIDC_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let db: DatabaseSync;
let userId: string;

function insertUser(): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    `user-${id}`,
    'hash',
    new Date().toISOString(),
  );
  return id;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  userId = insertUser();
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

describe('createSession', () => {
  it('creates a local-account session with the 30-day sliding TTL', () => {
    const before = Date.now();
    const session = createSession(db, userId);
    expect(session.userId).toBe(userId);
    expect(session.oidcIdToken).toBeNull();
    expect(new Date(session.expiresAt).getTime()).toBeCloseTo(before + SESSION_TTL_MS, -2);
  });

  it('creates an OIDC-derived session with the shorter 24h sliding TTL', () => {
    const before = Date.now();
    const session = createSession(db, userId, { oidcIdToken: 'raw-id-token' });
    expect(session.oidcIdToken).toBe('raw-id-token');
    expect(new Date(session.expiresAt).getTime()).toBeCloseTo(before + OIDC_SESSION_TTL_MS, -2);
  });
});

describe('session ids at rest (#1360)', () => {
  it('stores sha256 of the cookie value as the row id, never the cookie value itself', () => {
    const created = createSession(db, userId);
    const expected = createHash('sha256').update(created.cookieValue).digest('hex');
    expect(created.id).toBe(expected);
    expect(created.id).not.toBe(created.cookieValue);
    const rows = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(userId) as { id: string }[];
    expect(rows).toEqual([{ id: expected }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?').get(created.cookieValue)).toEqual({ n: 0 });
  });
});

describe('getSession', () => {
  it('returns the session when it exists and has not expired', () => {
    const { cookieValue, ...stored } = createSession(db, userId);
    const found = getSession(db, cookieValue);
    expect(found).toEqual(stored);
  });

  it('finds the session only by its raw cookie value, not by the stored hash (#1360)', () => {
    const created = createSession(db, userId);
    expect(getSession(db, created.id)).toBeNull();
  });

  it('returns null for an unknown session id', () => {
    expect(getSession(db, randomUUID())).toBeNull();
  });

  it('returns null once the session has expired, without deleting the row', () => {
    const created = createSession(db, userId);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000);
    expect(getSession(db, created.cookieValue)).toBeNull();

    vi.useRealTimers();
    const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(created.id);
    expect(row).toBeTruthy();
  });
});

describe('touchSession', () => {
  it('extends a local-account session forward by the 30-day TTL from now', () => {
    const created = createSession(db, userId);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + TOUCH_INTERVAL_MS + 1000);
    const now = Date.now();
    touchSession(db, created.cookieValue);
    vi.useRealTimers();

    const row = db.prepare('SELECT expires_at, last_seen_at FROM sessions WHERE id = ?').get(created.id) as {
      expires_at: string;
      last_seen_at: string;
    };
    expect(new Date(row.expires_at).getTime()).toBeCloseTo(now + SESSION_TTL_MS, -2);
    expect(new Date(row.last_seen_at).getTime()).toBeCloseTo(now, -2);
  });

  it('extends an OIDC-derived session forward by the shorter 24h TTL, not the 30-day one', () => {
    const created = createSession(db, userId, { oidcIdToken: 'raw-id-token' });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + TOUCH_INTERVAL_MS + 1000);
    const now = Date.now();
    touchSession(db, created.cookieValue);
    vi.useRealTimers();

    const row = db.prepare('SELECT expires_at FROM sessions WHERE id = ?').get(created.id) as {
      expires_at: string;
    };
    expect(new Date(row.expires_at).getTime()).toBeCloseTo(now + OIDC_SESSION_TTL_MS, -2);
  });

  it('is a no-op for an unknown session id', () => {
    expect(() => {
      touchSession(db, randomUUID());
    }).not.toThrow();
  });

  it('writes at most once within TOUCH_INTERVAL_MS, and the sliding expiry still extends after it (#1364)', () => {
    const created = createSession(db, userId);
    const readRow = () =>
      db.prepare('SELECT expires_at, last_seen_at FROM sessions WHERE id = ?').get(created.id) as {
        expires_at: string;
        last_seen_at: string;
      };
    // Rows written by INSERT/UPDATE/DELETE on this connection so far: a no-op touch adds none.
    const writes = () => (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + TOUCH_INTERVAL_MS + 1000);
    const firstTouchAt = Date.now();
    const beforeFirst = writes();
    touchSession(db, created.cookieValue);
    // One session row plus the owner's users.last_seen_at.
    expect(writes() - beforeFirst).toBe(2);
    const afterFirst = readRow();
    expect(new Date(afterFirst.last_seen_at).getTime()).toBe(firstTouchAt);
    expect(new Date(afterFirst.expires_at).getTime()).toBe(firstTouchAt + SESSION_TTL_MS);

    // A second request in quick succession: the conditional UPDATE matches no row.
    vi.setSystemTime(firstTouchAt + 1000);
    const beforeSecond = writes();
    touchSession(db, created.cookieValue);
    expect(writes() - beforeSecond).toBe(0);
    expect(readRow()).toEqual(afterFirst);

    // Past the interval, the sliding expiry extends again.
    vi.setSystemTime(firstTouchAt + TOUCH_INTERVAL_MS + 1000);
    const thirdTouchAt = Date.now();
    touchSession(db, created.cookieValue);
    const afterThird = readRow();
    expect(new Date(afterThird.last_seen_at).getTime()).toBe(thirdTouchAt);
    expect(new Date(afterThird.expires_at).getTime()).toBe(thirdTouchAt + SESSION_TTL_MS);
    expect(new Date(afterThird.expires_at).getTime()).toBeGreaterThan(new Date(afterFirst.expires_at).getTime());
  });

  it("stamps the user's last_seen_at on a write, so it survives the session being swept (#1364)", async () => {
    const created = createSession(db, userId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + TOUCH_INTERVAL_MS + 1000);
    const touchedAt = new Date().toISOString();
    touchSession(db, created.cookieValue);
    vi.setSystemTime(Date.parse(touchedAt) + SESSION_TTL_MS + 1000);
    await sweepExpiredSessions(db, { warn: () => undefined });
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get(userId)).toEqual({ last_seen_at: touchedAt });
  });
});

describe('revokeSession', () => {
  it('deletes the session row so a subsequent getSession returns null', () => {
    const created = createSession(db, userId);
    revokeSession(db, created.cookieValue);
    expect(getSession(db, created.cookieValue)).toBeNull();
    expect(db.prepare('SELECT id FROM sessions WHERE id = ?').get(created.id)).toBeUndefined();
  });
});

describe('revokeAllSessionsForUser', () => {
  it('deletes every session for that user, and no others', () => {
    const otherUserId = insertUser();
    const mine1 = createSession(db, userId);
    const mine2 = createSession(db, userId);
    const other = createSession(db, otherUserId);

    revokeAllSessionsForUser(db, userId);

    expect(getSession(db, mine1.cookieValue)).toBeNull();
    expect(getSession(db, mine2.cookieValue)).toBeNull();
    expect(getSession(db, other.cookieValue)).not.toBeNull();
  });
});

describe('sweepExpiredSessions', () => {
  function insertSession(id: string, expiresAt: string, oidcIdToken: string | null = null): void {
    db.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, oidc_id_token) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, userId, '2026-01-01T00:00:00.000Z', expiresAt, '2026-01-01T00:00:00.000Z', oidcIdToken);
  }
  const ids = () => (db.prepare('SELECT id FROM sessions ORDER BY id').all() as { id: string }[]).map((r) => r.id);
  const noLog = { warn: () => undefined };

  it('deletes an aged row (and an OIDC row with its token), keeps a valid one and one expiring exactly now', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    insertSession('aged', new Date(now.getTime() - 1).toISOString());
    insertSession('aged-oidc', new Date(now.getTime() - 60_000).toISOString(), 'raw-id-token');
    insertSession('exactly-now', now.toISOString());
    insertSession('valid', new Date(now.getTime() + 60_000).toISOString());

    expect(await sweepExpiredSessions(db, noLog)).toBe(2);
    expect(ids()).toEqual(['exactly-now', 'valid']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE oidc_id_token IS NOT NULL').get()).toEqual({ n: 0 });
  });

  it('ages a session created by createSession past its TTL and removes it', async () => {
    const created = createSession(db, userId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000);
    await sweepExpiredSessions(db, noLog);
    expect(db.prepare('SELECT id FROM sessions WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it('removes more than one batch of expired rows through the batch loop', async () => {
    const total = SWEEP_BATCH_SIZE * 2 + 7;
    const insert = db.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    );
    db.exec('BEGIN');
    for (let i = 0; i < total; i++) {
      insert.run(`old-${String(i)}`, userId, 'x', '2020-01-01T00:00:00.000Z', 'x');
    }
    db.exec('COMMIT');
    insertSession('valid', '2999-01-01T00:00:00.000Z');

    expect(await sweepExpiredSessions(db, noLog)).toBe(total);
    expect(ids()).toEqual(['valid']);
  });

  it('never overlaps: a second call during a running sweep returns at once', async () => {
    const insert = db.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let i = 0; i < SWEEP_BATCH_SIZE + 1; i++) {
      insert.run(`old-${String(i)}`, userId, 'x', '2020-01-01T00:00:00.000Z', 'x');
    }
    const first = sweepExpiredSessions(db, noLog);
    expect(await sweepExpiredSessions(db, noLog)).toBe(0);
    expect(await first).toBe(SWEEP_BATCH_SIZE + 1);
  });

  it('logs a failure with warn and never throws', async () => {
    const warn = vi.fn();
    const closed = openDatabase(':memory:');
    closed.close();
    await expect(sweepExpiredSessions(closed, { warn })).resolves.toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });
});
