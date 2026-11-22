/**
 * TOTP enrolment routes (#1500, slice 2b): `POST /api/auth/totp/enrol` and `POST /api/auth/totp/confirm`, through
 * Fastify's `app.inject()` against a real temp SQLite file and the real TOTP engine (no mocks). Secrets and codes live
 * only in variables here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Writable } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { clearLoginThrottle, isLoginThrottled } from '../server/auth/login-throttle.ts';
import { createSession } from '../server/auth/sessions.ts';
import { ALGORITHM, DIGITS, STEP_SECONDS, encodeBase32, totpAt } from '../server/auth/totp.ts';
import { readTotpState } from '../server/auth/totp-store.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const PASSWORD = 'correct-horse-battery';
const KEY = randomBytes(32);

process.env.LOG_LEVEL = 'silent';

let dir: string;
let dbPath: string;
let app: FastifyInstance;

async function startApp(logStream?: Writable): Promise<FastifyInstance> {
  return build({ dbPath, ...(logStream !== undefined ? { logStream } : {}) });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-totp-routes-'));
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
});

/** Creates the first admin (a local account) and returns its session cookie. */
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

async function loginAdmin(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('login set no session cookie');
  return cookie.value;
}

function post(url: string, cookie: string, payload: object) {
  return app.inject({ method: 'POST', url, cookies: { [SESSION_COOKIE]: cookie }, payload });
}

const enrol = (cookie: string, password = PASSWORD) => post('/api/auth/totp/enrol', cookie, { password });
const confirm = (cookie: string, code: string) => post('/api/auth/totp/confirm', cookie, { code });

function adminId(): string {
  const db = new DatabaseSync(dbPath);
  try {
    return (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string }).id;
  } finally {
    db.close();
  }
}

/** The pending secret, read straight from the store (what an authenticator app would hold). */
function pendingSecret(): Uint8Array {
  const db = new DatabaseSync(dbPath);
  try {
    const state = readTotpState(db, KEY, adminId());
    if (state.status === 'off') throw new Error('no TOTP state');
    return state.secret;
  } finally {
    db.close();
  }
}

function stateStatus(): string {
  const db = new DatabaseSync(dbPath);
  try {
    return readTotpState(db, KEY, adminId()).status;
  } finally {
    db.close();
  }
}

function currentCode(): string {
  return totpAt(pendingSecret(), Math.floor(Date.now() / 1000));
}

function wrongCode(): string {
  const right = currentCode();
  const previous = totpAt(pendingSecret(), Math.floor(Date.now() / 1000) - 3 * STEP_SECONDS);
  const next = totpAt(pendingSecret(), Math.floor(Date.now() / 1000) + 3 * STEP_SECONDS);
  for (let n = 0; n < 1000; n++) {
    const candidate = String(n).padStart(DIGITS, '0');
    if (candidate !== right && candidate !== previous && candidate !== next) {
      // Also stay clear of the +/-1 step window.
      const near = [-1, 1].map((d) => totpAt(pendingSecret(), Math.floor(Date.now() / 1000) + d * STEP_SECONDS));
      if (!near.includes(candidate)) return candidate;
    }
  }
  throw new Error('unreachable');
}

