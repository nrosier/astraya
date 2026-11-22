/**
 * The TOTP second step at login (#1500, slice 4): `POST /api/auth/login` with `{ username, password, totpCode }`,
 * through Fastify's `app.inject()` against a real temp SQLite file, the real TOTP engine and the real enrolment routes
 * (no mocks). Only `Date` is faked, pinned to the middle of a time step, so the +/-1 step window is deterministic.
 * Secrets and codes live only in variables here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { clearLoginThrottle, isLoginThrottled } from '../server/auth/login-throttle.ts';
import { DIGITS, STEP_SECONDS, totpAt } from '../server/auth/totp.ts';
import { readTotpState } from '../server/auth/totp-store.ts';
import { startFakeAuthentik } from './fake-authentik.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const PASSWORD = 'correct-horse-battery';
const KEY = randomBytes(32);
/** Login throttle numbers, copied from `server/auth/login-throttle.ts:17-18`. */
const MAX_ATTEMPTS = 5;
const INVALID = { code: 'invalid-credentials', error: 'Invalid username or password' };

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;
/** Unix seconds, pinned to the middle of a step. */
let now: number;

async function startApp(logStream?: Writable): Promise<FastifyInstance> {
  return build({ dbPath, ...(logStream !== undefined ? { logStream } : {}) });
}

beforeEach(async () => {
  const realSeconds = Math.floor(Date.now() / 1000);
  now = Math.floor(realSeconds / STEP_SECONDS) * STEP_SECONDS + STEP_SECONDS / 2;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now * 1000);
  dir = mkdtempSync(join(tmpdir(), 'astraya-login-totp-'));
  dbPath = join(dir, 'astraya.db');
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = KEY.toString('base64');
  process.env.LOG_LEVEL = 'silent';
  app = await startApp();
});

afterEach(async () => {
  await app.close();
  vi.useRealTimers();
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

function login(payload: object) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload });
}

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

function codeAt(offsetSteps: number): string {
  return totpAt(storedSecret(), now + offsetSteps * STEP_SECONDS);
}

/** A 6-digit code outside the +/-1 step window. */
function wrongCode(): string {
  const window = [-1, 0, 1].map(codeAt);
  for (let n = 0; n < 1000; n++) {
    const candidate = String(n).padStart(DIGITS, '0');
    if (!window.includes(candidate)) return candidate;
  }
  throw new Error('unreachable');
}

/** Starts enrolment only: the state stays pending. */
async function enrolPending(cookie: string): Promise<void> {
  expect((await post('/api/auth/totp/enrol', cookie, { password: PASSWORD })).statusCode).toBe(200);
}

/**
 * Enables TOTP through the real routes. The confirm uses the previous step's code, so the replay guard sits one step
 * behind and the current step's code is the next valid one at login.
 */
async function enableTotp(): Promise<string[]> {
  const cookie = await setupAdmin();
  await enrolPending(cookie);
  const confirmed = await post('/api/auth/totp/confirm', cookie, { code: codeAt(-1) });
  expect(confirmed.statusCode).toBe(200);
  return confirmed.json<{ recoveryCodes: string[] }>().recoveryCodes;
}

function recoveryCodeCount(): number {
  return withDb(
    (db) =>
      (
        db.prepare('SELECT COUNT(*) AS n FROM totp_recovery_codes WHERE user_id = ?').get(adminId()) as {
          n: number;
        }
      ).n,
  );
}

function sessionCookie(response: Awaited<ReturnType<typeof login>>) {
  return response.cookies.find((c) => c.name === SESSION_COOKIE);
}

