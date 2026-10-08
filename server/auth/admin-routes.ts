/**
 * Admin user management (#135): list, create, reset-password, disable/enable, change role, a
 * pre-delete impact preview, and delete. Two levels of administrator (#431): listing the users is
 * read-only information any admin may see (the AI usage report names users too), but every action
 * that creates, changes or removes an account — and the deletion-impact preview, which decrypts
 * counts for one user — requires a **super admin**. `requireUser`/the ops relay are untouched by
 * this file.
 *
 * Two rules protect the instance from locking itself out: nobody can change their own role (so a
 * super admin cannot quietly demote themselves out of the only seat), and the last usable super
 * admin cannot be demoted, disabled or deleted.
 *
 * No route here reads another user's `people`/`charts` data. The one exception,
 * `deletion-impact`, decrypts only counts (distinct entity ids) for one target
 * user immediately before a destructive delete — see `deletion-impact.ts`'s own
 * comment for why that's a narrow, deliberate exception, not a new capability.
 */

/**
 * @module admin-routes
 * @purpose Admin HTTP routes for managing user accounts: listing, creating, password reset, disable/enable, role change, a pre-delete deletion-impact preview, and delete.
 * @conventions Listing users is `requireAdmin`-gated (any admin), but every account-mutating route and the deletion-impact preview require `requireSuperAdmin`; nobody may change their own role, and the only remaining enabled super admin cannot be demoted, disabled, or deleted, so the instance can never lock itself out of account management. The deletion-impact route is a `POST`, not a `GET`, specifically so `SameSite=Lax` cannot let a followed link trigger it via a cross-site navigation.
 * @exports registerAdminRoutes
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db.ts';
import { getUserByUsername, requireAdmin, requireSuperAdmin, roleFields } from './identity.ts';
import { isRole, ROLES, type Role } from './roles.ts';
import { loadOidcConfig } from './oidc.ts';
import { revokeAllSessionsForUser } from './sessions.ts';
import { loadEncryptionKey } from '../ops/crypto.ts';
import { previewDeletionImpact } from '../ops/deletion-impact.ts';

const PASSWORD_SET_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Mirrors `auth/routes.ts`'s own cap — see that file for the reasoning (#317). */
const MAX_USERNAME_LENGTH = 64;

interface AdminUserRow {
  readonly id: string;
  readonly username: string;
  readonly role: string;
  readonly created_at: string;
  readonly disabled_at: string | null;
  readonly last_seen_at: string | null;
  readonly last_sync_at: string | null;
  readonly last_ai_usage_at: string | null;
}

interface AdminUser {
  readonly id: string;
  readonly username: string;
  readonly role: Role;
  /** An admin or a super admin. */
  readonly isAdmin: boolean;
  readonly createdAt: string;
  readonly disabledAt: string | null;
  readonly lastSeenAt: string | null;
  /** Most recent op this user pushed through the sync relay (#445), not merely a session heartbeat. */
  readonly lastSyncAt: string | null;
  /** Most recent Tier 2 interpretation request recorded for this user (#445). */
  readonly lastAiUsageAt: string | null;
}

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    username: row.username,
    ...roleFields(isRole(row.role) ? row.role : 'user'),
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
    lastSeenAt: row.last_seen_at,
    lastSyncAt: row.last_sync_at,
    lastAiUsageAt: row.last_ai_usage_at,
  };
}

// #445: last-seen alone only reflects session heartbeats, not real activity — these two extra
// LEFT JOINs (same shape as the existing `sessions` one) surface the most recent op the user
// actually pushed through the sync relay, and the most recent Tier 2 interpretation request
// recorded for them, so an admin can tell a dormant account from a user who syncs/queries the AI
// but never refreshes a session.
const ADMIN_USER_SELECT = `SELECT users.id, users.username, users.role, users.created_at, users.disabled_at,
              MAX(sessions.last_seen_at) AS last_seen_at,
              MAX(ops.received_at) AS last_sync_at,
              MAX(interpretation_usage.created_at) AS last_ai_usage_at
       FROM users
       LEFT JOIN sessions ON sessions.user_id = users.id
       LEFT JOIN ops ON ops.user_id = users.id
       LEFT JOIN interpretation_usage ON interpretation_usage.user_id = users.id`;

function getAdminUser(db: Database, id: string): AdminUser | null {
  const row = db.prepare(`${ADMIN_USER_SELECT} WHERE users.id = ? GROUP BY users.id`).get(id) as
    AdminUserRow | undefined;
  return row ? toAdminUser(row) : null;
}

/**
 * True iff `userId` is a super admin and the sole remaining *usable* one — demoting, disabling or
 * deleting them would leave the instance unmanageable through the UI. Counts only enabled super
 * admins (#318): otherwise disabling super admin A while B still exists is allowed (B isn't
 * disabled), and then disabling/demoting B later leaves the only *enabled* one already disabled,
 * with no one able to act and no in-UI recovery path.
 */
function isOnlyRemainingSuperAdmin(db: Database, userId: string): boolean {
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  if (row?.role !== 'super_admin') return false;
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND disabled_at IS NULL")
    .get() as {
    count: number;
  };
  return count.count <= 1;
}

