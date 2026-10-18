/**
 * @module server/profile-overlay
 * @purpose Serves the deployment's optional easter-egg setting (`ASTRAYA_EASTER_EGG`) to the birth-record screen (#697), read-only.
 * @conventions Off unless the variable holds two 64-character hex digests joined by a colon; anything else is treated as unset, so a typo never breaks the page. Self-contained (no `src/` import), so the Docker image's `COPY server` covers it.
 * @exports ProfileOverlayConfig, loadProfileOverlayConfig, registerProfileOverlayRoute
 */
import type { FastifyInstance } from 'fastify';

export type ProfileOverlayConfig =
  { readonly enabled: false } | { readonly enabled: true; readonly dateDigest: string; readonly nameDigest: string };

const SETTING = /^([0-9a-f]{64}):([0-9a-f]{64})$/;

export function loadProfileOverlayConfig(value: string | undefined): ProfileOverlayConfig {
  const match = SETTING.exec(value?.trim().toLowerCase() ?? '');
  const [, dateDigest, nameDigest] = match ?? [];
  return dateDigest === undefined || nameDigest === undefined
    ? { enabled: false }
    : { enabled: true, dateDigest, nameDigest };
}

export function registerProfileOverlayRoute(
  app: FastifyInstance,
  value: string | undefined = process.env.ASTRAYA_EASTER_EGG,
): void {
  const config = loadProfileOverlayConfig(value);
  app.get(
    '/api/profile-overlay',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (_request, reply) => reply.send(config),
  );
}
