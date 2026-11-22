/**
 * `enrolTotp` and `confirmTotp` in `src/sync/auth-client.ts`, with `fetch` mocked: no network, no server. The
 * tests cover the request bodies, the response shapes, the typed error for each status and the server's own
 * message, the runtime rejection of malformed 2xx bodies, and the rule that the secret and the recovery codes
 * are never written to browser storage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TotpError, confirmTotp, enrolTotp } from '../src/sync/auth-client.ts';

const SECRET = 'JBSWY3DPEHPK3PXP';
const OTPAUTH_URI = `otpauth://totp/Astraya:alice?secret=${SECRET}&issuer=Astraya&algorithm=SHA1&digits=6&period=30`;
const RECOVERY_CODES = [
  'AAAAA-BBBBB',
  'CCCCC-DDDDD',
  'EEEEE-FFFFF',
  'GGGGG-HHHHH',
  'IIIII-JJJJJ',
  '22222-33333',
  '44444-55555',
  '66666-77777',
  'ABCDE-FGHIJ',
  'KLMNO-PQRST',
];

interface RecordedCall {
  readonly url: string;
  readonly body: unknown;
}

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Replaces `fetch` with one that answers each call from `answer` and records the URL and parsed JSON body. */
function stubFetch(answer: () => Response): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    calls.push({ url, body });
    return Promise.resolve(answer());
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

describe('enrolTotp', () => {
  it('sends the password in the JSON body and returns the secret and the otpauth URI', async () => {
    const calls = stubFetch(() => jsonResponse({ secret: SECRET, otpauthUri: OTPAUTH_URI }));

    const result = await enrolTotp('correct-horse-battery');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      url: '/api/auth/totp/enrol',
      body: { password: 'correct-horse-battery' },
    });
    expect(result).toEqual({ secret: SECRET, otpauthUri: OTPAUTH_URI });
  });

  it.each([
    [401, 'invalid-credentials', 'Invalid username or password'],
    [403, 'totp-local-only', 'Two-step sign-in is only available for local accounts'],
    [409, 'totp-already-enabled', 'Two-step sign-in is already on'],
    [429, 'rate-limited', 'Too many attempts. Try again later.'],
    [503, 'totp-unavailable', 'Two-step sign-in is not available'],
  ])('maps status %i (code %s) to a TotpError and keeps the server message', async (status, code, message) => {
    stubFetch(() => jsonResponse({ code, error: message }, status));

    const error: unknown = await enrolTotp('whatever').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TotpError);
    expect(error).toMatchObject({ status, code, message });
  });

  it('maps a 401 with the invalid-credentials code to the invalid-credentials reason', async () => {
    stubFetch(() => jsonResponse({ code: 'invalid-credentials', error: 'Invalid username or password' }, 401));

    await expect(enrolTotp('wrong')).rejects.toMatchObject({ reason: 'invalid-credentials' });
  });

  it('maps a 403 without a code to the local-only reason', async () => {
    stubFetch(() => jsonResponse({ error: 'Only local accounts' }, 403));

    await expect(enrolTotp('pw')).rejects.toMatchObject({ reason: 'local-only', status: 403 });
  });

  it('throws when a 200 body has no secret', async () => {
    stubFetch(() => jsonResponse({ otpauthUri: OTPAUTH_URI }));

    await expect(enrolTotp('pw')).rejects.toMatchObject({ reason: 'malformed-response' });
  });

  it('throws when a 200 body has an empty secret', async () => {
    stubFetch(() => jsonResponse({ secret: '', otpauthUri: OTPAUTH_URI }));

    await expect(enrolTotp('pw')).rejects.toBeInstanceOf(TotpError);
  });
});

