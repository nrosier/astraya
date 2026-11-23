/**
 * @module server/profile-overlay
 * @purpose Decides on the server whether a birth record matches the deployment's optional easter-egg setting (`ASTRAYA_EASTER_EGG`, #697) and answers only `enabled` and `match`, to signed-in users only (#1808).
 * @conventions The setting is the normalized date and name token (`YYYY-MM-DD:token`); anything else is treated as unset, so a typo never breaks the page. Both sides are compared as HMAC-SHA256 under a key derived at check time from `ASTRAYA_ENCRYPTION_KEY` with HKDF-SHA256 (fixed info, no salt, the style of `auth/totp-keys.ts`); without that key the feature is off. The route needs `requireUser` (401 otherwise), is limited to 5 checks per minute per account, and still answers `{ enabled: false }` when off. The setting, the key and the HMACs never reach a response or a log. Imports no `src/` code, so the Docker image's `COPY server` covers it.
 * @exports ProfileOverlaySetting, parseProfileOverlaySetting, normalizeNameTokens, deriveProfileOverlayKey, registerProfileOverlayRoute
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './db.ts';
import { requireUser } from './auth/identity.ts';
import { loadEncryptionKey } from './ops/crypto.ts';
import { BODY_REQUIRED_ERROR, bodyObject } from './request-body.ts';

/** The configured person, already normalized. Server-internal: never sent to a client or logged. */
export interface ProfileOverlaySetting {
  readonly date: string;
  readonly nameToken: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The person form's own field limit (`PERSON_TEXT_MAX_CHARACTERS` in `src/domain/person.ts`), restated: `server/` imports no `src/`. */
const NAME_MAX_CHARACTERS = 200;
const KEY_INFO = 'astraya-easter-egg-v1';

/** A name as lowercase letter-and-digit tokens split on whitespace: the normalization the client used before #1808. */
export function normalizeNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((token) => token !== '');
}

/** Reads `YYYY-MM-DD:token`; anything else (unset, no colon, a bad date, no token or more than one) is off. */
export function parseProfileOverlaySetting(value: string | undefined): ProfileOverlaySetting | undefined {
  const trimmed = value?.trim() ?? '';
  const colon = trimmed.indexOf(':');
  if (colon < 0) return undefined;
  const date = trimmed.slice(0, colon);
  const tokens = normalizeNameTokens(trimmed.slice(colon + 1));
  const [nameToken] = tokens;
  if (!DATE.test(date) || tokens.length !== 1 || nameToken === undefined) return undefined;
  return { date, nameToken };
}

/** The easter egg's HMAC key, HKDF-SHA256 from the server key with a fixed info string and no salt. */
export function deriveProfileOverlayKey(key: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), KEY_INFO, 32));
}

const hmac = (key: Buffer, text: string): Buffer => createHmac('sha256', key).update(text, 'utf8').digest();

interface CheckBody {
  readonly date?: unknown;
  readonly name?: unknown;
}

const OFF = { enabled: false, match: false } as const;

export function registerProfileOverlayRoute(
  app: FastifyInstance,
  db: Database,
  value: string | undefined = process.env.ASTRAYA_EASTER_EGG,
): void {
  const setting = parseProfileOverlaySetting(value);
  app.post<{ Body: CheckBody | null }>(
    '/api/profile-overlay/check',
    {
      preHandler: requireUser(db),
      // Per account, not per IP: `request.user` only exists after the preHandler, hence `hook: 'preHandler'`.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const serverKey = setting === undefined ? null : loadEncryptionKey();
      if (setting === undefined || serverKey === null) return reply.send(OFF);

      const body = bodyObject(request.body);
      if (body === undefined) return reply.code(400).send({ code: 'body-required', error: BODY_REQUIRED_ERROR });
      const { date, name } = body;
      if (typeof date !== 'string' || typeof name !== 'string' || name.length > NAME_MAX_CHARACTERS) {
        return reply.code(400).send({ code: 'invalid-request', error: 'date and name must be strings' });
      }

      const key = deriveProfileOverlayKey(serverKey);
      const dateMatches = timingSafeEqual(hmac(key, date), hmac(key, setting.date));
      const wanted = hmac(key, setting.nameToken);
      const nameMatches = normalizeNameTokens(name).some((token) => timingSafeEqual(hmac(key, token), wanted));
      return reply.send({ enabled: true, match: dateMatches && nameMatches });
    },
  );
}
