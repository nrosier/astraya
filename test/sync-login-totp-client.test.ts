/**
 * `login` in `src/sync/auth-client.ts` with `fetch` mocked (#1500): the optional `totpCode` is sent only when given, so
 * a password-only sign-in keeps its exact request body, and neither the password nor the code reaches browser storage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, login } from '../src/sync/auth-client.ts';

const USER = {
  id: 'u1',
  username: 'alice',
  role: 'user',
  isAdmin: false,
  isSuperAdmin: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  disabledAt: null,
};

const realFetch = globalThis.fetch;

interface Call {
  readonly url: string;
  readonly rawBody: string | undefined;
}

function stubFetch(answer: () => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    calls.push({ url, rawBody: typeof init?.body === 'string' ? init.body : undefined });
    return Promise.resolve(answer());
  };
  return calls;
}

const ok = (): Response => new Response(JSON.stringify({ user: USER }), { status: 200 });

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('sends exactly { username, password } without a code (password-only regression)', async () => {
    const calls = stubFetch(ok);
    await login('alice', 'pw-one');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/auth/login');
    expect(calls[0]?.rawBody).toBe('{"username":"alice","password":"pw-one"}');
  });

  it('sends { username, password, totpCode } with a code', async () => {
    const calls = stubFetch(ok);
    const user = await login('alice', 'pw-one', '123456');
    expect(user.username).toBe('alice');
    expect(JSON.parse(calls[0]?.rawBody ?? '{}')).toEqual({
      username: 'alice',
      password: 'pw-one',
      totpCode: '123456',
    });
  });

  it('maps a 401 to an AuthError', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'nope', code: 'invalid-credentials' }), { status: 401 }));
    await expect(login('alice', 'pw-one', '000000')).rejects.toBeInstanceOf(AuthError);
  });

  it('never writes the password or the code to browser storage', async () => {
    const writes: string[] = [];
    const store = {
      setItem: (key: string, value: string): void => {
        writes.push(`${key}=${value}`);
      },
      getItem: (): null => null,
      removeItem: (): void => undefined,
    };
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('sessionStorage', store);
    const indexedDb = { open: vi.fn() };
    vi.stubGlobal('indexedDB', indexedDb);
    const cookieSet = vi.fn();
    vi.stubGlobal('document', {
      get cookie(): string {
        return '';
      },
      set cookie(value: string) {
        cookieSet(value);
      },
    });
    stubFetch(ok);
    await login('alice', 'pw-secret-1', '654321');
    expect(writes).toEqual([]);
    expect(indexedDb.open).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
