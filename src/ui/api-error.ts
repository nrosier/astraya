/**
 * Turns an error caught from a server call into translated copy (#1365).
 */
/**
 * @module ui/api-error
 * @purpose Maps a caught `ApiError` to its translated sentence by stable `code`, then by HTTP status, then to a generic translated fallback; the single place a UI panel turns an error into copy.
 * @conventions `apiErrorText` never returns `Error.message` or the server's English `error` text: an unknown code, a non-`ApiError` (a network `TypeError`, a local failure) and an unreadable body all end in the generic fallback, so no English leaks into a Dutch screen; `message` stays on the error object for logs only. A `SyncError` (a push that failed while adopting this device's data) is worded by its failure kind, the same wording the status line uses.
 * @exports apiErrorTextFor, apiErrorText, errorDetail, failureText
 */
import { ApiError } from '../sync/api-error.js';
import { SyncError } from '../sync/engine.js';
import { apiErrorMessages } from './api-error.messages.js';
import { statusMessages } from './status.messages.js';
import { getLocale } from './locale.js';

type Catalogue = (typeof apiErrorMessages)['en'];

/** Pure form of the lookup (`apiErrorText` below reads the locale itself), for callers that already hold the locale's catalogue half. */
export function apiErrorTextFor(t: Catalogue, cause: unknown): string {
  if (!(cause instanceof ApiError)) return t.fallback;
  const byCode = cause.code === undefined ? undefined : lookup(t.codes, cause.code);
  if (byCode !== undefined) return byCode;
  const byStatus = lookup(t.statuses, String(cause.status));
  if (byStatus !== undefined) return byStatus;
  return cause.status >= 500 ? t.statuses[500] : t.fallback;
}

function lookup(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The error as copy in the UI locale at the moment it is caught: `setError(apiErrorText(cause))`. */
export function apiErrorText(cause: unknown): string {
  const locale = getLocale();
  if (cause instanceof SyncError) return statusMessages[locale].syncFailureReason[cause.kind];
  return apiErrorTextFor(apiErrorMessages[locale], cause);
}

/**
 * For a failure that is not (only) a server answer: a store write, a file read, the ephemeris. The technical detail helps
 * there, so it is kept, but inside a translated sentence; an `ApiError` or `SyncError` is still worded by `apiErrorText`.
 */
export function failureText(cause: unknown): string {
  if (cause instanceof ApiError || cause instanceof SyncError) return apiErrorText(cause);
  const detail = cause instanceof Error ? cause.message : String(cause);
  return apiErrorMessages[getLocale()].failedWithDetail(detail);
}

/**
 * The detail slotted into a translated sentence the screen already wraps it in (`t.saveFailed(detail)`): an `ApiError` or
 * `SyncError` is worded by `apiErrorText`, a local failure (store, file, ephemeris) keeps its technical message, which the
 * surrounding sentence frames.
 */
export function errorDetail(cause: unknown): string {
  if (cause instanceof ApiError || cause instanceof SyncError) return apiErrorText(cause);
  return cause instanceof Error ? cause.message : String(cause);
}
