/**
 * Admin user management (`server/auth/admin-routes.ts`, #135), exercised through
 * Fastify's `app.inject()` against a temp SQLite file — same shape as
 * `test/server-ops.test.ts`, which this borrows its admin/second-user setup
 * helpers from.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { hashPassword } from '../server/auth/passwords.ts';
import { createClock, randomNodeId, tick } from '../src/store/hlc.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const ENCRYPTION_KEY = randomBytes(32).toString('base64');

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-admin-test-'));
  dbPath = join(dir, 'astraya.db');
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = ENCRYPTION_KEY;
  app = await build({ dbPath });
});

afterEach(async () => {
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  delete process.env.ASTRAYA_OIDC_ISSUER;
  delete process.env.ASTRAYA_OIDC_CLIENT_ID;
  delete process.env.ASTRAYA_PUBLIC_URL;
  rmSync(dir, { recursive: true, force: true });
});

async function setupAdmin(target: FastifyInstance, username = 'alice', password = 'correct-horse-battery') {
  const response = await target.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username, password },
  });
  const sessionId = response.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error('setup did not set a session cookie');
  return sessionId;
}

async function createAndLoginUser(
  target: FastifyInstance,
  username: string,
  password: string,
  targetDbPath: string = dbPath,
  role: 'user' | 'admin' | 'super_admin' = 'user',
): Promise<string> {
  const passwordHash = await hashPassword(password);
  const raw = new DatabaseSync(targetDbPath);
  raw
    .prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), username, passwordHash, role, new Date().toISOString());
  raw.close();

  const login = await target.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  const sessionId = login.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error('login did not set a session cookie');
  return sessionId;
}

/** `setPasswordUrl` is a hash-route URL (`/#/set-password?token=...`) — the query lives in the fragment, not `URL.search`. */
function extractSetPasswordToken(setPasswordUrl: string): string | null {
  const hash = setPasswordUrl.split('#')[1] ?? '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('token');
}

interface ClockRef {
  current: ReturnType<typeof createClock>;
}

/** Pushes one fixture op through the real relay, matching the client's wire mapping (Phase 3). */
async function pushOp(
  target: FastifyInstance,
  sessionCookie: string,
  clockRef: ClockRef,
  body: { readonly entity: string; readonly entityId: string; readonly field: string; readonly value: unknown },
) {
  const { clock, hlc } = tick(clockRef.current, Date.now());
  clockRef.current = clock;
  const payload = Buffer.from(JSON.stringify(body)).toString('base64');
  const response = await target.inject({
    method: 'POST',
    url: '/api/ops',
    cookies: { [SESSION_COOKIE]: sessionCookie },
    payload: { ops: [{ hlc, deviceId: clock.nodeId, opVersion: 1, payload }] },
  });
  if (response.statusCode !== 200) throw new Error(`push failed: ${response.statusCode} ${response.body}`);
}

