/**
 * The client's only `fetch()` call: a thin wrapper matching `server/auth/routes.ts`
 * exactly. Nothing here interprets the response beyond its shape — the server is the
 * one place that decides who is signed in.
 */

/**
 * @module sync/auth-client
 * @purpose Provides the client-side authentication calls — login, logout, session check, OIDC config/callback, password set/bootstrap — each a thin wrapper over the matching server route.
 * @conventions One function per route, mirroring `server/auth/routes.ts`/`server/auth/roles.ts`/`server/auth/identity.ts`/`server/auth/oidc.ts`/`server/auth/bootstrap.ts` exactly; nothing here interprets a response beyond its own shape — the server is the sole authority on who is signed in; failures throw `AuthError` carrying the server's message and stable `code` (#1365), except `me()` where a 401 is treated as the expected "not signed in" outcome rather than an error.
 * @exports Role, AuthUser, AuthError, login, logout, me, OidcConfig, getOidcConfig, setPassword, setup, exchangeOidcCode, TotpError, TotpErrorReason, TotpEnrolment, enrolTotp, confirmTotp
 */

import { ApiError, readErrorBody } from './api-error.js';

/** Mirrors `server/auth/roles.ts`'s `Role`: a user, an admin (everything but account management) or a super admin (everything). */
export type Role = 'user' | 'admin' | 'super_admin';

/** Mirrors `server/auth/identity.ts`'s `User` shape. */
export interface AuthUser {
  readonly id: string;
  readonly username: string;
  readonly role: Role;
  /** An admin or a super admin. */
  readonly isAdmin: boolean;
  /** May manage accounts and roles as well. */
  readonly isSuperAdmin: boolean;
  readonly createdAt: string;
  readonly disabledAt: string | null;
}

/** Thrown for a request the server actively rejected (bad credentials, rate limit, ...); carries the server's stable `code` (#1365). */
export class AuthError extends ApiError {
  constructor(message: string, status: number, code?: string) {
    super(message, status, code);
    this.name = 'AuthError';
  }
}

async function authFailure(response: Response): Promise<AuthError> {
  const { message, code } = await readErrorBody(response);
  return new AuthError(message, response.status, code);
}

/** `POST /api/auth/login`. Throws `AuthError` on 400/401/429 with the server's own message. */
export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw await authFailure(response);
  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}

/**
 * `POST /api/auth/logout`. The server does not reject it for lack of a session, but the `fetch` itself still throws when offline, which the caller must
 * treat as "the server wasn't told", not as "sign-out failed" (#335). A non-2xx answer
 * (a proxy 502, a 500) means the same thing, so it throws an `AuthError` too (#1361). Returns
 * `endSessionUrl` when the ended session was OIDC-derived and
 * Authentik advertises RP-initiated logout (#77) — the caller must navigate there
 * (a `fetch` can't end Authentik's own browser session), never treat it as optional.
 */
export async function logout(): Promise<{ endSessionUrl?: string }> {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw await authFailure(response);
  const body = (await response.json().catch(() => ({}))) as { endSessionUrl?: string };
  return body.endSessionUrl === undefined ? {} : { endSessionUrl: body.endSessionUrl };
}

/**
 * `GET /api/auth/me`. `undefined` means "not signed in" (401) — an ordinary, expected
 * outcome, not a failure. Anything else that goes wrong (network down, 5xx) throws, so a
 * caller can tell "signed out" apart from "couldn't ask".
 */
export async function me(): Promise<AuthUser | undefined> {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) return undefined;
  if (!response.ok) throw await authFailure(response);
  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}

/**
 * `GET /api/auth/oidc/config` — whether to render the "Sign in with Authentik" affordance
 * at all. `authorizationEndpoint` is resolved server-side (`server/auth/oidc.ts`'s cached
 * discovery) rather than left for the browser to fetch itself: a direct browser fetch to
 * the issuer's discovery document depends on CORS headers the issuer may not send.
 */
export type OidcConfig =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly issuer: string;
      readonly clientId: string;
      readonly authorizationEndpoint: string;
    };

export async function getOidcConfig(): Promise<OidcConfig> {
  const response = await fetch('/api/auth/oidc/config');
  if (!response.ok) throw await authFailure(response);
  return (await response.json()) as OidcConfig;
}

/**
 * `POST /api/auth/oidc/callback`. The code is one-time-use — the caller (`main.tsx`)
 * must never retry this on failure with the same `code`, only restart the sign-in
 * flow from scratch.
 */
/**
 * `POST /api/auth/set-password` (#135) — the unauthenticated end of an admin-issued
 * one-time link, whether the account is brand new or this is a password reset. Creates
 * no session: the caller still signs in normally afterward, same as any other login.
 */