describe('POST /api/auth/totp/enrol', () => {
  it('requires a session', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/totp/enrol', payload: { password: PASSWORD } });
    expect(response.statusCode).toBe(401);
  });

  it('returns the secret and an otpauth URI with Cache-Control: no-store', async () => {
    const cookie = await setupAdmin();
    const response = await enrol(cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<{ secret: string; otpauthUri: string }>();
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(stateStatus()).toBe('pending');
  });

  it('the otpauth URI round-trips the secret and uses the engine constants', async () => {
    const cookie = await setupAdmin();
    const body = (await enrol(cookie)).json<{ secret: string; otpauthUri: string }>();
    const uri = new URL(body.otpauthUri);
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/Astraya:admin');
    expect(uri.searchParams.get('secret')).toBe(body.secret);
    expect(uri.searchParams.get('issuer')).toBe('Astraya');
    expect(uri.searchParams.get('algorithm')).toBe(ALGORITHM.toUpperCase());
    expect(uri.searchParams.get('digits')).toBe(String(DIGITS));
    expect(uri.searchParams.get('period')).toBe(String(STEP_SECONDS));
    expect(body.otpauthUri).toBe(
      `otpauth://totp/Astraya:admin?secret=${body.secret}&issuer=Astraya&algorithm=SHA1&digits=6&period=30`,
    );
    // The secret in the response is the one the store holds.
    expect(encodeBase32(pendingSecret())).toBe(body.secret);
  });

  it('a wrong password counts on the login throttle and the 6th attempt within 15 minutes is throttled', async () => {
    const cookie = await setupAdmin();
    for (let i = 0; i < 5; i++) {
      const response = await enrol(cookie, 'wrong-password-here');
      expect(response.statusCode).toBe(401);
      expect(response.json<{ code: string }>().code).toBe('invalid-credentials');
    }
    expect(isLoginThrottled('admin')).toBe(true);
    // The 6th attempt, even with the right password, is refused (by the throttle and the route limit alike).
    expect((await enrol(cookie)).statusCode).toBe(429);
    // Login shares the same per-username throttle, so the account is locked out there too.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: PASSWORD },
    });
    expect(login.statusCode).toBe(429);
    expect(login.json<{ code: string }>().code).toBe('rate-limited');
    expect(stateStatus()).toBe('off');
  });

  it('refuses an OIDC account', async () => {
    await setupAdmin();
    const db = new DatabaseSync(dbPath);
    let cookieValue: string;
    try {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO users (id, username, password_hash, created_at, oidc_issuer, oidc_subject) VALUES (?, ?, NULL, ?, ?, ?)',
      ).run(id, 'oidc-user', new Date().toISOString(), 'https://issuer.example', 'subject-1');
      cookieValue = createSession(db, id, { oidcIdToken: 'id-token' }).cookieValue;
    } finally {
      db.close();
    }
    const response = await enrol(cookieValue);
    expect(response.statusCode).toBe(403);
    expect(response.json<{ code: string }>().code).toBe('totp-local-only');
    expect(response.headers['cache-control']).not.toBe('no-store');
  });

  it('refuses when no encryption key is configured', async () => {
    const cookie = await setupAdmin();
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
    const response = await enrol(cookie);
    expect(response.statusCode).toBe(503);
    expect(response.json<{ code: string }>().code).toBe('totp-unavailable');
    process.env.ASTRAYA_ENCRYPTION_KEY = KEY.toString('base64');
    expect(stateStatus()).toBe('off');
  });

  it('refuses an account that already has TOTP enabled', async () => {
    const cookie = await setupAdmin();
    await enrol(cookie);
    expect((await confirm(cookie, currentCode())).statusCode).toBe(200);
    const again = await enrol(cookie);
    expect(again.statusCode).toBe(409);
    expect(again.json<{ code: string }>().code).toBe('totp-already-enabled');
  });

  it('fails closed on a corrupt stored state, never reading it as not enrolled', async () => {
    const cookie = await setupAdmin();
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare("UPDATE users SET totp_enabled_at = '2026-01-01T00:00:00.000Z' WHERE username = 'admin'").run();
    } finally {
      db.close();
    }
    const response = await enrol(cookie);
    expect(response.statusCode).toBe(500);
    expect(response.headers['cache-control']).not.toBe('no-store');
  });
});

