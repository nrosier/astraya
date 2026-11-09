/**
 * Request-body guard and error boundary (#1362), through a real `build()` and `app.inject()`.
 * A missing or `null` JSON body must be a 400 (or the route's auth error), never a 500, and a
 * 5xx response must never carry the thrown error's message while Fastify's own 4xx keep theirs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
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

  it('POST /api/auth/oidc/callback answers its 404 when OIDC is off, never 500', async () => {
    for (const mode of ['none', 'null'] as const) {
      const res = await send('POST', '/api/auth/oidc/callback', mode);
      expect(res.statusCode).toBe(404);
    }
  });

  it('POST /api/auth/oidc/callback with no body or null body is 400 once OIDC is configured', async () => {
    // loadOidcConfig() is read per request, so setting the env after build() reaches the body guard.
    // The guard runs before any network call, so no IdP needs to be listening.
    process.env.ASTRAYA_OIDC_ISSUER = 'http://localhost:1';
    process.env.ASTRAYA_OIDC_CLIENT_ID = 'astraya-test-client';
    process.env.ASTRAYA_PUBLIC_URL = 'http://localhost:8080';
    try {
      for (const mode of ['none', 'null'] as const) {
        const res = await send('POST', '/api/auth/oidc/callback', mode);
        expect(res.statusCode, `oidc callback ${mode}`).toBe(400);
      }
    } finally {
      delete process.env.ASTRAYA_OIDC_ISSUER;
      delete process.env.ASTRAYA_OIDC_CLIENT_ID;
      delete process.env.ASTRAYA_PUBLIC_URL;
    }
  });
});

async function superAdminSession(target: FastifyInstance): Promise<{ cookie: string; userId: string }> {
  await target.inject({
    method: 'POST',
    url: '/api/setup',
    headers: { ...ORIGIN, 'content-type': 'application/json' },
    payload: { token: 'test-bootstrap-token', username: 'root', password: 'correct horse battery staple' },
  });
  const login = await target.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { ...ORIGIN, 'content-type': 'application/json' },
    payload: { username: 'root', password: 'correct horse battery staple' },
  });
  const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
  const loginBody: { user: { id: string } } = login.json();
  const userId = loginBody.user.id;
  return { cookie, userId };
}

/** Sends the same request with no body and with a `null` JSON body, as an authenticated super-admin. */
async function sendAs(
  target: FastifyInstance,
  cookie: string,
  method: 'POST' | 'DELETE',
  url: string,
  mode: 'none' | 'null',
  extraHeaders: Record<string, string> = {},
) {
  return target.inject({
    method,
    url,
    headers: {
      ...ORIGIN,
      cookie,
      ...extraHeaders,
      ...(mode === 'null' ? { 'content-type': 'application/json' } : {}),
    },
    ...(mode === 'null' ? { payload: 'null' } : {}),
  });
}

describe('missing or null body as an authenticated super-admin', () => {
  // These routes read no request body, so a body cannot make them fail. Asserted: the same
  // response with or without a body, and never a 500. Unknown ids keep them free of side effects.
  it('admin user routes that read no body answer their own 404 for an unknown user, never 500', async () => {
    const { cookie } = await superAdminSession(app);
    for (const [method, url] of [
      ['POST', '/api/admin/users/missing/reset-password'],
      ['POST', '/api/admin/users/missing/disable'],
      ['POST', '/api/admin/users/missing/enable'],
      ['POST', '/api/admin/users/missing/deletion-impact'],
      ['DELETE', '/api/admin/users/missing'],
    ] as const) {
      for (const mode of ['none', 'null'] as const) {
        const res = await sendAs(app, cookie, method, url, mode);
        expect(res.statusCode, `${method} ${url} ${mode}`).toBe(404);
      }
    }
  });

  it('DELETE /api/admin/corpus-overrides/:id reads no body and answers its own 404, never 500', async () => {
    const { cookie } = await superAdminSession(app);
    for (const mode of ['none', 'null'] as const) {
      const res = await sendAs(app, cookie, 'DELETE', '/api/admin/corpus-overrides/missing', mode);
      expect(res.statusCode, `DELETE corpus-overrides ${mode}`).toBe(404);
    }
  });

  it('POST /api/interpretation/generate with no body or null body is 400, not 500', async () => {
    const { cookie } = await superAdminSession(app);
    for (const mode of ['none', 'null'] as const) {
      const res = await sendAs(app, cookie, 'POST', '/api/interpretation/generate', mode);
      expect(res.statusCode, `generate ${mode}`).toBe(400);
    }
  });

  it('POST /api/ops with no body or null body is 400, not 500', async () => {
    // The sync relay is only registered when ASTRAYA_ENCRYPTION_KEY is set at build time.
    const previousKey = process.env.ASTRAYA_ENCRYPTION_KEY;
    process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const relayDir = mkdtempSync(join(tmpdir(), 'astraya-body-guard-relay-'));
    const relay = await build({ dbPath: join(relayDir, 'astraya.db') });
    try {
      const { cookie, userId } = await superAdminSession(relay);
      for (const mode of ['none', 'null'] as const) {
        const res = await sendAs(relay, cookie, 'POST', '/api/ops', mode, { 'x-astraya-account': userId });
        expect(res.statusCode, `ops ${mode}`).toBe(400);
      }
    } finally {
      await relay.close();
      rmSync(relayDir, { recursive: true, force: true });
      if (previousKey === undefined) delete process.env.ASTRAYA_ENCRYPTION_KEY;
      else process.env.ASTRAYA_ENCRYPTION_KEY = previousKey;
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
