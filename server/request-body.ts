/**
 * @module request-body
 * @purpose Shared guard for routes that read a JSON request body (#1362): a missing, null or non-object body becomes a 400 instead of a thrown destructure error.
 * @conventions Pure; returns the body when it is a plain (non-array) object, otherwise undefined. Callers answer 400 with `BODY_REQUIRED_ERROR`, or their own auth error where one applies.
 * @exports bodyObject, BODY_REQUIRED_ERROR
 */

/** The 400 message for a request whose body is missing, `null` or not a JSON object. */
export const BODY_REQUIRED_ERROR = 'A JSON object body is required';

/**
 * Narrows a parsed request body to an object. Fastify gives `undefined` for no body and `null`
 * for the JSON literal `null`; arrays and primitives are not objects the routes can destructure.
 */
export function bodyObject<T extends object>(body: T | null | undefined): T | undefined {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return body;
}