describe('POST /api/auth/totp/confirm', () => {
  it('a wrong code counts on the login throttle and the secret stays pending', async () => {
    const cookie = await setupAdmin();
    await enrol(cookie);
    const before = encodeBase32(pendingSecret());
    for (let i = 0; i < 5; i++) {
      const response = await confirm(cookie, wrongCode());
      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).not.toBe('no-store');
    }
    expect(isLoginThrottled('admin')).toBe(true);
    expect(stateStatus()).toBe('pending');
    expect(encodeBase32(pendingSecret())).toBe(before);
    // Throttled now, even with the right code.
    expect((await confirm(cookie, currentCode())).statusCode).toBe(429);
    expect(stateStatus()).toBe('pending');
  });

  it('refuses a confirm when enrolment was never started', async () => {
    const cookie = await setupAdmin();
    const response = await confirm(cookie, '123456');
    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe('totp-not-started');
  });

  it('a correct code returns 10 recovery codes with Cache-Control: no-store and enables TOTP', async () => {
    const cookie = await setupAdmin();
    await enrol(cookie);
    const response = await confirm(cookie, currentCode());
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { recoveryCodes } = response.json<{ recoveryCodes: string[] }>();
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    expect(stateStatus()).toBe('enabled');
  });

  it('after a correct confirm another session cookie is rejected and the current one still works', async () => {
    const current = await setupAdmin();
    const other = await loginAdmin();
    const meBefore = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: other } });
    expect(meBefore.statusCode).toBe(200);

    await enrol(current);
    expect((await confirm(current, currentCode())).statusCode).toBe(200);

    const meOther = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: other } });
    expect(meOther.statusCode).toBe(401);
    const meCurrent = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: current } });
    expect(meCurrent.statusCode).toBe(200);
  });

  it('a wrong code does not end any other session', async () => {
    const current = await setupAdmin();
    const other = await loginAdmin();
    await enrol(current);
    expect((await confirm(current, wrongCode())).statusCode).toBe(401);
    const meOther = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: other } });
    expect(meOther.statusCode).toBe(200);
  });

  it('the recovery codes appear once: a second confirm is refused because the account is already enabled', async () => {
    const cookie = await setupAdmin();
    await enrol(cookie);
    const code = currentCode();
    expect((await confirm(cookie, code)).statusCode).toBe(200);
    const second = await confirm(cookie, code);
    expect(second.statusCode).toBe(409);
    expect(second.json<{ code: string }>().code).toBe('totp-already-enabled');
    expect(second.body).not.toContain('recoveryCodes');
    expect(second.headers['cache-control']).not.toBe('no-store');
  });

  it('accepts a code from the previous time step (route-level window edge)', async () => {
    const cookie = await setupAdmin();
    await enrol(cookie);
    const previous = totpAt(pendingSecret(), Math.floor(Date.now() / 1000) - STEP_SECONDS);
    expect((await confirm(cookie, previous)).statusCode).toBe(200);
  });
});

describe('logging', () => {
  it('no secret, code, password or recovery code is logged by either route', async () => {
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

    const started = (await enrol(cookie)).json<{ secret: string; otpauthUri: string }>();
    const wrong = wrongCode();
    expect((await confirm(cookie, wrong)).statusCode).toBe(401);
    expect((await enrol(cookie, 'wrong-password-here')).statusCode).toBe(401);
    const code = currentCode();
    const done = (await confirm(cookie, code)).json<{ recoveryCodes: string[] }>();
    expect((await enrol(cookie)).statusCode).toBe(409);

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
    // The sink must actually have captured requests, or the assertions below prove nothing.
    expect(log).toContain('/api/auth/totp/confirm');
    for (const secretValue of [started.secret, started.otpauthUri, wrong, code, 'wrong-password-here', PASSWORD]) {
      expect(log).not.toContain(secretValue);
    }
    for (const recovery of done.recoveryCodes) expect(log).not.toContain(recovery);
    expect(log).not.toContain(cookie);
  });
});

describe('Cache-Control contract (#1500 audit: the global no-cache must survive the TOTP no-store exception)', () => {
  const distDir = join(import.meta.dirname, '..', 'dist');
  let createdDist = false;

  beforeEach(async () => {
    // `dist/` is a build output and may not exist when the tests run before `npm run build`.
    if (!existsSync(join(distDir, 'index.html'))) {
      createdDist = !existsSync(distDir);
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>test</title>');
    }
    // The static plugin is registered at build time, so rebuild now that the file exists.
    await app.close();
    app = await startApp();
  });

  afterEach(() => {
    if (createdDist) rmSync(distDir, { recursive: true, force: true });
    createdDist = false;
  });

  it.each(['/', '/index.html', '/some/unknown/spa/path', '/api/nope'])('GET %s is no-cache', async (url) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('the two TOTP routes answer a success with no-store', async () => {
    const cookie = await setupAdmin();
    const started = await enrol(cookie);
    expect(started.statusCode).toBe(200);
    expect(started.headers['cache-control']).toBe('no-store');
    const done = await confirm(cookie, currentCode());
    expect(done.statusCode).toBe(200);
    expect(done.headers['cache-control']).toBe('no-store');
  });
});
