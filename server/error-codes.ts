/**
 * @module error-codes
 * @purpose Stable machine codes for error bodies (#1365): every `{ error }` the API sends also carries a `code`, so a client can translate by code instead of showing the English text.
 * @conventions Additive: `error` (and Fastify's `statusCode`/`message`) stay exactly as they were, `code` is an extra field an old client ignores; codes are kebab-case and never reworded once shipped; the status-derived fallback covers errors raised outside a route (body limit, media type, rate limit).
 * @exports errorCodeForStatus
 */

/** The code for an error Fastify raised itself (no route chose one), derived from its HTTP status. */
export function errorCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'invalid-request';
    case 401:
      return 'not-authenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not-found';
    case 409:
      return 'conflict';
    case 413:
      return 'payload-too-large';
    case 415:
      return 'unsupported-media-type';
    case 429:
      return 'rate-limited';
    default:
      return status >= 500 ? 'server-error' : 'request-failed';
  }
}
