/**
 * The operation-relay endpoints (`server/ops/routes.ts`), exercised through
 * Fastify's `app.inject()` against a temp SQLite file — same shape as
 * `test/server-auth.test.ts`. A couple of tests open a second, independent
 * connection to the same file to simulate a row written or corrupted
 * out-of-band (a duplicate retry race, a tampered payload).
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
import { createClock, encodeHlc, randomNodeId, tick } from '../src/store/hlc.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const ENCRYPTION_KEY = randomBytes(32).toString('base64');

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-ops-test-'));
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

/** Creates the first admin (via bootstrap) and returns its session cookie value. */
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

/** Inserts a second, non-admin user directly (only the first admin can go through /api/setup) and logs in. */
async function createAndLoginUser(target: FastifyInstance, username: string, password: string): Promise<string> {
  const passwordHash = await hashPassword(password);
  const raw = new DatabaseSync(dbPath);
  raw
    .prepare("INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)")
    .run(randomUUID(), username, passwordHash, new Date().toISOString());
  raw.close();

  const login = await target.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  const sessionId = login.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error('login did not set a session cookie');
  return sessionId;
}

/** A fresh, validly-shaped op, ahead of "now" by `aheadByMs` (default: not ahead at all). */
function makeOp(aheadByMs = 0, overrides: Partial<{ deviceId: string; opVersion: number; payload: string }> = {}) {
  const clock = createClock(randomNodeId());
  const hlc = encodeHlc(tick(clock, Date.now() + aheadByMs).clock);
  return {
    hlc,
    deviceId: overrides.deviceId ?? 'device-1',
    opVersion: overrides.opVersion ?? 1,
    payload: overrides.payload ?? Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64'),
  };
}

/** A field-write op, for tests that need the server to actually parse the op body (#308). */
function makeFieldOp(entity: string, entityId: string, field: string, value: unknown, aheadByMs = 0) {
  return makeOp(aheadByMs, {
    payload: Buffer.from(JSON.stringify({ entity, entityId, field, value })).toString('base64'),
  });
}

/** Names the account a sync request is for (#1378); mirrors `ACCOUNT_HEADER` in `src/sync/engine.ts`. */
const ACCOUNT_HEADER = 'x-astraya-account';

/** The account a session belongs to, the way a client learns it: from `/api/auth/me`. */
async function accountOf(target: FastifyInstance, sessionId: string): Promise<string> {
  const response = await target.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { [SESSION_COOKIE]: sessionId },
  });
  if (response.statusCode !== 200) return 'no-account';
  return response.json<{ user: { id: string } }>().user.id;
}

/** `account` defaults to the session's own; pass another id, or `null` for no header at all (#1378). */
async function appendOps(target: FastifyInstance, sessionId: string, ops: unknown, account?: string | null) {
  const expected = account === undefined ? await accountOf(target, sessionId) : account;
  return target.inject({
    method: 'POST',
    url: '/api/ops',
    cookies: { [SESSION_COOKIE]: sessionId },
    headers: expected === null ? {} : { [ACCOUNT_HEADER]: expected },
    payload: { ops },
  });
}

async function pullOps(target: FastifyInstance, sessionId: string, since?: number, account?: string | null) {
  const expected = account === undefined ? await accountOf(target, sessionId) : account;
  return target.inject({
    method: 'GET',
    url: since === undefined ? '/api/ops' : `/api/ops?since=${since}`,
    cookies: { [SESSION_COOKIE]: sessionId },
    headers: expected === null ? {} : { [ACCOUNT_HEADER]: expected },
  });
}