function mintPasswordSetToken(db: Database, userId: string): string {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + PASSWORD_SET_TOKEN_TTL_MS).toISOString();
  db.prepare('UPDATE users SET password_set_token = ?, password_set_token_expires_at = ? WHERE id = ?').run(
    token,
    expiresAt,
    userId,
  );
  return token;
}

function setPasswordUrl(token: string): string {
  return `/#/set-password?token=${token}`;
}

interface CreateUserBody {
  readonly username?: unknown;
  readonly role?: unknown;
}

interface SetRoleBody {
  readonly role?: unknown;
}

/** The caller, who `requireAdmin`/`requireSuperAdmin` has already resolved. */
function actorId(request: FastifyRequest): string {
  if (!request.user) throw new Error('a role preHandler did not run before this handler.');
  return request.user.id;
}

export function registerAdminRoutes(app: FastifyInstance, db: Database): void {
  app.get(
    '/api/admin/users',
    { preHandler: requireAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const rows = db
        .prepare(`${ADMIN_USER_SELECT} GROUP BY users.id ORDER BY users.created_at`)
        .all() as unknown as AdminUserRow[];
      return reply.send({ users: rows.map(toAdminUser) });
    },
  );

  app.post<{ Body: CreateUserBody }>(
    '/api/admin/users',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (loadOidcConfig()) {
        return reply.code(409).send({ error: 'Local accounts cannot be created while OIDC is configured' });
      }

      const { username, role } = request.body;
      if (typeof username !== 'string' || username === '') {
        return reply.code(400).send({ error: 'username is required' });
      }
      if (username.length > MAX_USERNAME_LENGTH) {
        return reply.code(400).send({ error: `username must be at most ${String(MAX_USERNAME_LENGTH)} characters` });
      }
      if (role !== undefined && !isRole(role)) {
        return reply.code(400).send({ error: `role must be one of ${ROLES.join(', ')}` });
      }
      if (getUserByUsername(db, username)) return reply.code(409).send({ error: 'Username already taken' });

      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, NULL, ?, ?)').run(
        id,
        username,
        role ?? 'user',
        now,
      );
      const token = mintPasswordSetToken(db, id);
      const user = getAdminUser(db, id);
      return reply.code(201).send({ user, setPasswordUrl: setPasswordUrl(token) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/reset-password',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = getAdminUser(db, request.params.id);
      if (!user) return reply.code(404).send({ error: 'No such user' });
      const token = mintPasswordSetToken(db, user.id);
      return reply.send({ user, setPasswordUrl: setPasswordUrl(token) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/disable',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = getAdminUser(db, request.params.id);
      if (!user) return reply.code(404).send({ error: 'No such user' });
      if (isOnlyRemainingSuperAdmin(db, user.id)) {
        return reply.code(409).send({ error: 'Cannot disable the only remaining super admin' });
      }
      db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
      revokeAllSessionsForUser(db, user.id);
      return reply.send({ user: getAdminUser(db, user.id) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/enable',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = getAdminUser(db, request.params.id);
      if (!user) return reply.code(404).send({ error: 'No such user' });
      db.prepare('UPDATE users SET disabled_at = NULL WHERE id = ?').run(user.id);
      return reply.send({ user: getAdminUser(db, user.id) });
    },
  );

  // One route for every role change (#431), replacing separate promote and demote routes: the
  // target role is data, and the rules below are the same whichever way it moves.
  app.post<{ Params: { id: string }; Body: SetRoleBody }>(
    '/api/admin/users/:id/role',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { role } = request.body;
      if (!isRole(role)) return reply.code(400).send({ error: `role must be one of ${ROLES.join(', ')}` });
      const user = getAdminUser(db, request.params.id);
      if (!user) return reply.code(404).send({ error: 'No such user' });
      if (user.id === actorId(request)) {
        return reply.code(409).send({ error: 'You cannot change your own role' });
      }
      if (user.role === 'super_admin' && role !== 'super_admin' && isOnlyRemainingSuperAdmin(db, user.id)) {
        return reply.code(409).send({ error: 'Cannot demote the only remaining super admin' });
      }
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
      return reply.send({ user: getAdminUser(db, user.id) });
    },
  );

  // `POST`, though it reads rather than writes (#329). `SameSite=Lax` sends the session
  // cookie on a cross-site top-level *navigation*, which is exactly what a `GET` here
  // would be — so an admin who followed a link could be made to run this route's
  // decrypt-and-count loop over another user's whole operation log. A write method is not
  // reachable that way at all.
  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/deletion-impact',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = getAdminUser(db, request.params.id);
      if (!user) return reply.code(404).send({ error: 'No such user' });
      const impact = previewDeletionImpact(db, user.id, loadEncryptionKey());
      return reply.send(impact);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: requireSuperAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = getAdminUser(db, request.params.id);
      if (!user) return reply.code(404).send({ error: 'No such user' });
      if (isOnlyRemainingSuperAdmin(db, user.id)) {
        return reply.code(409).send({ error: 'Cannot delete the only remaining super admin' });
      }
      // ON DELETE CASCADE on both sessions.user_id and ops.user_id takes care of the rest.
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      return reply.send({ ok: true });
    },
  );
}
