/**
 * #1365 compatibility check of the API error shape. Every route keeps the fields an old client reads (`error`, the
 * HTTP status, and Fastify's `statusCode`/`message` on its own errors) and gains a stable `code` beside them.
 * Exercised through `app.inject()` against a temp SQLite file, like `test/server-admin.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { errorCodeForStatus } from '../server/error-codes.ts';

const BOOTSTRAP_TOKEN = 'test-bootstrap-token';
process.env.LOG_LEVEL = 'silent';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-codes-test-'));
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  app = await build({ dbPath: join(dir, 'astraya.db') });
});

afterEach(async () => {
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  rmSync(dir, { recursive: true, force: true });
});

async function post(url: string, payload: unknown) {
  const response = await app.inject({ method: 'POST', url, payload: payload as object });
  return { status: response.statusCode, body: response.json<Record<string, unknown>>() };
}

describe('error bodies keep `error` and add a stable `code` (#1365)', () => {
  it('login: 400 missing fields, 401 bad credentials', async () => {
    const missing = await post('/api/auth/login', {});
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ code: 'missing-fields', error: 'username and password are required' });

    const bad = await post('/api/auth/login', { username: 'nobody', password: 'whatever-password' });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ code: 'invalid-credentials', error: 'Invalid username or password' });
  });

  it('login: a body that is not an object is a 400 body-required', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: 'null',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'body-required', error: 'A JSON object body is required' });
  });

  it('setup: a wrong token is a 401 carrying the token problem as the code', async () => {
    const response = await post('/api/setup', { token: 'wrong', username: 'alice', password: 'correct-horse-battery' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'setup-token-invalid', error: 'invalid' });
  });

  it('setup: 409 username taken and 400 weak password', async () => {
    const first = await post('/api/setup', {
      token: BOOTSTRAP_TOKEN,
      username: 'alice',
      password: 'correct-horse-battery',
    });
    expect(first.status).toBe(201);
    // Bootstrapped: the route now answers 404, never confirming it exists.
    const second = await post('/api/setup', { token: BOOTSTRAP_TOKEN, username: 'bob', password: 'x' });
    expect(second.status).toBe(404);
    expect(second.body).toEqual({ code: 'not-found', error: 'Not found' });
  });

  it('set-password: an unknown link is a 401 link-invalid', async () => {
    const response = await post('/api/auth/set-password', { token: 'nope', password: 'correct-horse-battery' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'link-invalid', error: 'This link is invalid or has expired' });
  });

  it('a signed-out request to a protected route is a 401 not-authenticated', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'not-authenticated', error: 'Not authenticated' });
  });

  it('an unknown /api path is a 404 not-found', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'not-found', error: 'Not found' });
  });

  it('a cross-origin write is a 403 cross-origin-rejected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example', host: 'astraya.example' },
      payload: { username: 'a', password: 'b' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'cross-origin-rejected', error: 'Cross-origin request rejected' });
  });

  it("Fastify's own 4xx keeps statusCode/error/message and gains a status-derived code", async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    const body = response.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(['code', 'error', 'message', 'statusCode']);
    expect(body.statusCode).toBe(response.statusCode);
    expect(body.error).toBeTypeOf('string');
    expect(body.message).toBeTypeOf('string');
    expect(body.code).toBe(errorCodeForStatus(response.statusCode));
  });

  it('login throttling: the 429 carries rate-limited', async () => {
    let last: { status: number; body: Record<string, unknown> } | undefined;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      last = await post('/api/auth/login', { username: 'victim', password: `wrong-password-${String(attempt)}` });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.body.error).toBeTypeOf('string');
    expect(last?.body.code).toBe('rate-limited');
  });
});

describe("the rate-limit plugin's own 429 (not the login throttle)", () => {
  it('keeps statusCode/error/message and gains code rate-limited', async () => {
    // `/api/setup` allows 20 per minute per IP; the 21st is refused by @fastify/rate-limit through the error handler.
    let last: Awaited<ReturnType<typeof post>> | undefined;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      last = await post('/api/setup', { token: 'wrong', username: 'a', password: 'b' });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.body.statusCode).toBe(429);
    expect(last?.body.error).toBeTypeOf('string');
    expect(last?.body.message).toBeTypeOf('string');
    expect(last?.body.code).toBe('rate-limited');
  });
});

describe('errorCodeForStatus', () => {
  it('maps the statuses Fastify raises itself and defaults by class', () => {
    expect(errorCodeForStatus(400)).toBe('invalid-request');
    expect(errorCodeForStatus(409)).toBe('conflict');
    expect(errorCodeForStatus(413)).toBe('payload-too-large');
    expect(errorCodeForStatus(429)).toBe('rate-limited');
    expect(errorCodeForStatus(503)).toBe('server-error');
    expect(errorCodeForStatus(418)).toBe('request-failed');
  });
});