describe('POST /api/ops and GET /api/ops', () => {
  it('round-trips an op: append assigns a seq, pull decrypts it back unchanged', async () => {
    const sessionId = await setupAdmin(app);
    const op = makeOp();

    const append = await appendOps(app, sessionId, [op]);
    expect(append.statusCode).toBe(200);
    const { seqs } = append.json<{ seqs: number[] }>();
    expect(seqs).toHaveLength(1);
    expect(seqs[0]).toBeGreaterThan(0);

    const pull = await pullOps(app, sessionId);
    expect(pull.statusCode).toBe(200);
    const { ops } = pull.json<{
      ops: { seq: number; hlc: string; deviceId: string; opVersion: number; payload: string }[];
    }>();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ seq: seqs[0], hlc: op.hlc, deviceId: op.deviceId, opVersion: op.opVersion });
    expect(ops[0]?.payload).toBe(op.payload);
  });

  it("scopes ops to the authenticated user: one user cannot see or affect another user's ops (#80)", async () => {
    const aliceSession = await setupAdmin(app, 'alice', 'correct-horse-battery');
    const bobSession = await createAndLoginUser(app, 'bob', 'another-horse-battery');

    const aliceAppend = await appendOps(app, aliceSession, [makeOp()]);
    const aliceSeq = aliceAppend.json<{ seqs: number[] }>().seqs[0];

    const bobPull = await pullOps(app, bobSession);
    expect(bobPull.json<{ ops: unknown[] }>().ops).toHaveLength(0);

    // Bob pulling "since" a seq lower than Alice's still sees nothing of hers.
    const bobPullSince = await pullOps(app, bobSession, (aliceSeq ?? 1) - 1);
    expect(bobPullSince.json<{ ops: unknown[] }>().ops).toHaveLength(0);

    const bobAppend = await appendOps(app, bobSession, [makeOp()]);
    const bobSeq = bobAppend.json<{ seqs: number[] }>().seqs[0];
    expect(bobSeq).not.toBe(aliceSeq);

    const alicePull = await pullOps(app, aliceSession);
    expect(alicePull.json<{ ops: unknown[] }>().ops).toHaveLength(1);
  });

  it('refuses a request bound to another account than the cookie’s, and writes nothing to either (#1378)', async () => {
    const aliceSession = await setupAdmin(app, 'alice', 'correct-horse-battery');
    const bobSession = await createAndLoginUser(app, 'bob', 'another-horse-battery');
    const aliceId = await accountOf(app, aliceSession);

    // Alice's client, still running after this browser signed in as Bob: Bob's cookie, Alice's account.
    const append = await appendOps(app, bobSession, [makeOp()], aliceId);
    expect(append.statusCode).toBe(403);
    expect(append.json<{ code: string }>().code).toBe('account-mismatch');
    const pull = await pullOps(app, bobSession, undefined, aliceId);
    expect(pull.statusCode).toBe(403);
    expect(pull.json<{ code: string }>().code).toBe('account-mismatch');

    expect((await pullOps(app, bobSession)).json<{ ops: unknown[] }>().ops).toHaveLength(0);
    expect((await pullOps(app, aliceSession)).json<{ ops: unknown[] }>().ops).toHaveLength(0);
    const raw = new DatabaseSync(dbPath, { readOnly: true });
    const { count } = raw.prepare('SELECT COUNT(*) AS count FROM ops').get() as { count: number };
    raw.close();
    expect(count).toBe(0);
  });

  it('refuses a request that names no account, and writes nothing (#1378)', async () => {
    const sessionId = await setupAdmin(app);
    const append = await appendOps(app, sessionId, [makeOp()], null);
    expect(append.statusCode).toBe(400);
    expect(append.json<{ code: string }>().code).toBe('account-required');
    const pull = await pullOps(app, sessionId, undefined, null);
    expect(pull.statusCode).toBe(400);
    expect(pull.json<{ code: string }>().code).toBe('account-required');
    expect((await pullOps(app, sessionId)).json<{ ops: unknown[] }>().ops).toHaveLength(0);
  });

  it('is idempotent on a retried (user, hlc) pair: same seq, no duplicate row', async () => {
    const sessionId = await setupAdmin(app);
    const op = makeOp();

    const first = await appendOps(app, sessionId, [op]);
    const second = await appendOps(app, sessionId, [op]);
    expect(first.json<{ seqs: number[] }>().seqs).toEqual(second.json<{ seqs: number[] }>().seqs);

    const pull = await pullOps(app, sessionId);
    expect(pull.json<{ ops: unknown[] }>().ops).toHaveLength(1);
  });

  it('accepts an op whose clock is ahead but within the skew-tolerance band', async () => {
    const sessionId = await setupAdmin(app);
    const op = makeOp(2 * 60 * 60 * 1000); // 2h ahead: over the 5-minute warn line, under the 24h reject line.
    const response = await appendOps(app, sessionId, [op]);
    expect(response.statusCode).toBe(200);
  });

  it('quarantines an op more than 24h ahead of server time instead of rejecting the whole batch (#105, #312)', async () => {
    const sessionId = await setupAdmin(app);
    const good = makeOp();
    const skewed = makeOp(25 * 60 * 60 * 1000);
    const response = await appendOps(app, sessionId, [good, skewed]);
    expect(response.statusCode).toBe(200);
    const { seqs, skipped } = response.json<{ seqs: number[]; skipped: string[] }>();
    expect(seqs).toHaveLength(1);
    expect(skipped).toEqual([skewed.hlc]);

    const pull = await pullOps(app, sessionId);
    const { ops } = pull.json<{ ops: { hlc: string }[] }>();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.hlc).toBe(good.hlc);
  });

  it('quarantines every op in an all-skewed batch, still with a 200', async () => {
    const sessionId = await setupAdmin(app);
    const skewed = makeOp(25 * 60 * 60 * 1000);
    const response = await appendOps(app, sessionId, [skewed]);
    expect(response.statusCode).toBe(200);
    const { seqs, skipped } = response.json<{ seqs: number[]; skipped: string[] }>();
    expect(seqs).toEqual([]);
    expect(skipped).toEqual([skewed.hlc]);

    const pull = await pullOps(app, sessionId);
    expect(pull.json<{ ops: unknown[] }>().ops).toHaveLength(0);
  });

  it('rejects a malformed op with 400', async () => {
    const sessionId = await setupAdmin(app);
    const response = await appendOps(app, sessionId, [
      { hlc: 'not-a-real-hlc', deviceId: 'd1', opVersion: 1, payload: 'x' },
    ]);
    expect(response.statusCode).toBe(400);
  });

  it('rejects a payload that is not valid base64 with 400 rather than failing mid-batch (#320)', async () => {
    const sessionId = await setupAdmin(app);
    const good = makeOp();
    const bad = makeOp(0, { payload: 'not-valid-base64!!!' });
    const response = await appendOps(app, sessionId, [good, bad]);
    expect(response.statusCode).toBe(400);

    // Rejected up front, alongside the type/shape validation — nothing from
    // this batch (including the otherwise-valid op) was stored.
    const pull = await pullOps(app, sessionId);
    expect(pull.json<{ ops: unknown[] }>().ops).toHaveLength(0);
  });

  it('rejects a batch that would push a user over its op-log quota (#322)', async () => {
    const sessionId = await setupAdmin(app);
    // Directly seed the ops table to just under the quota, rather than actually
    // inserting 200,000 rows through the HTTP layer in a test.
    const raw = new DatabaseSync(dbPath);
    const me = raw.prepare('SELECT id FROM users WHERE username = ?').get('alice') as { id: string };
    const insert = raw.prepare(
      'INSERT INTO ops (user_id, hlc, device_id, op_version, payload, key_version, iv, received_at) VALUES (?, ?, ?, 1, ?, 1, ?, ?)',
    );
    const now = new Date().toISOString();
    raw.exec('BEGIN');
    for (let i = 0; i < 200_000; i++) {
      insert.run(me.id, `seed-${String(i)}`, 'seed-device', Buffer.from('x'), Buffer.from('y'), now);
    }
    raw.exec('COMMIT');
    raw.close();

    const response = await appendOps(app, sessionId, [makeOp()]);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toMatch(/quota/i);
  });

  it('a tampered stored payload fails decryption loudly rather than returning wrong or empty data', async () => {
    const sessionId = await setupAdmin(app);
    const append = await appendOps(app, sessionId, [makeOp()]);
    const seq = append.json<{ seqs: number[] }>().seqs[0];
    if (seq === undefined) throw new Error('append did not return a seq');

    const raw = new DatabaseSync(dbPath);
    raw.prepare('UPDATE ops SET payload = ? WHERE seq = ?').run(Buffer.from('this is not a valid gcm ciphertext'), seq);
    raw.close();

    const pull = await pullOps(app, sessionId);
    expect(pull.statusCode).toBe(500);
  });

  it('returns 401 for both routes with no session cookie', async () => {
    const append = await app.inject({ method: 'POST', url: '/api/ops', payload: { ops: [makeOp()] } });
    const pull = await app.inject({ method: 'GET', url: '/api/ops' });
    expect(append.statusCode).toBe(401);
    expect(pull.statusCode).toBe(401);
  });

  it('returns 503 for both routes when no encryption key is configured', async () => {
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    const disabledDir = mkdtempSync(join(tmpdir(), 'astraya-ops-disabled-test-'));
    const disabledApp = await build({ dbPath: join(disabledDir, 'astraya.db') });
    try {
      const sessionId = await setupAdmin(disabledApp);
      const append = await appendOps(disabledApp, sessionId, [makeOp()]);
      const pull = await pullOps(disabledApp, sessionId);
      expect(append.statusCode).toBe(503);
      expect(pull.statusCode).toBe(503);
    } finally {
      await disabledApp.close();
      rmSync(disabledDir, { recursive: true, force: true });
    }
  });

  it('throws at startup on a malformed encryption key instead of silently disabling the relay', async () => {
    process.env.ASTRAYA_ENCRYPTION_KEY = 'not-the-right-length';
    const badKeyDir = mkdtempSync(join(tmpdir(), 'astraya-ops-badkey-test-'));
    try {
      await expect(build({ dbPath: join(badKeyDir, 'astraya.db') })).rejects.toThrow();
    } finally {
      rmSync(badKeyDir, { recursive: true, force: true });
    }
  });

  it('refuses a blank or non-numeric `since` rather than reading it as "from the beginning" (#336)', async () => {
    const sessionId = await setupAdmin(app);
    await appendOps(app, sessionId, [makeOp()]);

    // `Number('')` and `Number(' ')` are both 0, and 0 is the one value that means "send
    // the whole log again" — the expensive answer to give a client that meant to send a
    // cursor and built a blank query string instead.
    for (const value of ['', '%20', 'abc', '-1', '1.5', '1e3', '0x1']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/ops?since=${value}`,
        cookies: { [SESSION_COOKIE]: sessionId },
        headers: { [ACCOUNT_HEADER]: await accountOf(app, sessionId) },
      });
      expect(response.statusCode, `?since=${value}`).toBe(400);
    }

    // An absent `since` still means "from the beginning" — that is a first sync, not a
    // mistake, and is the one case where the default is what the client meant.
    expect((await pullOps(app, sessionId)).json<{ ops: unknown[] }>().ops).toHaveLength(1);
    expect((await pullOps(app, sessionId, 0)).json<{ ops: unknown[] }>().ops).toHaveLength(1);
  });
});

describe('purge propagation and server-side erasure (#308)', () => {
  it('erases an entity’s already-stored rows the moment its purge marker lands, keeping only the marker', async () => {
    const sessionId = await setupAdmin(app);
    const create = makeFieldOp('person', 'p-1', 'displayName', 'Ada');
    const other = makeFieldOp('person', 'p-1', 'civil', { year: 1960, month: 6, day: 15 }, 1);
    await appendOps(app, sessionId, [create, other]);

    const marker = makeFieldOp('person', 'p-1', 'purged', true, 2);
    const response = await appendOps(app, sessionId, [marker]);
    expect(response.statusCode).toBe(200);

    const pull = await pullOps(app, sessionId);
    const { ops } = pull.json<{ ops: { hlc: string }[] }>();
    expect(ops.map((op) => op.hlc)).toEqual([marker.hlc]);
  });

  it('erases birth and consultation note rows on a person purge, keeping only the marker (#919)', async () => {
    const sessionId = await setupAdmin(app);
    const birthRevision = makeFieldOp('birthNote', 'p-1', 'rev/r-birth', { text: 'Birth text', parents: [] });
    const consultationRevision = makeFieldOp(
      'consultationNote',
      'p-1',
      'rev/n-1/r-1',
      { text: 'Consult text', parents: [] },
      1,
    );
    await appendOps(app, sessionId, [birthRevision, consultationRevision]);

    const marker = makeFieldOp('birthNote', 'p-1', 'purged', true, 2);
    const consultationMarker = makeFieldOp('consultationNote', 'p-1', 'purged', true, 3);
    const response = await appendOps(app, sessionId, [marker, consultationMarker]);
    expect(response.statusCode).toBe(200);

    const pull = await pullOps(app, sessionId);
    const { ops } = pull.json<{ ops: { hlc: string }[] }>();
    expect(ops.map((op) => op.hlc)).toEqual([marker.hlc, consultationMarker.hlc]);
  });

  it('quarantines a later push naming an already-purged entity, rather than storing it', async () => {
    const sessionId = await setupAdmin(app);
    const marker = makeFieldOp('person', 'p-1', 'purged', true);
    await appendOps(app, sessionId, [marker]);

    const stale = makeFieldOp('person', 'p-1', 'displayName', 'Resurrected', 1);
    const response = await appendOps(app, sessionId, [stale]);
    expect(response.statusCode).toBe(200);
    const { seqs, skipped } = response.json<{ seqs: number[]; skipped: string[] }>();
    expect(seqs).toEqual([]);
    expect(skipped).toEqual([stale.hlc]);

    const pull = await pullOps(app, sessionId);
    const { ops } = pull.json<{ ops: { hlc: string }[] }>();
    expect(ops.map((op) => op.hlc)).toEqual([marker.hlc]);
  });

  it('erases and quarantines within the same batch, in order, when the marker arrives before a stale edit', async () => {
    const sessionId = await setupAdmin(app);
    const create = makeFieldOp('person', 'p-1', 'displayName', 'Ada');
    await appendOps(app, sessionId, [create]);

    const marker = makeFieldOp('person', 'p-1', 'purged', true, 1);
    const stale = makeFieldOp('person', 'p-1', 'displayName', 'Resurrected', 2);
    const response = await appendOps(app, sessionId, [marker, stale]);
    const { seqs, skipped } = response.json<{ seqs: number[]; skipped: string[] }>();
    expect(seqs).toHaveLength(1);
    expect(skipped).toEqual([stale.hlc]);

    const pull = await pullOps(app, sessionId);
    const { ops } = pull.json<{ ops: { hlc: string }[] }>();
    expect(ops.map((op) => op.hlc)).toEqual([marker.hlc]);
  });

  it('scopes the deny-list and the erasure per-user: another user’s same-shaped entityId is unaffected', async () => {
    const aliceSession = await setupAdmin(app, 'alice', 'correct-horse-battery');
    const bobSession = await createAndLoginUser(app, 'bob', 'another-horse-battery');

    const bobCreate = makeFieldOp('person', 'p-1', 'displayName', 'Grace');
    await appendOps(app, bobSession, [bobCreate]);

    const aliceMarker = makeFieldOp('person', 'p-1', 'purged', true);
    await appendOps(app, aliceSession, [aliceMarker]);

    const bobPull = await pullOps(app, bobSession);
    const { ops } = bobPull.json<{ ops: { hlc: string }[] }>();
    expect(ops.map((op) => op.hlc)).toEqual([bobCreate.hlc]);

    // Bob's own edit to the same-shaped id, after Alice's purge, is still his to make —
    // the deny-list is per-user, not a global name collision.
    const bobEdit = makeFieldOp('person', 'p-1', 'displayName', 'Grace Hopper', 1);
    const response = await appendOps(app, bobSession, [bobEdit]);
    const { seqs, skipped } = response.json<{ seqs: number[]; skipped: string[] }>();
    expect(seqs).toHaveLength(1);
    expect(skipped).toEqual([]);
  });
});

describe('the account preferences entity on the relay (#1066, ADR 0004 test 4)', () => {
  const pulledHlcs = async (sessionId: string): Promise<string[]> =>
    (await pullOps(app, sessionId)).json<{ ops: { hlc: string }[] }>().ops.map((op) => op.hlc);

  it('stores and returns account ops like any other, with no server change', async () => {
    const sessionId = await setupAdmin(app);
    const locale = makeFieldOp('account', 'preferences', 'locale', 'nl');
    const response = await appendOps(app, sessionId, [locale]);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ skipped: string[] }>().skipped).toEqual([]);
    const pulled = (await pullOps(app, sessionId)).json<{ ops: { hlc: string; payload: string }[] }>().ops;
    expect(pulled.map((op) => op.hlc)).toEqual([locale.hlc]);
    expect(pulled[0]?.payload).toBe(locale.payload);
  });

  it('never shows one user the other’s preferences, though both use the same entity id', async () => {
    const aliceSession = await setupAdmin(app, 'alice', 'correct-horse-battery');
    const bobSession = await createAndLoginUser(app, 'bob', 'another-horse-battery');
    const alice = makeFieldOp('account', 'preferences', 'locale', 'nl');
    const bob = makeFieldOp('account', 'preferences', 'locale', 'en', 1);
    await appendOps(app, aliceSession, [alice]);
    await appendOps(app, bobSession, [bob]);
    expect(await pulledHlcs(aliceSession)).toEqual([alice.hlc]);
    expect(await pulledHlcs(bobSession)).toEqual([bob.hlc]);
  });

  it('keeps a user’s account rows when one of their people is purged', async () => {
    const sessionId = await setupAdmin(app);
    const prefs = makeFieldOp('account', 'preferences', 'locale', 'nl');
    const person = makeFieldOp('person', 'p-1', 'displayName', 'Ada', 1);
    await appendOps(app, sessionId, [prefs, person]);
    const marker = makeFieldOp('person', 'p-1', 'purged', true, 2);
    await appendOps(app, sessionId, [marker]);
    expect(await pulledHlcs(sessionId)).toEqual([prefs.hlc, marker.hlc]);
  });

  it('confines a deny-listed account entity to its own user, and recovers as the runbook says', async () => {
    const aliceSession = await setupAdmin(app, 'alice', 'correct-horse-battery');
    const bobSession = await createAndLoginUser(app, 'bob', 'another-horse-battery');
    // A modified client sends an account purge marker for Alice (the app itself refuses to write one).
    await appendOps(app, aliceSession, [makeFieldOp('account', 'preferences', 'purged', true)]);

    const refused = makeFieldOp('account', 'preferences', 'locale', 'nl', 1);
    expect((await appendOps(app, aliceSession, [refused])).json<{ skipped: string[] }>().skipped).toEqual([
      refused.hlc,
    ]);
    const bobWrite = makeFieldOp('account', 'preferences', 'locale', 'en', 2);
    expect((await appendOps(app, bobSession, [bobWrite])).json<{ skipped: string[] }>().skipped).toEqual([]);

    // docs/ops/ACCOUNT-PREFERENCES-RECOVERY.md: delete the deny-list row, then a new write is stored again.
    const raw = new DatabaseSync(dbPath);
    raw
      .prepare(
        "DELETE FROM purged_entities WHERE user_id = (SELECT id FROM users WHERE username = 'alice') AND entity = 'account' AND entity_id = 'preferences'",
      )
      .run();
    raw.close();
    const again = makeFieldOp('account', 'preferences', 'locale', 'nl', 3);
    expect((await appendOps(app, aliceSession, [again])).json<{ skipped: string[] }>().skipped).toEqual([]);
  });
});