export async function setPassword(token: string, password: string): Promise<void> {
  const response = await fetch('/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) throw await authFailure(response);
}

/**
 * `POST /api/setup` — the one-time admin-bootstrap flow (`server/auth/bootstrap.ts`,
 * `#/setup?token=...`). Unlike `setPassword`, this creates a session: the server sets the
 * same cookie a login would, so the caller signs in immediately rather than being sent back
 * to a separate sign-in step.
 */
export async function setup(token: string, username: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, username, password }),
  });
  if (!response.ok) throw await authFailure(response);
  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}

export async function exchangeOidcCode(params: {
  readonly code: string;
  readonly codeVerifier: string;
  readonly nonce: string;
}): Promise<AuthUser> {
  const response = await fetch('/api/auth/oidc/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await authFailure(response);
  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}

/**
 * Why a TOTP call failed, from the server's stable `code` (with the status as the fallback). `malformed-response` means a 2xx
 * answer whose body did not have the expected shape: a failure, never a silent default.
 */
export type TotpErrorReason =
  | 'invalid-credentials'
  | 'invalid-code'
  | 'unauthenticated'
  | 'local-only'
  | 'unavailable'
  | 'already-enabled'
  | 'not-started'
  | 'rate-limited'
  | 'malformed-response'
  | 'unknown';

/** Thrown by `enrolTotp` and `confirmTotp`; `reason` is the switchable outcome and `message` keeps the server's own text. */
export class TotpError extends AuthError {
  readonly reason: TotpErrorReason;

  constructor(message: string, status: number, reason: TotpErrorReason, code?: string) {
    super(message, status, code);
    this.name = 'TotpError';
    this.reason = reason;
  }
}

function totpReason(status: number, code: string | undefined): TotpErrorReason {
  switch (code) {
    case 'invalid-credentials':
      return 'invalid-credentials';
    case 'invalid-code':
      return 'invalid-code';
    case 'totp-local-only':
      return 'local-only';
    case 'totp-unavailable':
      return 'unavailable';
    case 'totp-already-enabled':
      return 'already-enabled';
    case 'totp-not-started':
      return 'not-started';
    case 'rate-limited':
      return 'rate-limited';
    default:
      break;
  }
  switch (status) {
    case 401:
      return 'unauthenticated';
    case 403:
      return 'local-only';
    case 409:
      return 'already-enabled';
    case 429:
      return 'rate-limited';
    case 503:
      return 'unavailable';
    default:
      return 'unknown';
  }
}

async function totpFailure(response: Response): Promise<TotpError> {
  const { message, code } = await readErrorBody(response);
  return new TotpError(message, response.status, totpReason(response.status, code), code);
}

function malformedTotp(): TotpError {
  return new TotpError('Unexpected response from the server', 200, 'malformed-response');
}

/** The result of `enrolTotp`: the base32 secret and the `otpauth://` URI for an authenticator app. The caller keeps them in component state only. */
export interface TotpEnrolment {
  readonly secret: string;
  readonly otpauthUri: string;
}

/**
 * `POST /api/auth/totp/enrol`. Starts a pending enrolment for the signed-in local account after the current password is checked.
 * Throws `TotpError` (statuses 401, 403, 409, 429, 503) with the server's own message. Stores nothing.
 */
export async function enrolTotp(password: string): Promise<TotpEnrolment> {
  const response = await fetch('/api/auth/totp/enrol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw await totpFailure(response);
  const body = (await response.json()) as { secret?: unknown; otpauthUri?: unknown };
  if (typeof body.secret !== 'string' || body.secret === '') throw malformedTotp();
  if (typeof body.otpauthUri !== 'string' || body.otpauthUri === '') throw malformedTotp();
  return { secret: body.secret, otpauthUri: body.otpauthUri };
}

/**
 * `POST /api/auth/totp/confirm`. Checks the first code from the app, enables TOTP and returns the ten recovery codes, shown once.
 * Throws `TotpError` (statuses 401, 403, 409, 429, 503) with the server's own message. Stores nothing.
 */
export async function confirmTotp(code: string): Promise<readonly string[]> {
  const response = await fetch('/api/auth/totp/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw await totpFailure(response);
  const body = (await response.json()) as { recoveryCodes?: unknown };
  const codes = body.recoveryCodes;
  if (!Array.isArray(codes) || codes.length !== 10) throw malformedTotp();
  if (!codes.every((item): item is string => typeof item === 'string' && item !== '')) throw malformedTotp();
  return codes;
}
