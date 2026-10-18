// @vitest-environment jsdom
/**
 * The sign-in panel (#651): when single sign-on is configured it opens on a choice between a local account and
 * Authentik, and each choice shows only its own path. Without single sign-on there is no choice to make, and the
 * panel is the plain username and password form it has always been.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn<(username: string, password: string) => Promise<void>>();
vi.mock('../src/ui/session-context.tsx', () => ({
  useSession: () => ({
    user: undefined,
    adoption: undefined,
    signIn,
    setup: vi.fn(),
    signOut: vi.fn(),
    resolveAdoption: vi.fn(),
  }),
  removeAccountData: vi.fn(),
}));
vi.mock('../src/ui/oidc-pkce.ts', () => ({
  startOidcHandshake: () =>
    Promise.resolve({ state: 's', nonce: 'n', codeChallenge: 'c', redirectUri: 'http://x/auth/oidc/callback' }),
}));

import { AccountPanel } from '../src/ui/AccountPanel.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SSO = {
  enabled: true,
  issuer: 'https://auth.example',
  clientId: 'astraya',
  authorizationEndpoint: 'https://auth.example/authorize',
};

let root: Root | undefined;

async function mount(oidc: unknown): Promise<HTMLElement> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(oidc), { status: 200 }))),
  );
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<AccountPanel />);
    await Promise.resolve();
  });
  return container;
}

function field(container: HTMLElement, selector: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

/** React tracks an input's value itself, so assigning `input.value` goes unseen: write through the prototype's setter. */
function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.bind(input);
  if (setter === undefined) throw new Error('no value setter');
  setter(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const button = (container: HTMLElement, name: string | RegExp): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button')).find((candidate) =>
    typeof name === 'string' ? candidate.textContent === name : name.test(candidate.textContent),
  );

async function openPanel(container: HTMLElement): Promise<void> {
  await act(async () => {
    button(container, 'Sign in')?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  signIn.mockReset();
  signIn.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('sign-in panel with single sign-on configured', () => {
  it('opens on the choice, with no credentials fields and no Authentik button yet', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('How do you want to sign in?');
    expect(group?.textContent).toContain('Local account');
    expect(group?.textContent).toContain('Authentik');
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(button(container, /Continue to Authentik/)).toBeUndefined();
  });

  it('shows only the username and password form after picking a local account, with a way back', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    const local = Array.from(container.querySelectorAll('input[type="radio"]'))[0] as HTMLInputElement;
    await act(async () => {
      local.click();
      await Promise.resolve();
    });
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(button(container, /Continue to Authentik/)).toBeUndefined();
    await act(async () => {
      button(container, /Choose another way/)?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('shows no credentials fields after picking Authentik, only a button that says where it goes', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    const sso = Array.from(container.querySelectorAll('input[type="radio"]'))[1] as HTMLInputElement;
    await act(async () => {
      sso.click();
      await Promise.resolve();
    });
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.textContent).toContain('You will go to Authentik to sign in');
    expect(button(container, 'Continue to Authentik')).toBeDefined();
  });

  it('starts the redirect to the authorization endpoint with the PKCE fields', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    const sso = Array.from(container.querySelectorAll('input[type="radio"]'))[1] as HTMLInputElement;
    await act(async () => {
      sso.click();
      await Promise.resolve();
    });
    const submitted: { action: string; fields: Record<string, string> }[] = [];
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      submitted.push({
        action: this.action,
        fields: Object.fromEntries(
          Array.from(this.querySelectorAll('input')).map((input) => [input.name, input.value]),
        ),
      });
    });
    await act(async () => {
      button(container, 'Continue to Authentik')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.action).toBe('https://auth.example/authorize');
    expect(submitted[0]?.fields).toMatchObject({
      client_id: 'astraya',
      code_challenge_method: 'S256',
      scope: 'openid profile',
    });
  });
});

describe('sign-in panel without single sign-on', () => {
  it('goes straight to the username and password form: there is no choice to make', async () => {
    const container = await mount({ enabled: false });
    await openPanel(container);
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(button(container, /Choose another way/)).toBeUndefined();
    expect(container.textContent).not.toContain('Authentik');
  });

  it('signs in with the typed credentials', async () => {
    const container = await mount({ enabled: false });
    await openPanel(container);
    const user = field(container, 'input[autocomplete="username"]');
    const pass = field(container, 'input[type="password"]');
    await act(async () => {
      type(user, 'ada');
      type(pass, 'secret-pass');
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(signIn).toHaveBeenCalledWith('ada', 'secret-pass');
  });
});
