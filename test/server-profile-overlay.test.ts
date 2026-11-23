/** The easter-egg check (#697): decided on the server under a key derived from ASTRAYA_ENCRYPTION_KEY, signed-in only (#1808). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { deriveProfileOverlayKey, parseProfileOverlaySetting } from '../server/profile-overlay.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
const SESSION_COOKIE = 'astraya_session';
const ENCRYPTION_KEY_BYTES = randomBytes(32);
const ENCRYPTION_KEY = ENCRYPTION_KEY_BYTES.toString('base64');
const DATE = '2001-02-03';
const TOKEN = 'example';
const SETTING = `${DATE}:${TOKEN}`;
const URL = '/api/profile-overlay/check';

process.env.LOG_LEVEL = 'silent';

let dir: string | undefined;
let app: FastifyInstance | undefined;

async function start(encryptionKey: string | undefined): Promise<void> {
  dir = mkdtempSync(join(tmpdir(), 'astraya-profile-overlay-test-'));
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_EASTER_EGG = SETTING;
  if (encryptionKey === undefined) delete process.env.ASTRAYA_ENCRYPTION_KEY;
  else process.env.ASTRAYA_ENCRYPTION_KEY = encryptionKey;
  app = await build({ dbPath: join(dir, 'astraya.db') });
}

/** The app `start` built; every route test runs after one. */
function server(): FastifyInstance {
  if (app === undefined) throw new Error('start() was not called');
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_EASTER_EGG;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Creates the first admin via bootstrap and returns its session cookie value. */
async function setupSession(target: FastifyInstance): Promise<string> {
  const response = await target.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username: 'alice', password: 'correct-horse-battery' },
  });
  const sessionId = response.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error('setup did not set a session cookie');
  return sessionId;
}

const check = (sessionId: string | undefined, date: string, name: string) =>
  server().inject({
    method: 'POST',
    url: URL,
    payload: { date, name },
    ...(sessionId === undefined ? {} : { cookies: { [SESSION_COOKIE]: sessionId } }),
  });

/** Every value that must never appear in a response: the key, the derived key, and each HMAC in hex and base64. */
function secrets(): string[] {
  const derived = deriveProfileOverlayKey(ENCRYPTION_KEY_BYTES);
  const macs = [DATE, TOKEN].map((text) => createHmac('sha256', derived).update(text).digest());
  return [
    ENCRYPTION_KEY,
    ENCRYPTION_KEY_BYTES.toString('hex'),
    derived.toString('hex'),
    derived.toString('base64'),
  ].concat(
    macs.map((mac) => mac.toString('hex')),
    macs.map((mac) => mac.toString('base64')),
  );
}

function expectNoSecret(body: string): void {
  for (const secret of secrets()) expect(body).not.toContain(secret);
}

describe('parseProfileOverlaySetting (#697, #1808)', () => {
  it('reads the normalized date and one name token', () => {
    expect(parseProfileOverlaySetting(SETTING)).toEqual({ date: DATE, nameToken: TOKEN });
    expect(parseProfileOverlaySetting(` ${DATE}:Example `)).toEqual({ date: DATE, nameToken: TOKEN });
  });

  it('is off when unset or malformed, rather than failing', () => {
    for (const value of [
      undefined,
      '',
      DATE,
      `${DATE}:`,
      `${DATE}:jo example`,
      `2001-2-3:${TOKEN}`,
      `${'a'.repeat(64)}:${'b'.repeat(64)}`,
    ]) {
      expect(parseProfileOverlaySetting(value)).toBeUndefined();
    }
  });
});

describe('POST /api/profile-overlay/check (#697, #1808)', () => {
  beforeEach(async () => {
    await start(ENCRYPTION_KEY);
  });

  it('refuses an anonymous request with 401 and no secret', async () => {
    const response = await check(undefined, DATE, 'Jo Example');
    expect(response.statusCode).toBe(401);
    expectNoSecret(response.body);
  });

  it('matches a signed-in correct date and name, and answers only enabled and match', async () => {
    const sessionId = await setupSession(server());
    for (const name of ['Jo Example', 'EXAMPLE, Jo', '  Jo   Ex-ample  ']) {
      const response = await check(sessionId, DATE, name);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: true, match: true });
      expectNoSecret(response.body);
    }
  });

  it('does not match a wrong date', async () => {
    const sessionId = await setupSession(server());
    const response = await check(sessionId, '2001-02-04', 'Jo Example');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: true, match: false });
    expectNoSecret(response.body);
  });

  it('does not match a wrong name', async () => {
    const sessionId = await setupSession(server());
    const response = await check(sessionId, DATE, 'Jo Sample');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: true, match: false });
    expectNoSecret(response.body);
  });

  it('rate-limits the 6th check in one minute with 429', async () => {
    const sessionId = await setupSession(server());
    for (let index = 0; index < 5; index++) {
      expect((await check(sessionId, DATE, 'Jo Example')).statusCode).toBe(200);
    }
    const sixth = await check(sessionId, DATE, 'Jo Example');
    expect(sixth.statusCode).toBe(429);
    expectNoSecret(sixth.body);
  });

  it('refuses a body that is not a date and a name with 400', async () => {
    const sessionId = await setupSession(server());
    const response = await server().inject({
      method: 'POST',
      url: URL,
      payload: { date: 20010203 },
      cookies: { [SESSION_COOKIE]: sessionId },
    });
    expect(response.statusCode).toBe(400);
    expectNoSecret(response.body);
  });
});

describe('POST /api/profile-overlay/check without ASTRAYA_ENCRYPTION_KEY (#1808)', () => {
  beforeEach(async () => {
    await start(undefined);
  });

  it('is off, not an error, even for a matching person', async () => {
    const sessionId = await setupSession(server());
    const response = await check(sessionId, DATE, 'Jo Example');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: false, match: false });
    expectNoSecret(response.body);
  });

  it('still needs sign-in', async () => {
    expect((await check(undefined, DATE, 'Jo Example')).statusCode).toBe(401);
  });
});