describe('POST /api/auth/login with TOTP enabled', () => {
  it('an enabled account with the correct password and a valid TOTP code signs in', async () => {
    await enableTotp();
    const response = await login({ username: 'admin', password: PASSWORD, totpCode: codeAt(0) });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ user: { username: string } }>().user.username).toBe('admin');
    const cookie = sessionCookie(response);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE]: String(cookie?.value) },
    });
    expect(me.statusCode).toBe(200);
  });

  it('an enabled account with the correct password and no code is refused with the invalid-credentials response and counts on the throttle', async () => {
    await enableTotp();
    const wrongPassword = await login({ username: 'admin', password: 'not-the-password' });
    clearLoginThrottle('admin');
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const response = await login({ username: 'admin', password: PASSWORD });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(INVALID);
      // The same body as a wrong password, so a password-only attempt cannot tell whether TOTP is on.
      expect(response.body).toBe(wrongPassword.body);
      expect(sessionCookie(response)).toBeUndefined();
    }
    expect(isLoginThrottled('admin')).toBe(true);
  });

  it('a wrong TOTP code counts on the per-username throttle, and the 6th attempt within 15 minutes is throttled', async () => {
    await enableTotp();
    const wrong = wrongCode();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const response = await login({ username: 'admin', password: PASSWORD, totpCode: wrong });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(INVALID);
    }
    // The 6th, even with the right code, is throttled before any code is verified.
    const sixth = await login({ username: 'admin', password: PASSWORD, totpCode: codeAt(0) });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json<{ code: string }>().code).toBe('rate-limited');
    expect(sessionCookie(sixth)).toBeUndefined();
  });

  it('the same valid TOTP code cannot be used twice (replay check)', async () => {
    await enableTotp();
    const code = codeAt(0);
    expect((await login({ username: 'admin', password: PASSWORD, totpCode: code })).statusCode).toBe(200);
    const replay = await login({ username: 'admin', password: PASSWORD, totpCode: code });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toEqual(INVALID);
    expect(sessionCookie(replay)).toBeUndefined();
    // An older step inside the window is refused too: the recorded step only moves forward.
    expect((await login({ username: 'admin', password: PASSWORD, totpCode: codeAt(-1) })).statusCode).toBe(401);
  });

  it('a valid recovery code signs in once; the second use is refused and the code is consumed', async () => {
    const codes = await enableTotp();
    const recovery = codes[0];
    if (recovery === undefined) throw new Error('no recovery codes');
    const before = recoveryCodeCount();
    const first = await login({ username: 'admin', password: PASSWORD, totpCode: recovery });
    expect(first.statusCode).toBe(200);
    expect(sessionCookie(first)).toBeDefined();
    expect(recoveryCodeCount()).toBe(before - 1);
    const second = await login({ username: 'admin', password: PASSWORD, totpCode: recovery });
    expect(second.statusCode).toBe(401);
    expect(second.json()).toEqual(INVALID);
    expect(recoveryCodeCount()).toBe(before - 1);
  });

  it('a recovery code with the wrong password does not sign in and is not consumed', async () => {
    const codes = await enableTotp();
    const recovery = codes[0];
    if (recovery === undefined) throw new Error('no recovery codes');
    const before = recoveryCodeCount();
    const response = await login({ username: 'admin', password: 'not-the-password', totpCode: recovery });
    expect(response.statusCode).toBe(401);
    expect(recoveryCodeCount()).toBe(before);
  });
});

