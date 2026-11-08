/**
 * `src/sync/submission-client.ts` (#1338 slice 2): the client never sends without the licence acceptance, and sends
 * only locale, key, text and the acceptance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubmissionError, submitCorpusCorrection } from '../src/sync/submission-client.js';
import { SUBMISSION_LICENCE_VERSION } from '../src/interpretation/submission-licence.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = { locale: 'en', key: 'dignity-state:sun:ruler', text: 'Some text.' } as const;

describe('submitCorpusCorrection', () => {
  it('does not call the server without the acceptance', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(submitCorpusCorrection({ ...base, licenceAccepted: false })).rejects.toBeInstanceOf(SubmissionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the five allowed fields', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 201 })));
    vi.stubGlobal('fetch', fetchMock);
    await submitCorpusCorrection({ ...base, licenceAccepted: true });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({
      ...base,
      licenceAccepted: true,
      licenceVersion: SUBMISSION_LICENCE_VERSION,
    });
  });

  it('carries the server error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ code: 'pending-limit', error: 'x' }), { status: 409 })),
      ),
    );
    await expect(submitCorpusCorrection({ ...base, licenceAccepted: true })).rejects.toMatchObject({
      code: 'pending-limit',
      status: 409,
    });
  });
});
