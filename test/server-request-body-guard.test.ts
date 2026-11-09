/**
 * Request-body guard and error boundary (#1362), through a real `build()` and `app.inject()`.
 * A missing or `null` JSON body must be a 400 (or the route's auth error), never a 500, and a
 * 5xx response must never carry the thrown error's message while Fastify's own 4xx keep theirs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { clearLoginThrottle } from '../server/auth/login-throttle.ts';

process.env.LOG_LEVEL = 'silent';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-body-guard-'));
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = 'test-bootstrap-token';
  app = await build({ dbPath: join(dir, 'astraya.db') });
});

afterEach(async () => {
  await app.close();
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  clearLoginThrottle('root');
  rmSync(dir, { recursive: true, force: true });
});

const ORIGIN = {};

async function send(method: 'POST' | 'PUT' | 'PATCH', url: string, mode: 'none' | 'null') {
  return app.inject({
    method,
    url,
    headers: mode === 'null' ? { ...ORIGIN, 'content-type': 'application/json' } : ORIGIN,
    ...(mode === 'null' ? { payload: 'null' } : {}),
  });
}

const PUBLIC_ROUTES = [
  ['POST', '/api/auth/login'],
  ['POST', '/api/setup'],
  ['POST', '/api/auth/set-password'],
] as const;

describe('missing or null JSON body on public routes', () => {
  for (const [method, url] of PUBLIC_ROUTES) {
    for (const mode of ['none', 'null'] as const) {
      it(`${method} ${url} with ${mode} body is 400, not 500`, async () => {
        const res = await send(method, url, mode);
        expect(res.statusCode).toBe(400);
      });
    }
  }

  it('POST /api/auth/oidc/callback answers its existing 404 when OIDC is off, never 500', async () => {
    for (const mode of ['none', 'null'] as const) {
      const res = await send('POST', '/api/auth/oidc/callback', mode);
      expect(res.statusCode).toBeLessThan(500);
    }
  });
});

describe('missing or null JSON body on admin write routes', () => {
  it('answers the auth error (401), never 500, before reading the body', async () => {
    for (const [method, url] of [
      ['POST', '/api/admin/users'],
      ['POST', '/api/admin/users/x/role'],
      ['PUT', '/api/admin/corpus-overrides'],
      ['POST', '/api/admin/corpus-candidates/import'],
      ['PATCH', '/api/admin/corpus-candidates'],
    ] as const) {
      for (const mode of ['none', 'null'] as const) {
        const res = await send(method, url, mode);
        expect(res.statusCode, `${method} ${url} ${mode}`).toBe(401);
      }
    }
  });

  it('an authenticated super-admin with a null body gets 400 on create-user', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: { token: 'test-bootstrap-token', username: 'root', password: 'correct horse battery staple' },
    });
    expect(setup.statusCode).toBeLessThan(300);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: { username: 'root', password: 'correct horse battery staple' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    for (const [method, url] of [
      ['POST', '/api/admin/users'],
      ['POST', '/api/admin/users/x/role'],
      ['PUT', '/api/admin/corpus-overrides'],
      ['POST', '/api/admin/corpus-candidates/import'],
      ['PATCH', '/api/admin/corpus-candidates'],
    ] as const) {
      for (const mode of ['none', 'null'] as const) {
        const res = await app.inject({
          method,
          url,
          headers: {
            ...ORIGIN,
            cookie,
            ...(mode === 'null' ? { 'content-type': 'application/json' } : {}),
          },
          ...(mode === 'null' ? { payload: 'null' } : {}),
        });
        expect(res.statusCode, `${method} ${url} ${mode}`).toBe(400);
      }
    }
  });
});

describe('error boundary', () => {
  it('a forced throw is a 500 whose body does not contain the thrown message', async () => {
    const secret = 'secret-internal-detail-1362';
    app.get('/__boom', () => {
      throw new Error(secret);
    });
    const res = await app.inject({ method: 'GET', url: '/__boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain(secret);
  });

  it('keeps 415 for an unsupported media type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...ORIGIN, 'content-type': 'application/xml' },
      payload: 'x',
    });
    expect(res.statusCode).toBe(415);
  });

  it('keeps 413 for a body over the limit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({ username: 'a'.repeat(1024 * 1024 + 10) }),
    });
    expect(res.statusCode).toBe(413);
  });

  it('keeps 429 once the rate limit is hit', async () => {
    let last = 0;
    for (let i = 0; i < 25; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/set-password',
        headers: { ...ORIGIN, 'content-type': 'application/json' },
        payload: {},
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});
