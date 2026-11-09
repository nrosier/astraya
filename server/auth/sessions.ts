/**
 * Server-side sessions, not a self-contained signed token.
 *
 * A session is a row, and the row is the source of truth: revoking it — an admin
 * disabling a user, a sign-out — takes effect on the very next request. A
 * stateless JWT can't do that without a revocation list, at which point it's a
 * session table with extra steps. So the cookie carries only a random id; every
 * other fact about the session lives here.
 */

/**
 * @module sessions
 * @purpose Server-side session storage: the cookie carries only a random session id, and the `sessions` row is the real source of truth, so revocation (disabling a user, signing out) takes effect on the very next request.
 * @conventions Sliding expiry, not a fixed calendar expiry: `touchSession` extends it on an authenticated request; an OIDC-derived session gets a shorter TTL (`OIDC_SESSION_TTL_MS`) than a local one, since an upstream Authentik-side disable is otherwise invisible to Astraya once the token exchange is done. Touches are throttled (#1364): one conditional `UPDATE` writes only when `last_seen_at` is older than `TOUCH_INTERVAL_MS` (5 minutes), and only that write extends `expires_at`, so the worst case is an idle window up to 5 minutes shorter than the TTL; an active user cannot expire early, since the TTL is far longer than the interval. The same write stamps `users.last_seen_at`, which the admin user list reads, so last activity survives the sweep. Expired rows (and an OIDC row's stored ID token with them) are deleted by `sweepExpiredSessions`, in batches of `SWEEP_BATCH_SIZE`, yielding to the event loop between batches (`node:timers/promises`); the caller (`server/index.ts`) owns the timer.
 * @exports SESSION_COOKIE, TOUCH_INTERVAL_MS, SWEEP_BATCH_SIZE, Session, CreateSessionOptions, SweepLogger, createSession, getSession, touchSession, revokeSession, revokeAllSessionsForUser, sweepExpiredSessions
 */
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import type { Database } from '../db.ts';

export const SESSION_COOKIE = 'astraya_session';

/** Sliding window: a session dies if unused for this long, not on a fixed calendar date. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A shorter sliding window for OIDC-derived sessions (#75). A local account's disable
 * takes effect immediately (`resolveUser` checks `disabledAt`); an Authentik-side
 * disable is invisible to Astraya once the one-time token exchange is done — there's
 * no token round-trip left to notice it. This bounds "revoked upstream but still
 * signed into Astraya" to about a day, without polling Authentik's introspection
 * endpoint or any other new infrastructure. A deliberate, bounded tradeoff, not an
 * oversight — see the note in `.env.example`.
 */
const OIDC_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The least time between two writes of one session's `last_seen_at`/`expires_at` (#1364). Without
 * it every authenticated request, including each sync poll, was a WAL write. A small fraction of
 * the shorter (24 h) TTL: the idle window can shrink by at most this much, and an active user can
 * never expire early, because a request within the interval is always well before `expires_at`.
 */
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Rows deleted per sweep statement, so one sweep never holds the write lock for long (#1364). */
export const SWEEP_BATCH_SIZE = 500;

export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly oidcIdToken: string | null;
}

interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly expires_at: string;
  readonly oidc_id_token: string | null;
}

export interface CreateSessionOptions {
  /** The raw ID token JWT this session was minted from — kept only long enough to
   * support RP-initiated logout (#77); `undefined`/absent for a local-account session. */
  readonly oidcIdToken?: string;
}

export function createSession(db: Database, userId: string, options: CreateSessionOptions = {}): Session {
  const id = randomUUID();
  const now = new Date().toISOString();
  const ttl = options.oidcIdToken !== undefined ? OIDC_SESSION_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const oidcIdToken = options.oidcIdToken ?? null;
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, oidc_id_token) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, now, expiresAt, now, oidcIdToken);
  // A sign-in is activity: the admin list's "last seen" (`users.last_seen_at`) moves with it.
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, userId);
  return { id, userId, expiresAt, oidcIdToken };
}

/**
 * Looks up a session by id, returning `null` if it doesn't exist or has expired.
 * An expired row is left in place rather than deleted here — cleanup is not this
 * function's job, and a read path that also writes is a read path that can fail
 * for reasons unrelated to reading.
 */
export function getSession(db: Database, sessionId: string): Session | null {
  const row = db.prepare('SELECT id, user_id, expires_at, oidc_id_token FROM sessions WHERE id = ?').get(sessionId) as
    SessionRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.id, userId: row.user_id, expiresAt: row.expires_at, oidcIdToken: row.oidc_id_token };
}

/**
 * Extends the sliding expiry window and records activity. Call once per authenticated request.
 *
 * Throttled (#1364): a single conditional `UPDATE` writes only when the stored `last_seen_at` is
 * older than `TOUCH_INTERVAL_MS`, and extends `expires_at` (by the OIDC or local TTL, chosen in SQL
 * from `oidc_id_token`) only when it writes. A write also stamps the owner's `users.last_seen_at`.
 */
export function touchSession(db: Database, sessionId: string): void {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const staleBefore = new Date(nowMs - TOUCH_INTERVAL_MS).toISOString();
  const row = db
    .prepare(
      `UPDATE sessions
       SET last_seen_at = ?,
           expires_at = CASE WHEN oidc_id_token IS NOT NULL THEN ? ELSE ? END
       WHERE id = ? AND last_seen_at < ?
       RETURNING user_id`,
    )
    .get(
      now,
      new Date(nowMs + OIDC_SESSION_TTL_MS).toISOString(),
      new Date(nowMs + SESSION_TTL_MS).toISOString(),
      sessionId,
      staleBefore,
    ) as { readonly user_id: string } | undefined;
  if (!row) return;
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, row.user_id);
}

export function revokeSession(db: Database, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/** Used when disabling a user: existing sessions must die immediately, not merely block re-login. */
export function revokeAllSessionsForUser(db: Database, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Where `sweepExpiredSessions` reports a failure; Fastify's `app.log` fits. */
export interface SweepLogger {
  warn(obj: object, msg: string): void;
}

/** Databases with a sweep in progress, so a slow sweep and the next tick never overlap. */
const sweeping = new WeakSet<Database>();

/**
 * Deletes every expired session (#1364), and with it an OIDC row's stored ID token, which serves no
 * purpose once the session is dead. Strictly `expires_at < now` (ISO string, the same format the
 * column holds), so a row expiring exactly now is kept, matching `getSession`. Deletes in batches of
 * `SWEEP_BATCH_SIZE`, yielding to the event loop between batches, and stops early if the database is
 * closed meanwhile. Never throws: a failure is logged with `log.warn` and the next run tries again.
 * A call while a sweep of the same database is running returns 0 at once.
 *
 * @returns the number of rows deleted.
 */
export async function sweepExpiredSessions(db: Database, log: SweepLogger): Promise<number> {
  if (sweeping.has(db)) return 0;
  sweeping.add(db);
  let deleted = 0;
  try {
    const statement = db.prepare(
      'DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? LIMIT ?)',
    );
    for (;;) {
      const changes = Number(statement.run(new Date().toISOString(), SWEEP_BATCH_SIZE).changes);
      deleted += changes;
      if (changes < SWEEP_BATCH_SIZE) break;
      await setImmediate();
      if (!db.isOpen) break;
    }
  } catch (error) {
    log.warn({ err: error }, 'expired-session sweep failed');
  } finally {
    sweeping.delete(db);
  }
  return deleted;
}
