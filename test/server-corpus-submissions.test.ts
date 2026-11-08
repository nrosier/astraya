/**
 * User-submitted corrections (`server/corpus-submissions.ts` + `server/corpus-submissions-routes.ts`, #1338 slice 2),
 * exercised through Fastify's `app.inject()` against a temp SQLite file with the real migrations. Same setup helpers
 * as `test/server-corpus-candidates.test.ts`.
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
import { DAILY_CAP, PENDING_CAP } from '../server/corpus-submissions.ts';
import { SUBMISSION_LICENCE_VERSION } from '../src/interpretation/submission-licence.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const ENCRYPTION_KEY = randomBytes(32).toString('base64');
const KEY = 'dignity-state:sun:ruler';
const GOOD_TEXT = 'A steady, deliberate approach that grows more confident with practice over time.';

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-corpus-submissions-test-'));
  dbPath = join(dir, 'astraya.db');
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = ENCRYPTION_KEY;
  app = await build({ dbPath });
});

afterEach(async () => {
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  rmSync(dir, { recursive: true, force: true });
});

async function setupAdmin(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username: 'alice', password: 'correct-horse-battery' },
  });
  const sessionId = response.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error('setup did not set a session cookie');
  return sessionId;
}

async function createUser(username: string): Promise<{ cookie: string; id: string }> {
  const id = randomUUID();
  const raw = new DatabaseSync(dbPath);
  raw
    .prepare("INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)")
    .run(id, username, await hashPassword('correct-horse-battery'), new Date().toISOString());
  raw.close();
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'correct-horse-battery' },
  });
  const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (!cookie) throw new Error('login did not set a session cookie');
  return { cookie, id };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locale: 'en',
    key: KEY,
    text: GOOD_TEXT,
    licenceAccepted: true,
    licenceVersion: SUBMISSION_LICENCE_VERSION,
    ...overrides,
  };
}

function submit(cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/corpus-submissions', cookies: { [SESSION_COOKIE]: cookie }, payload });
}

function rows(): { status: string; submitted_by: string; licence_version: string; accepted_at: string }[] {
  const raw = new DatabaseSync(dbPath);
  const found = raw.prepare('SELECT * FROM corpus_submissions ORDER BY created_at').all() as unknown as {
    status: string;
    submitted_by: string;
    licence_version: string;
    accepted_at: string;
  }[];
  raw.close();
  return found;
}

function insertRaw(userId: string, status: string, count: number, createdAt: string): void {
  const raw = new DatabaseSync(dbPath);
  const stmt = raw.prepare(
    `INSERT INTO corpus_submissions (id, key, locale, text, submitted_by, status, licence_accepted, licence_version, accepted_at, created_at)
     VALUES (?, ?, 'en', ?, ?, ?, 1, ?, ?, ?)`,
  );
  for (let i = 0; i < count; i++) {
    stmt.run(randomUUID(), KEY, GOOD_TEXT, userId, status, SUBMISSION_LICENCE_VERSION, createdAt, createdAt);
  }
  raw.close();
}

describe('POST /api/corpus-submissions', () => {
  it('stores a pending row with the submitter id and the licence acceptance', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    const response = await submit(user.cookie, body());
    expect(response.statusCode).toBe(201);
    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe('pending');
    expect(stored[0]?.submitted_by).toBe(user.id);
    expect(stored[0]?.licence_version).toBe(SUBMISSION_LICENCE_VERSION);
    expect(Number.isNaN(Date.parse(stored[0]?.accepted_at ?? ''))).toBe(false);
    // The response does not hand the submitter id back either.
    expect(JSON.stringify(response.json())).not.toContain(user.id);
  });

  it('requires a signed-in user', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/corpus-submissions', payload: body() });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a submission without the licence acceptance', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    for (const overrides of [{ licenceAccepted: false }, { licenceAccepted: undefined }, { licenceAccepted: 'yes' }]) {
      const response = await submit(user.cookie, body(overrides));
      expect(response.statusCode).toBe(400);
      expect(response.json<{ code: string }>().code).toBe('licence-not-accepted');
    }
    expect((await submit(user.cookie, body({ licenceVersion: 'old' }))).statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('refuses an unknown key, an unknown locale and a non-canonical key', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    expect((await submit(user.cookie, body({ key: 'planet-in-sign:nope:99' }))).statusCode).toBe(400);
    expect((await submit(user.cookie, body({ key: 'not a key' }))).statusCode).toBe(400);
    expect((await submit(user.cookie, body({ locale: 'fr' }))).statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('refuses over-length, too-short, HTML and link text', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    for (const text of [
      `${GOOD_TEXT} ${'x'.repeat(1700)}`,
      'Too short.',
      `${GOOD_TEXT} <b>bold</b>`,
      `${GOOD_TEXT} <script>alert(1)</script>`,
      `${GOOD_TEXT} See https://example.com for more.`,
    ]) {
      expect((await submit(user.cookie, body({ text }))).statusCode).toBe(400);
    }
    expect(rows()).toHaveLength(0);
  });

  it('refuses any field beyond locale, key, text and the acceptance', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    for (const extra of [
      { personId: 'p1' },
      { name: 'Ada' },
      { birth: '1990-01-01' },
      { notes: 'x' },
      { userId: 'u' },
    ]) {
      const response = await submit(user.cookie, body(extra));
      expect(response.statusCode).toBe(400);
      expect(response.json<{ code: string }>().code).toBe('unknown-field');
    }
    expect(rows()).toHaveLength(0);
  });

  it('refuses the 6th pending submission (pending cap)', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    for (let i = 0; i < PENDING_CAP; i++) expect((await submit(user.cookie, body())).statusCode).toBe(201);
    const sixth = await submit(user.cookie, body());
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json<{ code: string }>().code).toBe('pending-limit');
    expect(rows()).toHaveLength(PENDING_CAP);
    // The cap is per user.
    const other = await createUser('carol');
    expect((await submit(other.cookie, body())).statusCode).toBe(201);
  });

  it('refuses the 21st new submission in a day (daily cap), even when earlier ones were decided', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    insertRaw(user.id, 'rejected', DAILY_CAP, new Date().toISOString());
    const response = await submit(user.cookie, body());
    expect(response.statusCode).toBe(429);
    expect(response.json<{ code: string }>().code).toBe('daily-limit');
    expect(rows()).toHaveLength(DAILY_CAP);
  });

  it('does not count submissions older than a day against the daily cap', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    insertRaw(user.id, 'rejected', DAILY_CAP, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());
    expect((await submit(user.cookie, body())).statusCode).toBe(201);
  });
});

describe('GET /api/corpus-submissions', () => {
  it('requires an admin', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    expect((await app.inject({ method: 'GET', url: '/api/corpus-submissions' })).statusCode).toBe(401);
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/corpus-submissions',
      cookies: { [SESSION_COOKIE]: user.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('lists submissions with status and submitter for an admin', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    await submit(user.cookie, body());
    const response = await app.inject({
      method: 'GET',
      url: '/api/corpus-submissions',
      cookies: { [SESSION_COOKIE]: admin },
    });
    expect(response.statusCode).toBe(200);
    const { submissions } = response.json<{
      submissions: { key: string; status: string; submitterId: string; submitterUsername: string; text: string }[];
    }>();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      key: KEY,
      status: 'pending',
      submitterId: user.id,
      submitterUsername: 'bob',
      text: GOOD_TEXT,
    });
  });
});

describe('what a submission does not touch', () => {
  it('does not appear on the public corpus route and does not change the corpus', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    const before = await app.inject({ method: 'GET', url: '/api/corpus-overrides/en' });
    await submit(user.cookie, body({ text: `${GOOD_TEXT} Marker sentence for the test.` }));
    const after = await app.inject({ method: 'GET', url: '/api/corpus-overrides/en' });
    expect(after.statusCode).toBe(200);
    expect(after.body).toBe(before.body);
    expect(after.body).not.toContain('Marker sentence');
    expect(after.body).not.toContain(user.id);

    const raw = new DatabaseSync(dbPath);
    const overrides = raw.prepare('SELECT COUNT(*) AS n FROM corpus_overrides').get() as unknown as { n: number };
    const candidates = raw.prepare('SELECT COUNT(*) AS n FROM corpus_candidates').get() as unknown as { n: number };
    raw.close();
    expect(overrides.n).toBe(0);
    expect(candidates.n).toBe(0);
  });

  it('has no public submissions route and no delete route', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    await submit(user.cookie, body());
    const id = (rows()[0] as unknown as { id: string }).id;
    const cookies = { [SESSION_COOKIE]: admin };
    for (const [method, url] of [
      ['GET', '/api/corpus-submissions/en'],
      ['DELETE', `/api/corpus-submissions/${id}`],
      ['PATCH', '/api/corpus-submissions'],
      ['DELETE', '/api/corpus-submissions'],
    ] as const) {
      const response = await app.inject({ method, url, cookies, payload: {} });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(rows()).toHaveLength(1);
  });

  it('keeps a decided row (history, D4): the table is not emptied by anything the server does', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    insertRaw(user.id, 'rejected', 1, new Date().toISOString());
    await submit(user.cookie, body());
    await app.inject({ method: 'GET', url: '/api/corpus-submissions', cookies: { [SESSION_COOKIE]: admin } });
    expect(
      rows()
        .map((row) => row.status)
        .sort(),
    ).toEqual(['pending', 'rejected']);
  });
});

describe('approve and reject (#1338 slice 3)', () => {
  const adminCookie = (cookie: string) => ({ [SESSION_COOKIE]: cookie });

  async function pendingId(userCookie: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await submit(userCookie, body(overrides));
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>().id;
  }

  function decide(cookie: string, id: string, action: 'approve' | 'reject') {
    return app.inject({ method: 'POST', url: `/api/corpus-submissions/${id}/${action}`, cookies: adminCookie(cookie) });
  }

  function overrideRows(): { key: string; locale: string; text: string }[] {
    const raw = new DatabaseSync(dbPath);
    const found = raw.prepare('SELECT key, locale, text FROM corpus_overrides').all() as unknown as {
      key: string;
      locale: string;
      text: string;
    }[];
    raw.close();
    return found;
  }

  it('approve makes the text the effective server-wide override for the key, at once', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    const id = await pendingId(user.cookie);
    const response = await decide(admin, id, 'approve');
    expect(response.statusCode).toBe(200);
    const publicRoute = await app.inject({ method: 'GET', url: '/api/corpus-overrides/en' });
    const { entries } = publicRoute.json<{ entries: { key: string; text: string }[] }>();
    expect(entries.find((entry) => entry.key === KEY)?.text).toBe(GOOD_TEXT);
    expect(overrideRows()).toHaveLength(1);
  });

  it('approve is refused when the lint gate fails, and nothing changes', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    const id = await pendingId(user.cookie);
    // A stored row that would not pass today (the gate may have tightened since it was submitted).
    const raw = new DatabaseSync(dbPath);
    raw.prepare('UPDATE corpus_submissions SET text = ? WHERE id = ?').run('Too short.', id);
    raw.close();
    const response = await decide(admin, id, 'approve');
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('invalid-text');
    expect(overrideRows()).toHaveLength(0);
    expect(rows()[0]?.status).toBe('pending');
  });

  it('reject leaves corpus_overrides untouched', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    const id = await pendingId(user.cookie);
    const response = await decide(admin, id, 'reject');
    expect(response.statusCode).toBe(200);
    expect(overrideRows()).toHaveLength(0);
    expect(rows()[0]?.status).toBe('rejected');
  });

  it('keeps a decided row with its status, decider and time (D4)', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    const approvedId = await pendingId(user.cookie);
    const rejectedId = await pendingId(user.cookie, { key: 'dignity-state:moon:ruler' });
    await decide(admin, approvedId, 'approve');
    await decide(admin, rejectedId, 'reject');
    const raw = new DatabaseSync(dbPath);
    const found = raw
      .prepare('SELECT id, status, decided_by, decided_at FROM corpus_submissions ORDER BY status')
      .all() as unknown as { id: string; status: string; decided_by: string | null; decided_at: string | null }[];
    const adminId = (raw.prepare("SELECT id FROM users WHERE username = 'alice'").get() as unknown as { id: string })
      .id;
    raw.close();
    expect(found.map((row) => row.status)).toEqual(['approved', 'rejected']);
    for (const row of found) {
      expect(row.decided_by).toBe(adminId);
      expect(Number.isNaN(Date.parse(row.decided_at ?? ''))).toBe(false);
    }
    const listed = await app.inject({ method: 'GET', url: '/api/corpus-submissions', cookies: adminCookie(admin) });
    const { submissions } = listed.json<{ submissions: { status: string; decidedByUsername: string }[] }>();
    expect(submissions.map((row) => row.decidedByUsername)).toEqual(['alice', 'alice']);
  });

  it('refuses to decide an already-decided row, with a stable code, and changes nothing', async () => {
    const admin = await setupAdmin();
    const user = await createUser('bob');
    const id = await pendingId(user.cookie);
    await decide(admin, id, 'reject');
    for (const action of ['approve', 'reject'] as const) {
      const response = await decide(admin, id, action);
      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe('already-decided');
    }
    expect(rows()[0]?.status).toBe('rejected');
    expect(overrideRows()).toHaveLength(0);
    expect((await decide(admin, randomUUID(), 'approve')).json<{ code: string }>().code).toBe('not-found');
  });

  it('does not let a non-admin or an anonymous caller approve or reject', async () => {
    await setupAdmin();
    const user = await createUser('bob');
    const id = await pendingId(user.cookie);
    for (const action of ['approve', 'reject'] as const) {
      expect((await decide(user.cookie, id, action)).statusCode).toBe(403);
      const anonymous = await app.inject({ method: 'POST', url: `/api/corpus-submissions/${id}/${action}` });
      expect(anonymous.statusCode).toBe(401);
    }
    expect(rows()[0]?.status).toBe('pending');
    expect(overrideRows()).toHaveLength(0);
  });
});
