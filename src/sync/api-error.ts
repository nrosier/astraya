/**
 * @module sync/api-error
 * @purpose Shared error type and response reader for every client of the server API (#1365): carries the HTTP status and the server's stable machine `code` so the UI can translate by code instead of showing the server's English `error` text.
 * @conventions Additive over the old wire shape: `error` (the English text) is still read and kept as `Error.message` for logs and diagnostics, `code` is optional because an older server or a proxy's own error page has none; the UI never renders `message` as primary copy, it maps `code`/`status` through `ui/api-error.messages.ts`.
 * @exports ApiError, readErrorBody
 */

/** An error answer from the server (or an unreadable one). `code` is absent when the body carried none. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Reads `{ error, code }` from a non-2xx response; both fall back when the body is not JSON or lacks them. */
export async function readErrorBody(response: Response): Promise<{ message: string; code: string | undefined }> {
  let message = `Request failed with status ${String(response.status)}`;
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown };
    if (typeof body.error === 'string') message = body.error;
    if (typeof body.code === 'string') code = body.code;
  } catch {
    /* keep the generic message and no code */
  }
  return { message, code };
}