describe('POST /api/auth/login without TOTP enabled (regressions)', () => {
  it('a pending-enrolment account is not required to supply a code (signs in with the password as before)', async () => {
    const cookie = await setupAdmin();
    await enrolPending(cookie);
    const response = await login({ username: 'admin', password: PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)).toBeDefined();
    expect(withDb((db) => readTotpState(db, KEY, adminId()).status)).toBe('pending');
  });

  it('a password-only account signs in exactly as before (regression, existing behaviour)', async () => {
    await setupAdmin();
    const response = await login({ username: 'admin', password: PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json<object>())).toEqual(['user']);
    const cookie = sessionCookie(response);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.secure).toBeUndefined();
    const wrong = await login({ username: 'admin', password: 'not-the-password' });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual(INVALID);
  });

  it('a password-only account still signs in with no encryption key configured', async () => {
    await setupAdmin();
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    expect((await login({ username: 'admin', password: PASSWORD })).statusCode).toBe(200);
  });

  it('OIDC account login is unchanged (regression)', async () => {
    const clientId = 'astraya-test-client';
    const fake = await startFakeAuthentik(clientId);
    await app.close();
    process.env.ASTRAYA_OIDC_ISSUER = fake.baseUrl;
    process.env.ASTRAYA_OIDC_CLIENT_ID = clientId;
    process.env.ASTRAYA_PUBLIC_URL = 'http://localhost:8080';
    try {
      app = await startApp();
      // An enabled local user on the same instance does not change the OIDC path.
      await enableTotp();
      const idToken = await fake.mintIdToken({ sub: 'subject-1', nonce: 'nonce-1', preferred_username: 'oidc-user' });
      fake.registerCode('code-1', { idToken });
      const callback = await app.inject({
        method: 'POST',
        url: '/api/auth/oidc/callback',
        payload: { code: 'code-1', codeVerifier: 'verifier-1', nonce: 'nonce-1' },
      });
      expect(callback.statusCode).toBe(200);
      expect(callback.json<{ user: { username: string } }>().user.username).toBe('oidc-user');
      expect(sessionCookie(callback)).toBeDefined();
      // An account with no password hash still gets the wrong-password response from the password route.
      const passwordLogin = await login({ username: 'oidc-user', password: PASSWORD, totpCode: codeAt(0) });
      expect(passwordLogin.statusCode).toBe(401);
      expect(passwordLogin.json()).toEqual(INVALID);
    } finally {
      delete process.env.ASTRAYA_OIDC_ISSUER;
      delete process.env.ASTRAYA_OIDC_CLIENT_ID;
      delete process.env.ASTRAYA_PUBLIC_URL;
      await fake.close();
    }
  });
});

describe('POST /api/auth/login fails closed', () => {
  it('with the encryption key unset and an enabled user present, login is refused (fail closed)', async () => {
    await enableTotp();
    const code = codeAt(0);
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    for (const payload of [
      { username: 'admin', password: PASSWORD },
      { username: 'admin', password: PASSWORD, totpCode: code },
    ]) {
      const response = await login(payload);
      expect(response.statusCode).toBe(500);
      expect(sessionCookie(response)).toBeUndefined();
    }
  });

  it('a malformed encryption key with an enabled user present refuses login (fail closed)', async () => {
    await enableTotp();
    const code = codeAt(0);
    process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    const response = await login({ username: 'admin', password: PASSWORD, totpCode: code });
    expect(response.statusCode).toBe(500);
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('a malformed stored secret refuses login (fail closed)', async () => {
    await enableTotp();
    const code = codeAt(0);
    withDb((db) => db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(randomBytes(36), adminId()));
    const response = await login({ username: 'admin', password: PASSWORD, totpCode: code });
    expect(response.statusCode).toBe(500);
    expect(sessionCookie(response)).toBeUndefined();
    expect(response.body).not.toContain(code);
  });
});

describe('logging', () => {
  it('no code, secret, recovery code or password is logged', async () => {
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

    const codes = await enableTotp();
    const recovery = codes[0];
    if (recovery === undefined) throw new Error('no recovery codes');
    const wrong = wrongCode();
    const code = codeAt(0);
    const secretHex = Buffer.from(storedSecret()).toString('hex');
    expect((await login({ username: 'admin', password: PASSWORD, totpCode: wrong })).statusCode).toBe(401);
    expect((await login({ username: 'admin', password: PASSWORD, totpCode: code })).statusCode).toBe(200);
    expect((await login({ username: 'admin', password: PASSWORD, totpCode: recovery })).statusCode).toBe(200);
    // A fail-closed 500 is logged by the shared error handler: it must carry none of these either.
    withDb((db) => db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(randomBytes(36), adminId()));
    expect((await login({ username: 'admin', password: PASSWORD, totpCode: code })).statusCode).toBe(500);

    // Only string values are searched: a 6-digit code would otherwise match inside a numeric timestamp.
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
    // The sink must actually have captured the login requests and the 500, or the assertions below prove nothing.
    expect(log).toContain('/api/auth/login');
    expect(log).toContain('unhandled error');
    for (const value of [wrong, code, recovery, PASSWORD, secretHex, KEY.toString('base64')]) {
      expect(log).not.toContain(value);
    }
    for (const other of codes) expect(log).not.toContain(other);
  });
});
