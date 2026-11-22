/**
 * TOTP disable route (#1500, slice 5): `POST /api/auth/totp/disable` through Fastify's `app.inject()` against a real
 * temp SQLite file and the real TOTP engine (no mocks). Secrets and codes live only in variables here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Writable } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { clearLoginThrottle, isLoginThrottled } from '../server/auth/login-throttle.ts';
import { createSession } from '../server/auth/sessions.ts';
import { DIGITS, STEP_SECONDS, totpAt } from '../server/auth/totp.ts';
import { isTotpEnabled, readTotpState } from '../server/auth/totp-store.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const PASSWORD = 'correct-horse-battery';
const KEY = randomBytes(32);
/** The per-username failed-attempt limit (`login-throttle.ts`), as the sibling TOTP tests use it. */
const MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;

async function startApp(logStream?: Writable): Promise<FastifyInstance> {
  return build({ dbPath, ...(logStream !== undefined ? { logStream } : {}) });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-totp-disable-'));
  dbPath = join(dir, 'astraya.db');
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = KEY.toString('base64');
  process.env.LOG_LEVEL = 'silent';
  app = await startApp();
});

afterEach(async () => {
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  process.env.LOG_LEVEL = 'silent';
  rmSync(dir, { recursive: true, force: true });
  clearLoginThrottle('admin');
  clearLoginThrottle('oidc-user');
});

async function setupAdmin(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username: 'admin', password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('setup set no session cookie');
  return cookie.value;
}

function post(url: string, cookie: string, payload: object) {
  return app.inject({ method: 'POST', url, cookies: { [SESSION_COOKIE]: cookie }, payload });
}

const disable = (cookie: string, code: string) => post('/api/auth/totp/disable', cookie, { code });

function withDb<T>(work: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

function adminId(): string {
  return withDb((db) => (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string }).id);
}

function storedSecret(): Uint8Array {
  return withDb((db) => {
    const state = readTotpState(db, KEY, adminId());
    if (state.status === 'off') throw new Error('no TOTP state');
    return state.secret;
  });
}

function stateStatus(): string {
  return withDb((db) => readTotpState(db, KEY, adminId()).status);
}

function recoveryCodeRows(): number {
  return withDb((db) => {
    const row = db.prepare('SELECT COUNT(*) AS n FROM totp_recovery_codes WHERE user_id = ?').get(adminId()) as {
      n: number | bigint;
    };
    return Number(row.n);
  });
}

function codeAt(offsetSteps: number): string {
  return totpAt(storedSecret(), Math.floor(Date.now() / 1000) + offsetSteps * STEP_SECONDS);
}

/** A code outside the +/-1 step window (and so never accepted). */
function wrongCode(): string {
  const window = [-1, 0, 1].map(codeAt);
  for (let n = 0; n < 1000; n++) {
    const candidate = String(n).padStart(DIGITS, '0');
    if (!window.includes(candidate)) return candidate;
  }
  throw new Error('unreachable');
}

/** Enrols and confirms with the previous step's code, so the current step's code is still unspent. */
async function enableTotp(cookie: string): Promise<string[]> {
  expect((await post('/api/auth/totp/enrol', cookie, { password: PASSWORD })).statusCode).toBe(200);
  const confirmed = await post('/api/auth/totp/confirm', cookie, { code: codeAt(-1) });
  expect(confirmed.statusCode).toBe(200);
  return confirmed.json<{ recoveryCodes: string[] }>().recoveryCodes;
}

function insertOidcSession(): string {
  return withDb((db) => {
    const id = randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at, oidc_issuer, oidc_subject) VALUES (?, ?, NULL, ?, ?, ?)',
    ).run(id, 'oidc-user', new Date().toISOString(), 'https://issuer.example', 'subject-1');
    return createSession(db, id, { oidcIdToken: 'id-token' }).cookieValue;
  });
}

