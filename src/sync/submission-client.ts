/**
 * Thin `fetch()` wrapper for submitting a correction to the admins (#1338, slice 2). Sends only
 * `{locale, key, text, licenceAccepted, licenceVersion}`; nothing about the reader, a person or a chart.
 */
/**
 * @module sync/submission-client
 * @purpose Posts a reader's corrected interpretation text to `POST /api/corpus-submissions`.
 * @conventions Throws `SubmissionError` carrying the server's stable `code` (`pending-limit`, `daily-limit`, ...) so the UI words the refusal itself; the licence version sent is the shared `SUBMISSION_LICENCE_VERSION`.
 * @exports SubmissionError, submitCorpusCorrection
 */
import type { Locale } from '../interpretation/schema.js';
import { SUBMISSION_LICENCE_VERSION } from '../interpretation/submission-licence.js';

export class SubmissionError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.name = 'SubmissionError';
    this.status = status;
    this.code = code;
  }
}

export async function submitCorpusCorrection(params: {
  readonly locale: Locale;
  readonly key: string;
  readonly text: string;
  readonly licenceAccepted: boolean;
}): Promise<void> {
  // The client never submits without the acceptance; the server checks it again.
  if (!params.licenceAccepted)
    throw new SubmissionError('The licence notice must be accepted', 400, 'licence-not-accepted');
  const response = await fetch('/api/corpus-submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locale: params.locale,
      key: params.key,
      text: params.text,
      licenceAccepted: true,
      licenceVersion: SUBMISSION_LICENCE_VERSION,
    }),
  });
  if (response.ok) return;
  let code: string | undefined;
  let message = `Request failed with status ${String(response.status)}`;
  try {
    const body = (await response.json()) as { code?: unknown; error?: unknown };
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.error === 'string') message = body.error;
  } catch {
    /* keep the generic message */
  }
  throw new SubmissionError(message, response.status, code);
}