describe('confirmTotp', () => {
  it('sends the code in the JSON body and returns the ten recovery codes', async () => {
    const calls = stubFetch(() => jsonResponse({ recoveryCodes: RECOVERY_CODES }));

    const codes = await confirmTotp('123456');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ url: '/api/auth/totp/confirm', body: { code: '123456' } });
    expect(codes).toHaveLength(10);
    expect(codes).toEqual(RECOVERY_CODES);
  });

  it.each([
    [401, 'invalid-code', 'That code did not match', 'invalid-code'],
    [401, undefined, 'Not authenticated', 'unauthenticated'],
    [403, 'totp-local-only', 'Two-step sign-in is only available for local accounts', 'local-only'],
    [409, 'totp-not-started', 'Two-step sign-in was not started', 'not-started'],
    [409, 'totp-already-enabled', 'Two-step sign-in is already on', 'already-enabled'],
    [429, 'rate-limited', 'Too many attempts. Try again later.', 'rate-limited'],
    [503, 'totp-unavailable', 'Two-step sign-in is not available', 'unavailable'],
  ])(
    'maps status %i (code %s) to a TotpError with reason %s and keeps the server message',
    async (status, code, message, reason) => {
      stubFetch(() => jsonResponse({ code, error: message }, status));

      const error: unknown = await confirmTotp('000000').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TotpError);
      expect(error).toMatchObject({ status, message, reason });
    },
  );

  it('throws when a 200 body has recoveryCodes of length 9', async () => {
    stubFetch(() => jsonResponse({ recoveryCodes: RECOVERY_CODES.slice(0, 9) }));

    await expect(confirmTotp('123456')).rejects.toMatchObject({ reason: 'malformed-response' });
  });

  it('throws when a 200 body has a non-string recovery code', async () => {
    const codes: unknown[] = [...RECOVERY_CODES];
    codes[3] = 42;
    stubFetch(() => jsonResponse({ recoveryCodes: codes }));

    await expect(confirmTotp('123456')).rejects.toBeInstanceOf(TotpError);
  });

  it('throws when a 200 body has no recoveryCodes array', async () => {
    stubFetch(() => jsonResponse({ codes: RECOVERY_CODES }));

    await expect(confirmTotp('123456')).rejects.toMatchObject({ reason: 'malformed-response' });
  });
});

describe('storage: the secret and the recovery codes are never persisted in the browser', () => {
  it('neither enrolTotp nor confirmTotp writes the secret or any code to any browser store', async () => {
    const storageWrites: string[] = [];
    const idbOpenCalls: unknown[][] = [];
    const cookieWrites: string[] = [];

    const recordSetItem = (key: string, value: string): void => {
      storageWrites.push(key, value);
    };
    vi.stubGlobal('localStorage', {
      setItem: recordSetItem,
      getItem: () => null,
      removeItem: () => undefined,
      clear: () => undefined,
    });
    vi.stubGlobal('sessionStorage', {
      setItem: recordSetItem,
      getItem: () => null,
      removeItem: () => undefined,
      clear: () => undefined,
    });
    vi.stubGlobal('indexedDB', {
      open: (...args: unknown[]) => {
        idbOpenCalls.push(args);
        return undefined;
      },
    });
    vi.stubGlobal('document', {
      get cookie(): string {
        return '';
      },
      set cookie(value: string) {
        cookieWrites.push(value);
      },
    });

    const answers: Response[] = [
      jsonResponse({ secret: SECRET, otpauthUri: OTPAUTH_URI }),
      jsonResponse({ recoveryCodes: RECOVERY_CODES }),
    ];
    stubFetch(() => {
      const next = answers.shift();
      if (next === undefined) throw new Error('unexpected extra fetch');
      return next;
    });

    const enrolment = await enrolTotp('correct-horse-battery');
    const codes = await confirmTotp('123456');

    // The values are returned to the caller, which keeps them in component state.
    expect(enrolment.secret).toBe(SECRET);
    expect(codes).toEqual(RECOVERY_CODES);

    // No store, index or cookie received the secret or any recovery code, in either call.
    const secrets = [SECRET, ...RECOVERY_CODES];
    const writtenText = [...storageWrites, ...idbOpenCalls.flat().map(String), ...cookieWrites];
    for (const secret of secrets) {
      expect(writtenText.filter((text) => text.includes(secret))).toEqual([]);
    }
    expect(storageWrites).toEqual([]);
    expect(idbOpenCalls).toEqual([]);
    expect(cookieWrites).toEqual([]);
  });
});