describe('POST /api/auth/totp/disable', () => {
  it('requires a session', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/totp/disable', payload: { code: '123456' } });
    expect(response.statusCode).toBe(401);
  });

  it('requires a code', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    expect((await post('/api/auth/totp/disable', cookie, {})).statusCode).toBe(400);
    expect(stateStatus()).toBe('enabled');
  });

  it('a valid TOTP code clears TOTP and the recovery codes, and the success response is no-store', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    expect(recoveryCodeRows()).toBe(RECOVERY_CODE_COUNT);
    const response = await disable(cookie, codeAt(0));
    expect(response.statusCode).toBe(200);
    expect(response.json<{ disabled: boolean }>()).toEqual({ disabled: true });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(stateStatus()).toBe('off');
    expect(withDb((db) => isTotpEnabled(readTotpState(db, KEY, adminId())))).toBe(false);
    expect(recoveryCodeRows()).toBe(0);
  });

  it('a valid recovery code clears TOTP and is spent: it is refused after TOTP is turned on again', async () => {
    const cookie = await setupAdmin();
    const [recovery] = await enableTotp(cookie);
    if (recovery === undefined) throw new Error('no recovery code');
    expect((await disable(cookie, recovery)).statusCode).toBe(200);
    expect(stateStatus()).toBe('off');
    expect(recoveryCodeRows()).toBe(0);
    // A second use while off is refused and clears nothing.
    expect((await disable(cookie, recovery)).statusCode).toBe(409);
    // After a new enrolment the old code is not among the new ones and does not disable.
    const fresh = await enableTotp(cookie);
    expect(fresh).not.toContain(recovery);
    expect((await disable(cookie, recovery)).statusCode).toBe(401);
    expect(stateStatus()).toBe('enabled');
  });

  it('a wrong code counts on the per-username throttle and the 6th attempt is throttled', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    const wrong = wrongCode();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const response = await disable(cookie, wrong);
      expect(response.statusCode).toBe(401);
      expect(response.json<{ code: string }>().code).toBe('invalid-code');
      expect(response.headers['cache-control']).not.toBe('no-store');
    }
    expect(isLoginThrottled('admin')).toBe(true);
    const sixth = await disable(cookie, codeAt(0));
    expect(sixth.statusCode).toBe(429);
    expect(stateStatus()).toBe('enabled');
    expect(recoveryCodeRows()).toBe(RECOVERY_CODE_COUNT);
  });

  it('a pending account is refused with 409 and nothing is cleared', async () => {
    const cookie = await setupAdmin();
    expect((await post('/api/auth/totp/enrol', cookie, { password: PASSWORD })).statusCode).toBe(200);
    const response = await disable(cookie, codeAt(0));
    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe('totp-not-enabled');
    expect(stateStatus()).toBe('pending');
  });

  it('an account with TOTP off is refused with 409', async () => {
    const cookie = await setupAdmin();
    const response = await disable(cookie, '123456');
    expect(response.statusCode).toBe(409);
    expect(response.headers['cache-control']).not.toBe('no-store');
    expect(stateStatus()).toBe('off');
    expect(isLoginThrottled('admin')).toBe(false);
  });

  it('refuses an OIDC account with 403', async () => {
    await setupAdmin();
    const response = await disable(insertOidcSession(), '123456');
    expect(response.statusCode).toBe(403);
    expect(response.json<{ code: string }>().code).toBe('totp-local-only');
  });

  it('with the key unset while the user is enabled, refuses and clears nothing (fail closed)', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    const code = codeAt(0);
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    const response = await disable(cookie, code);
    expect(response.statusCode).toBe(503);
    process.env.ASTRAYA_ENCRYPTION_KEY = KEY.toString('base64');
    expect(stateStatus()).toBe('enabled');
    expect(recoveryCodeRows()).toBe(RECOVERY_CODE_COUNT);
  });

  it('a malformed key refuses with a generic 500 and clears nothing (fail closed)', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    const code = codeAt(0);
    process.env.ASTRAYA_ENCRYPTION_KEY = 'not-a-valid-key';
    const response = await disable(cookie, code);
    expect(response.statusCode).toBe(500);
    process.env.ASTRAYA_ENCRYPTION_KEY = KEY.toString('base64');
    expect(stateStatus()).toBe('enabled');
    expect(recoveryCodeRows()).toBe(RECOVERY_CODE_COUNT);
  });

  it('keeps the current session, and a password login works afterwards with no code', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    expect((await disable(cookie, codeAt(0))).statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: cookie } });
    expect(me.statusCode).toBe(200);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.cookies.find((c) => c.name === SESSION_COOKIE)).toBeDefined();
  });

  it('a concurrent burst of wrong codes plus the valid code: the valid code is throttled after the 5th failure', async () => {
    const cookie = await setupAdmin();
    await enableTotp(cookie);
    const wrong = wrongCode();
    const valid = codeAt(0);
    const sent = MAX_ATTEMPTS + 1;
    const codes = Array.from({ length: sent }, (_, i) => (i === sent - 1 ? valid : wrong));
    const responses = await Promise.all(codes.map((code) => disable(cookie, code)));
    const statuses = responses.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 200)).toEqual([]);
    expect(statuses.filter((s) => s === 401)).toHaveLength(MAX_ATTEMPTS);
    expect(responses[sent - 1]?.statusCode).toBe(429);
    expect(stateStatus()).toBe('enabled');
    expect(recoveryCodeRows()).toBe(RECOVERY_CODE_COUNT);
  });
});

describe('logging', () => {
  it('no code, recovery code or secret is logged by the disable route', async () => {
    await app.close();
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString('utf8'));
        callback();
      },
    });
    process.env.LOG_LEVEL = 'trace';
    app = await startApp(sink);
    const cookie = await setupAdmin();
    const recoveryCodes = await enableTotp(cookie);
    const wrong = wrongCode();
    const valid = codeAt(0);
    expect((await disable(cookie, wrong)).statusCode).toBe(401);
    expect((await disable(cookie, valid)).statusCode).toBe(200);

    const strings: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
    };
    for (const line of lines
      .join('')
      .split('\n')
      .filter((l) => l !== ''))
      collect(JSON.parse(line));
    const log = strings.join('\n');
    expect(log).toContain('/api/auth/totp/disable');
    for (const secretValue of [wrong, valid, PASSWORD, cookie]) expect(log).not.toContain(secretValue);
    for (const recovery of recoveryCodes) expect(log).not.toContain(recovery);
  });
});