describe('requireAdmin', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a non-admin user with 403', async () => {
    await setupAdmin(app);
    const cookie = await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { [SESSION_COOKIE]: cookie },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('GET /api/admin/users', () => {
  it('lists every user', async () => {
    const adminCookie = await setupAdmin(app);
    await createAndLoginUser(app, 'bob', 'correct-horse-battery');

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const { users } = response.json<{ users: { username: string }[] }>();
    expect(users.map((u) => u.username).sort()).toEqual(['alice', 'bob']);
  });
});

describe('POST /api/admin/users', () => {
  it('creates a user with no password and returns a one-time set-password link that works end to end', async () => {
    const adminCookie = await setupAdmin(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { username: 'carol' },
    });
    expect(create.statusCode).toBe(201);
    const { user, setPasswordUrl } = create.json<{ user: { username: string }; setPasswordUrl: string }>();
    expect(user.username).toBe('carol');
    const token = extractSetPasswordToken(setPasswordUrl);
    expect(token).toBeTruthy();

    const setPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token, password: 'a-brand-new-password' },
    });
    expect(setPassword.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'carol', password: 'a-brand-new-password' },
    });
    expect(login.statusCode).toBe(200);

    // Single-use: the same token cannot be used again.
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token, password: 'yet-another-password' },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('rejects username collisions with 409', async () => {
    const adminCookie = await setupAdmin(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { username: 'alice' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects a username over the length cap (#317)', async () => {
    const adminCookie = await setupAdmin(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { username: 'a'.repeat(65) },
    });
    expect(response.statusCode).toBe(400);
  });

  it('is rejected with 409 while OIDC is configured', async () => {
    process.env.ASTRAYA_OIDC_ISSUER = 'http://localhost:1';
    process.env.ASTRAYA_OIDC_CLIENT_ID = 'client';
    process.env.ASTRAYA_PUBLIC_URL = 'http://localhost:8080';
    const dir2 = mkdtempSync(join(tmpdir(), 'astraya-admin-test-'));
    const oidcApp = await build({ dbPath: join(dir2, 'astraya.db') });
    try {
      const adminCookie = await setupAdmin(oidcApp);
      const response = await oidcApp.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: { [SESSION_COOKIE]: adminCookie },
        payload: { username: 'dave' },
      });
      expect(response.statusCode).toBe(409);
    } finally {
      await oidcApp.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

describe('POST /api/admin/users/:id/reset-password', () => {
  it('mints a fresh link without touching the account until the link is used', async () => {
    const adminCookie = await setupAdmin(app);
    const bobCookie = await createAndLoginUser(app, 'bob', 'original-password');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');

    const reset = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/reset-password`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(reset.statusCode).toBe(200);

    // The old password still works until the new link is actually followed.
    const stillWorks = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE]: bobCookie },
    });
    expect(stillWorks.statusCode).toBe(200);
  });
});

describe('disable / enable / change role', () => {
  it('disable immediately invalidates a live session, and enable lifts it', async () => {
    const adminCookie = await setupAdmin(app);
    const bobCookie = await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');

    const disable = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(disable.statusCode).toBe(200);

    const rejected = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: bobCookie } });
    expect(rejected.statusCode).toBe(401);

    const enable = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/enable`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(enable.statusCode).toBe(200);

    const loginAgain = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bob', password: 'correct-horse-battery' },
    });
    expect(loginAgain.statusCode).toBe(200);
  });

  it('a super admin changes roles; a plain admin cannot, and nobody changes their own', async () => {
    const aliceCookie = await setupAdmin(app);
    const bobCookie = await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const list = async (cookie: string) =>
      (await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: cookie } })).json<{
        users: { id: string; username: string; role: string }[];
      }>().users;
    const bob = (await list(aliceCookie)).find((u) => u.username === 'bob');
    const alice = (await list(aliceCookie)).find((u) => u.username === 'alice');
    if (!bob || !alice) throw new Error('fixture users not found');
    const setRole = (cookie: string, id: string, role: unknown) =>
      app.inject({
        method: 'POST',
        url: `/api/admin/users/${id}/role`,
        cookies: { [SESSION_COOKIE]: cookie },
        payload: { role },
      });

    const toAdmin = await setRole(aliceCookie, bob.id, 'admin');
    expect(toAdmin.json<{ user: { role: string; isAdmin: boolean } }>().user).toMatchObject({
      role: 'admin',
      isAdmin: true,
    });

    // Bob is now an admin, but only a super admin may change a role — not even to demote himself.
    const byAdmin = await setRole(bobCookie, bob.id, 'user');
    expect(byAdmin.statusCode).toBe(403);
    expect(byAdmin.json<{ error: string }>().error).toBe('Super admin access required');

    // Alice cannot change her own role either (the sole super admin could otherwise quietly demote herself).
    const self = await setRole(aliceCookie, alice.id, 'admin');
    expect(self.statusCode).toBe(409);
    expect(self.json<{ error: string }>().error).toBe('You cannot change your own role');

    // Made a super admin, bob can demote alice (two usable super admins remain until he does).
    await setRole(aliceCookie, bob.id, 'super_admin');
    const demoted = await setRole(bobCookie, alice.id, 'user');
    expect(demoted.json<{ user: { role: string; isAdmin: boolean } }>().user).toMatchObject({
      role: 'user',
      isAdmin: false,
    });
  });

  it('refuses a role that is not one of the three', async () => {
    const aliceCookie = await setupAdmin(app);
    await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: aliceCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');
    for (const role of ['root', '', undefined, 1]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${bob.id}/role`,
        cookies: { [SESSION_COOKIE]: aliceCookie },
        payload: { role },
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('the last-super-admin guard', () => {
  it('rejects disabling, demoting, and deleting the sole remaining super admin with 409', async () => {
    const adminCookie = await setupAdmin(app);
    const me = (
      await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: adminCookie } })
    ).json<{ user: { id: string } }>().user;

    const disable = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${me.id}/disable`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(disable.statusCode).toBe(409);

    // Her own role cannot be changed at all, which is the rule that fires first here.
    const demote = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${me.id}/role`,
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { role: 'user' },
    });
    expect(demote.statusCode).toBe(409);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${me.id}`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(deleteResponse.statusCode).toBe(409);
  });

  it('allows disabling a second super admin once more than one exists', async () => {
    const adminCookie = await setupAdmin(app);
    await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');
    await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/role`,
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { role: 'super_admin' },
    });

    const disable = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(disable.statusCode).toBe(200);
  });

  it('treats a disabled super admin as no longer counting toward "more than one" (#318)', async () => {
    // Reproduces the exact sequence the audit finding describes: disable admin
    // A while admin B still exists (allowed, since B isn't disabled), then try
    // to act on B — the *unfiltered* admin count would still see A's row and
    // wrongly think B isn't the last one, even though A is unusable.
    const adminCookie = await setupAdmin(app);
    await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');
    await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/role`,
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { role: 'super_admin' },
    });

    // Disabling bob while alice is still enabled is allowed under both the old
    // and new logic.
    const disableBob = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(disableBob.statusCode).toBe(200);

    const alice = (
      await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: adminCookie } })
    ).json<{ user: { id: string } }>().user;

    // Alice is now the only *enabled* admin — bob's disabled row must not count.
    const disableAlice = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${alice.id}/disable`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(disableAlice.statusCode).toBe(409);

    const demoteAlice = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${alice.id}/role`,
      cookies: { [SESSION_COOKIE]: adminCookie },
      payload: { role: 'user' },
    });
    expect(demoteAlice.statusCode).toBe(409);

    const deleteAlice = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${alice.id}`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(deleteAlice.statusCode).toBe(409);
  });
});

describe('POST /api/admin/users/:id/deletion-impact', () => {
  it('returns counted, distinct-entity counts that match hand-pushed ops', async () => {
    const adminCookie = await setupAdmin(app);
    const bobCookie = await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');

    const clockRef: ClockRef = { current: createClock(randomNodeId()) };
    await pushOp(app, bobCookie, clockRef, { entity: 'person', entityId: 'person-1', field: 'name', value: 'Ada' });
    await pushOp(app, bobCookie, clockRef, { entity: 'person', entityId: 'person-1', field: 'name', value: 'Ada L.' });
    await pushOp(app, bobCookie, clockRef, { entity: 'person', entityId: 'person-2', field: 'name', value: 'Bob' });
    await pushOp(app, bobCookie, clockRef, { entity: 'chart', entityId: 'chart-1', field: 'title', value: 'Natal' });

    const impact = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/deletion-impact`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(impact.statusCode).toBe(200);
    expect(impact.json()).toEqual({ kind: 'counted', people: 2, charts: 1 });
  });

  it('returns an approximate row count when no encryption key is configured', async () => {
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    const dir2 = mkdtempSync(join(tmpdir(), 'astraya-admin-test-'));
    const unconfigured = await build({ dbPath: join(dir2, 'astraya.db') });
    try {
      const adminCookie = await setupAdmin(unconfigured);
      await createAndLoginUser(unconfigured, 'bob', 'correct-horse-battery', join(dir2, 'astraya.db'));
      const bob = (
        await unconfigured.inject({
          method: 'GET',
          url: '/api/admin/users',
          cookies: { [SESSION_COOKIE]: adminCookie },
        })
      )
        .json<{ users: { id: string; username: string }[] }>()
        .users.find((u) => u.username === 'bob');
      if (!bob) throw new Error('bob not found');

      const impact = await unconfigured.inject({
        method: 'POST',
        url: `/api/admin/users/${bob.id}/deletion-impact`,
        cookies: { [SESSION_COOKIE]: adminCookie },
      });
      expect(impact.statusCode).toBe(200);
      expect(impact.json()).toEqual({ kind: 'approximate', opRows: 0 });
    } finally {
      await unconfigured.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes the user, cascading away their sessions and ops', async () => {
    const adminCookie = await setupAdmin(app);
    const bobCookie = await createAndLoginUser(app, 'bob', 'correct-horse-battery');
    const bob = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    )
      .json<{ users: { id: string; username: string }[] }>()
      .users.find((u) => u.username === 'bob');
    if (!bob) throw new Error('bob not found');

    const clockRef: ClockRef = { current: createClock(randomNodeId()) };
    await pushOp(app, bobCookie, clockRef, { entity: 'person', entityId: 'person-1', field: 'name', value: 'Ada' });
    await pushOp(app, bobCookie, clockRef, { entity: 'person', entityId: 'person-1', field: 'purged', value: true });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${bob.id}`,
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(deleteResponse.statusCode).toBe(200);

    const raw = new DatabaseSync(dbPath);
    const sessions = raw.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(bob.id) as {
      count: number;
    };
    const ops = raw.prepare('SELECT COUNT(*) AS count FROM ops WHERE user_id = ?').get(bob.id) as { count: number };
    // The purge above (#308) already left `purged_entities` holding a row for bob; the
    // user delete's cascade must take that with it too, not just sessions/ops.
    const purged = raw.prepare('SELECT COUNT(*) AS count FROM purged_entities WHERE user_id = ?').get(bob.id) as {
      count: number;
    };
    raw.close();
    expect(sessions.count).toBe(0);
    expect(ops.count).toBe(0);
    expect(purged.count).toBe(0);
  });

  it('returns 404 for an unknown user id', async () => {
    const adminCookie = await setupAdmin(app);
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/users/does-not-exist',
      cookies: { [SESSION_COOKIE]: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('every route against every role (#431)', () => {
  const PASSWORD = 'correct-horse-battery';
  interface Actors {
    readonly superCookie: string;
    readonly adminCookie: string;
    readonly userCookie: string;
    readonly targetId: string;
  }

  /** A super admin (via setup), an admin, a plain user, and a further user to act on. */
  async function actors(): Promise<Actors> {
    const superCookie = await setupAdmin(app);
    const adminCookie = await createAndLoginUser(app, 'ada', PASSWORD, dbPath, 'admin');
    const userCookie = await createAndLoginUser(app, 'uma', PASSWORD, dbPath, 'user');
    await createAndLoginUser(app, 'target', PASSWORD, dbPath, 'user');
    const users = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: superCookie } })
    ).json<{ users: { id: string; username: string }[] }>().users;
    const target = users.find((u) => u.username === 'target');
    if (!target) throw new Error('target not found');
    return { superCookie, adminCookie, userCookie, targetId: target.id };
  }

  /** Account-management routes: a super admin may, an admin and a user may not, a visitor has no session. */
  const accountRoutes = (targetId: string) =>
    [
      { name: 'create a user', method: 'POST', url: '/api/admin/users', payload: { username: 'newbie' } },
      { name: 'reset a password', method: 'POST', url: `/api/admin/users/${targetId}/reset-password` },
      { name: 'disable', method: 'POST', url: `/api/admin/users/${targetId}/disable` },
      { name: 'enable', method: 'POST', url: `/api/admin/users/${targetId}/enable` },
      { name: 'change a role', method: 'POST', url: `/api/admin/users/${targetId}/role`, payload: { role: 'admin' } },
      { name: 'preview a deletion', method: 'POST', url: `/api/admin/users/${targetId}/deletion-impact` },
      { name: 'delete', method: 'DELETE', url: `/api/admin/users/${targetId}` },
    ] as const;

  it('account management: a super admin may; an admin gets 403 "Super admin access required"; a user 403; a visitor 401', async () => {
    const { superCookie, adminCookie, userCookie, targetId } = await actors();
    for (const route of accountRoutes(targetId)) {
      const send = (cookie?: string) =>
        app.inject({
          method: route.method,
          url: route.url,
          ...('payload' in route ? { payload: route.payload } : {}),
          ...(cookie === undefined ? {} : { cookies: { [SESSION_COOKIE]: cookie } }),
        });
      expect((await send()).statusCode, `${route.name}: visitor`).toBe(401);
      const asUser = await send(userCookie);
      expect(asUser.statusCode, `${route.name}: user`).toBe(403);
      const asAdmin = await send(adminCookie);
      expect(asAdmin.statusCode, `${route.name}: admin`).toBe(403);
      expect(asAdmin.json<{ error: string }>().error, `${route.name}: admin`).toBe('Super admin access required');
    }
    // A super admin gets through every one (the order puts the destructive routes last).
    for (const route of accountRoutes(targetId)) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        ...('payload' in route ? { payload: route.payload } : {}),
        cookies: { [SESSION_COOKIE]: superCookie },
      });
      expect(response.statusCode, `${route.name}: super admin`).toBeLessThan(300);
    }
  });

  it('the user list and the other admin screens: an admin may; a user 403; a visitor 401', async () => {
    const { superCookie, adminCookie, userCookie } = await actors();
    const readOnly = [
      '/api/admin/users',
      '/api/admin/corpus-overrides',
      '/api/admin/corpus-candidates',
      '/api/admin/interpretation-usage',
    ];
    for (const url of readOnly) {
      expect((await app.inject({ method: 'GET', url })).statusCode, `${url}: visitor`).toBe(401);
      expect(
        (await app.inject({ method: 'GET', url, cookies: { [SESSION_COOKIE]: userCookie } })).statusCode,
        `${url}: user`,
      ).toBe(403);
      for (const [who, cookie] of [
        ['admin', adminCookie],
        ['super admin', superCookie],
      ] as const) {
        expect(
          (await app.inject({ method: 'GET', url, cookies: { [SESSION_COOKIE]: cookie } })).statusCode,
          `${url}: ${who}`,
        ).toBe(200);
      }
    }
  });

  it('the list says each account’s role', async () => {
    const { adminCookie } = await actors();
    const users = (
      await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [SESSION_COOKIE]: adminCookie } })
    ).json<{ users: { username: string; role: string; isAdmin: boolean }[] }>().users;
    expect(Object.fromEntries(users.map((u) => [u.username, [u.role, u.isAdmin]]))).toEqual({
      alice: ['super_admin', true],
      ada: ['admin', true],
      uma: ['user', false],
      target: ['user', false],
    });
  });

  it('creating a user takes a role: user by default, admin or super admin on request, anything else refused', async () => {
    const { superCookie } = await actors();
    const create = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: { [SESSION_COOKIE]: superCookie },
        payload,
      });
    expect((await create({ username: 'u1' })).json<{ user: { role: string } }>().user.role).toBe('user');
    expect((await create({ username: 'u2', role: 'admin' })).json<{ user: { role: string } }>().user.role).toBe(
      'admin',
    );
    expect((await create({ username: 'u3', role: 'super_admin' })).json<{ user: { role: string } }>().user.role).toBe(
      'super_admin',
    );
    expect((await create({ username: 'u4', role: 'root' })).statusCode).toBe(400);
  });

  it('the session endpoint tells a client its role', async () => {
    const { superCookie, adminCookie, userCookie } = await actors();
    const me = async (cookie: string) =>
      (await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: cookie } })).json<{
        user: { role: string; isAdmin: boolean; isSuperAdmin: boolean };
      }>().user;
    expect(await me(superCookie)).toMatchObject({ role: 'super_admin', isAdmin: true, isSuperAdmin: true });
    expect(await me(adminCookie)).toMatchObject({ role: 'admin', isAdmin: true, isSuperAdmin: false });
    expect(await me(userCookie)).toMatchObject({ role: 'user', isAdmin: false, isSuperAdmin: false });
  });
});
