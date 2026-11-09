// @vitest-environment jsdom
/**
 * #1365: a server refusal reaches the reader in their own language. Login, first-admin setup, set-password and the
 * admin user actions are driven through the real clients (`auth-client.ts`, `admin-client.ts`) against a stubbed
 * `fetch` that answers 400/401/403/409/429 with the server's English `error` plus its stable `code`, with the UI
 * locale switched to `nl`. The screen must show the Dutch sentence for that code and none of the English text.
 *
 * The compatibility half (an old client still works) is `test/server-error-codes.test.ts`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/sync/auth-client.js';

const session = vi.hoisted(() => ({
  signIn: null as null | ((username: string, password: string) => Promise<void>),
  setup: null as null | ((token: string, username: string, password: string) => Promise<void>),
}));

const ADMIN: AuthUser = {
  id: 'admin-1',
  username: 'root',
  role: 'super_admin',
  isAdmin: true,
  isSuperAdmin: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  disabledAt: null,
};

vi.mock('../src/ui/session-context.tsx', async () => {
  const { login, setup } = await import('../src/sync/auth-client.js');
  session.signIn = async (username, password) => {
    await login(username, password);
  };
  session.setup = async (token, username, password) => {
    await setup(token, username, password);
  };
  const value = () => ({
    user: undefined,
    adoption: undefined,
    signIn: session.signIn,
    setup: session.setup,
    signOut: vi.fn(),
    resolveAdoption: vi.fn(),
  });
  return {
    useSession: value,
    useSyncEngine: () => undefined,
    useSessionUserOrUndefined: () => ADMIN,
    removeAccountData: vi.fn(),
  };
});
vi.mock('../src/ui/oidc-pkce.ts', () => ({ startOidcHandshake: () => Promise.reject(new Error('unused')) }));

import { AccountPanel } from '../src/ui/AccountPanel.js';
import { SetupForm } from '../src/ui/SetupForm.js';
import { SetPasswordForm } from '../src/ui/SetPasswordForm.js';
import { AdminPanel } from '../src/ui/AdminPanel.js';
import { setLocale } from '../src/ui/locale.js';
import { apiErrorMessages } from '../src/ui/api-error.messages.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NL = apiErrorMessages.nl;
const EN = apiErrorMessages.en;

/** The refusals each flow can plausibly get, one per status the issue names, with the English text the old server sent. */
const REFUSALS = [
  { status: 400, code: 'password-too-weak', english: 'Password is too weak' },
  { status: 401, code: 'invalid-credentials', english: 'Invalid username or password' },
  { status: 403, code: 'forbidden', english: 'Admin access required' },
  { status: 409, code: 'username-taken', english: 'Username already taken' },
  { status: 429, code: 'rate-limited', english: 'Too many attempts. Try again later.' },
] as const;

interface Refusal {
  readonly status: number;
  readonly body: unknown;
}
let refusal: Refusal;
let root: Root | undefined;

const USERS = [
  { ...ADMIN, isAdmin: true, lastSeenAt: null, lastSyncAt: null, lastAiUsageAt: null },
  {
    id: 'user-2',
    username: 'bob',
    role: 'user',
    isAdmin: false,
    createdAt: '2026-01-02T00:00:00.000Z',
    disabledAt: null,
    lastSeenAt: null,
    lastSyncAt: null,
    lastAiUsageAt: null,
  },
];

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const json = (status: number, body: unknown): Promise<Response> =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));
      if (url === '/api/auth/oidc/config') return json(200, { enabled: false });
      if (url === '/api/admin/users' && (init?.method ?? 'GET') === 'GET') return json(200, { users: USERS });
      return json(refusal.status, refusal.body);
    }),
  );
}

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
    await Promise.resolve();
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.bind(input);
  if (setter === undefined) throw new Error('no value setter');
  setter(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function fill(container: HTMLElement, values: readonly string[]): Promise<void> {
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input')).filter(
    (input) => input.type === 'text' || input.type === 'password',
  );
  await act(async () => {
    values.forEach((value, index) => {
      const input = inputs[index];
      if (input === undefined) throw new Error(`no input ${String(index)}`);
      type(input, value);
    });
    await Promise.resolve();
  });
}

async function submit(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await Promise.resolve();
  });
  await settle();
}

const alertText = (container: HTMLElement): string => container.textContent;

beforeEach(() => {
  setLocale('nl');
  window.location.hash = '#/setup?token=abc';
  stubFetch();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  setLocale('en');
});

describe.each(REFUSALS)('a $status refusal ($code) shown in Dutch (#1365)', ({ status, code, english }) => {
  const dutch = NL.codes[code];

  beforeEach(() => {
    refusal = { status, body: { code, error: english } };
  });

  it('is worded differently in nl and en, so the assertions below can tell them apart', () => {
    expect(dutch).not.toBe(EN.codes[code]);
  });

  it('login', async () => {
    const container = await mount(<AccountPanel />);
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Inloggen')
        ?.click();
      await Promise.resolve();
    });
    await settle();
    await fill(container, ['alice', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(dutch);
    expect(alertText(container)).not.toContain(english);
  });

  it('setup', async () => {
    const container = await mount(<SetupForm />);
    await fill(container, ['alice', 'secret-password', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(dutch);
    expect(alertText(container)).not.toContain(english);
  });

  it('set-password', async () => {
    const container = await mount(<SetPasswordForm />);
    await fill(container, ['secret-password', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(dutch);
    expect(alertText(container)).not.toContain(english);
  });

  it('admin: disabling a user', async () => {
    const container = await mount(<AdminPanel />);
    await settle();
    const disable = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Uitschakelen',
    );
    if (disable === undefined) throw new Error(`no disable button in: ${container.textContent}`);
    await act(async () => {
      disable.click();
      await Promise.resolve();
    });
    await settle();
    expect(alertText(container)).toContain(dutch);
    expect(alertText(container)).not.toContain(english);
  });

  it('admin: creating a user', async () => {
    const container = await mount(<AdminPanel />);
    await settle();
    await fill(container, ['carol']);
    await submit(container);
    expect(alertText(container)).toContain(dutch);
    expect(alertText(container)).not.toContain(english);
  });
});

describe('unknown codes fall back to a translated message (#1365)', () => {
  it('a code this client has no wording for uses the status sentence, not the server text', async () => {
    refusal = { status: 409, body: { code: 'brand-new-code', error: 'Some new English sentence' } };
    const container = await mount(<SetupForm />);
    await fill(container, ['alice', 'secret-password', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(NL.statuses[409]);
    expect(alertText(container)).not.toContain('Some new English sentence');
  });

  it('an unknown status with no code uses the generic sentence', async () => {
    refusal = { status: 418, body: { error: 'I am a teapot' } };
    const container = await mount(<SetupForm />);
    await fill(container, ['alice', 'secret-password', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(NL.fallback);
    expect(alertText(container)).not.toContain('I am a teapot');
  });

  it('a non-JSON answer (a proxy error page) uses the status sentence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))),
    );
    const container = await mount(<SetupForm />);
    await fill(container, ['alice', 'secret-password', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(NL.statuses[500]);
    expect(alertText(container)).not.toContain('Bad gateway');
  });

  it('the same refusal reads in English when the locale is en', async () => {
    setLocale('en');
    refusal = { status: 429, body: { code: 'rate-limited', error: 'ignored server text' } };
    const container = await mount(<SetupForm />);
    await fill(container, ['alice', 'secret-password', 'secret-password']);
    await submit(container);
    expect(alertText(container)).toContain(EN.codes['rate-limited']);
  });
});
