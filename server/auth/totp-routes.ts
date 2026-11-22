/**
 * @module totp-routes
 * @purpose The two-step enrolment HTTP surface (#1500, slice 2b): `POST /api/auth/totp/enrol` starts a pending enrolment and returns the secret once, `POST /api/auth/totp/confirm` checks the first code, enables TOTP and returns the recovery codes once.
 * @conventions Both routes need a session (`requireUser`), a local account (an OIDC account is refused 403), `ASTRAYA_ENCRYPTION_KEY` (503 without it) and are limited to 5 per minute. A wrong password (enrol) or wrong code (confirm) is a failed login on the shared per-username throttle (`login-throttle.ts`, 5 per 15 minutes), which is checked before anything is verified. Enrolment is enabled only through `completeTotpEnrolment`. A successful confirm ends every other session of the user and keeps the current one. Both success responses are `Cache-Control: no-store`. Fails closed: a thrown `readTotpState` or a malformed key is a generic 500 (the shared error handler), never "not enrolled". Nothing here logs, and no response other than the two success bodies carries a secret or code.
 * @exports registerTotpRoutes
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Database } from '../db.ts';
import { loadEncryptionKey } from '../ops/crypto.ts';
import { BODY_REQUIRED_ERROR, bodyObject } from '../request-body.ts';
import { getUserCredentialsByUsername, requireUser } from './identity.ts';
import { isLoginThrottled, recordFailedLogin } from './login-throttle.ts';
import { verifyPassword } from './passwords.ts';
import { SESSION_COOKIE, revokeOtherSessionsForUser } from './sessions.ts';
import { ALGORITHM, DIGITS, STEP_SECONDS, encodeBase32, verifyTotp } from './totp.ts';
import { completeTotpEnrolment, generateRecoveryCodes, readTotpState, startTotpEnrolment } from './totp-store.ts';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** The route sets `Cache-Control: no-store` on its success response, and the global `no-cache` hook must keep it. */
    noStore?: boolean;
  }
}

/** The issuer shown in the authenticator app, and the label prefix. */
const ISSUER = 'Astraya';

const RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const;

interface EnrolBody {
  readonly password?: unknown;
}

interface ConfirmBody {
  readonly code?: unknown;
}

/** The `otpauth://` key URI for an authenticator app; the algorithm, digits and period come from the engine. */
function buildOtpauthUri(username: string, secretBase32: string): string {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(username)}`;
  const params = [
    `secret=${secretBase32}`,
    `issuer=${encodeURIComponent(ISSUER)}`,
    `algorithm=${ALGORITHM.toUpperCase()}`,
    `digits=${String(DIGITS)}`,
    `period=${String(STEP_SECONDS)}`,
  ].join('&');
  return `otpauth://totp/${label}?${params}`;
}

function refuse(reply: FastifyReply, status: number, code: string, error: string) {
  return reply.code(status).send({ code, error });
}

export function registerTotpRoutes(app: FastifyInstance, db: Database): void {
  app.post<{ Body: EnrolBody }>(
    '/api/auth/totp/enrol',
    { preHandler: requireUser(db), config: { rateLimit: RATE_LIMIT, noStore: true } },
    async (request, reply) => {
      const user = request.user;
      if (!user) return refuse(reply, 401, 'not-authenticated', 'Not authenticated');
      const body = bodyObject(request.body);
      if (!body) return refuse(reply, 400, 'body-required', BODY_REQUIRED_ERROR);
      const { password } = body;
      if (typeof password !== 'string' || password === '') {
        return refuse(reply, 400, 'missing-fields', 'password is required');
      }

      const credentials = getUserCredentialsByUsername(db, user.username);
      const passwordHash = credentials?.passwordHash;
      if (passwordHash === undefined || passwordHash === null) {
        return refuse(reply, 403, 'totp-local-only', 'Two-step sign-in is only available for local accounts');
      }
      const key = loadEncryptionKey();
      if (key === null) return refuse(reply, 503, 'totp-unavailable', 'Two-step sign-in is not available');

      if (isLoginThrottled(user.username)) {
        return refuse(reply, 429, 'rate-limited', 'Too many attempts. Try again later.');
      }
      const valid = await verifyPassword(passwordHash, password);
      if (!valid) {
        recordFailedLogin(user.username);
        return refuse(reply, 401, 'invalid-credentials', 'Invalid username or password');
      }

      if (readTotpState(db, key, user.id).status === 'enabled') {
        return refuse(reply, 409, 'totp-already-enabled', 'Two-step sign-in is already on');
      }
      const bytes = startTotpEnrolment(db, key, user.id);
      const secret = encodeBase32(bytes);
      bytes.fill(0);
      reply.header('Cache-Control', 'no-store');
      return reply.send({ secret, otpauthUri: buildOtpauthUri(user.username, secret) });
    },
  );

  app.post<{ Body: ConfirmBody }>(
    '/api/auth/totp/confirm',
    { preHandler: requireUser(db), config: { rateLimit: RATE_LIMIT, noStore: true } },
    async (request, reply) => {
      const user = request.user;
      if (!user) return refuse(reply, 401, 'not-authenticated', 'Not authenticated');
      const body = bodyObject(request.body);
      if (!body) return refuse(reply, 400, 'body-required', BODY_REQUIRED_ERROR);
      const { code } = body;
      if (typeof code !== 'string' || code === '') return refuse(reply, 400, 'missing-fields', 'code is required');

      const credentials = getUserCredentialsByUsername(db, user.username);
      const passwordHash = credentials?.passwordHash;
      if (passwordHash === undefined || passwordHash === null) {
        return refuse(reply, 403, 'totp-local-only', 'Two-step sign-in is only available for local accounts');
      }
      const key = loadEncryptionKey();
      if (key === null) return refuse(reply, 503, 'totp-unavailable', 'Two-step sign-in is not available');

      if (isLoginThrottled(user.username)) {
        return refuse(reply, 429, 'rate-limited', 'Too many attempts. Try again later.');
      }
      const state = readTotpState(db, key, user.id);
      if (state.status === 'enabled') {
        state.secret.fill(0);
        return refuse(reply, 409, 'totp-already-enabled', 'Two-step sign-in is already on');
      }
      if (state.status === 'off') return refuse(reply, 409, 'totp-not-started', 'Two-step sign-in was not started');

      const result = verifyTotp(state.secret, code, Math.floor(Date.now() / 1000));
      state.secret.fill(0);
      if (!result.ok) {
        recordFailedLogin(user.username);
        return refuse(reply, 401, 'invalid-code', 'That code did not match');
      }

      const recoveryCodes = generateRecoveryCodes();
      const enabled = completeTotpEnrolment(
        db,
        key,
        user.id,
        state.enrolmentIv,
        result.step,
        new Date().toISOString(),
        recoveryCodes,
      );
      // False: another request replaced or finished the enrolment between the read and the write.
      if (!enabled) return refuse(reply, 409, 'totp-not-started', 'Two-step sign-in was not started');

      const cookie = request.cookies[SESSION_COOKIE];
      if (cookie !== undefined) revokeOtherSessionsForUser(db, user.id, cookie);
      reply.header('Cache-Control', 'no-store');
      return reply.send({ recoveryCodes });
    },
  );
}
