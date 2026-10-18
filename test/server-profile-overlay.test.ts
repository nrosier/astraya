/** The easter-egg setting route (#697). */
import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { describe, expect, it } from 'vitest';
import { loadProfileOverlayConfig, registerProfileOverlayRoute } from '../server/profile-overlay.ts';

const A = 'a'.repeat(64);
const B = '0123456789abcdef'.repeat(4);

describe('loadProfileOverlayConfig (#697)', () => {
  it('reads two hex digests joined by a colon, in any case', () => {
    expect(loadProfileOverlayConfig(`${A}:${B}`)).toEqual({ enabled: true, dateDigest: A, nameDigest: B });
    expect(loadProfileOverlayConfig(` ${A.toUpperCase()}:${B} `)).toEqual({
      enabled: true,
      dateDigest: A,
      nameDigest: B,
    });
  });

  it('is off when unset or malformed, rather than failing', () => {
    for (const value of [undefined, '', A, `${A}:`, `${A}:${B}:${A}`, `${A}:xyz`]) {
      expect(loadProfileOverlayConfig(value)).toEqual({ enabled: false });
    }
  });
});

describe('GET /api/profile-overlay (#697)', () => {
  it('serves the setting, or off', async () => {
    for (const [value, expected] of [
      [`${A}:${B}`, { enabled: true, dateDigest: A, nameDigest: B }],
      [undefined, { enabled: false }],
    ] as const) {
      const app = Fastify();
      await app.register(fastifyRateLimit, { global: false });
      registerProfileOverlayRoute(app, value);
      const response = await app.inject({ method: 'GET', url: '/api/profile-overlay' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expected);
      await app.close();
    }
  });
});
