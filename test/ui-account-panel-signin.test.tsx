// @vitest-environment jsdom
/**
 * The sign-in panel (#651, #781): when single sign-on is configured the dialog opens on an OpenID stage and swaps
 * to the local username and password stage (and back) without a reload. Without single sign-on there is no
 * choice to make, and the panel is the plain username and password form it has always been.
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

const hasLocalForm = (container: HTMLElement): boolean =>
  container.querySelector('input[autocomplete="username"]') !== null &&
  container.querySelector('input[type="password"]') !== null;

async function click(element: HTMLElement | undefined): Promise<void> {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

async function toLocal(container: HTMLElement): Promise<void> {
  await click(button(container, /Select another login method/));
}

describe('sign-in panel with single sign-on configured (staged, #781)', () => {
  it('opens on the OpenID stage: the OpenID button and the switcher, no local inputs', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    expect(container.querySelector('dialog[open]')).not.toBeNull();
    expect(button(container, /Sign in with OpenID/)).toBeDefined();
    expect(button(container, /Select another login method/)).toBeDefined();
    expect(container.querySelector('input[autocomplete="username"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain('You will go to Authentik to sign in');
  });

  it('swaps to the local stage: inputs, submit and the OpenID switcher, no OpenID button', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    await toLocal(container);
    expect(hasLocalForm(container)).toBe(true);
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
    expect(container.querySelector('button.primitive-button-primary:not([type="submit"])')).toBeNull();
    expect(button(container, /Sign in with OpenID/)).toBeDefined();
    expect(button(container, /Select another login method/)).toBeUndefined();
  });

  it('returns to the OpenID stage from the local stage', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    await toLocal(container);
    await click(button(container, /Sign in with OpenID/));
    expect(hasLocalForm(container)).toBe(false);
    expect(button(container, /Select another login method/)).toBeDefined();
  });

  it('keeps typed credentials across a round trip between stages', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    await toLocal(container);
    await act(async () => {
      type(field(container, 'input[autocomplete="username"]'), 'ada');
      type(field(container, 'input[type="password"]'), 'secret-pass');
      await Promise.resolve();
    });
    await click(button(container, /Sign in with OpenID/));
    await toLocal(container);
    expect(field(container, 'input[autocomplete="username"]').value).toBe('ada');
    expect(field(container, 'input[type="password"]').value).toBe('secret-pass');
  });

  it('submits the typed credentials from the local stage', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    await toLocal(container);
    await act(async () => {
      type(field(container, 'input[autocomplete="username"]'), 'ada');
      type(field(container, 'input[type="password"]'), 'secret-pass');
      await Promise.resolve();
    });
    await click(container.querySelector<HTMLButtonElement>('button[type="submit"]') ?? undefined);
    expect(signIn).toHaveBeenCalledWith('ada', 'secret-pass');
  });

  it('reopens on the OpenID stage after closing from the local stage', async () => {
    const container = await mount(SSO);
    await openPanel(container);
    await toLocal(container);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Close"]') ?? undefined);
    await openPanel(container);
    expect(hasLocalForm(container)).toBe(false);
    expect(button(container, /Select another login method/)).toBeDefined();
  });

  it('clears a sign-in error when switching stages', async () => {
    signIn.mockRejectedValue(new Error('Wrong password'));
    const container = await mount(SSO);
    await openPanel(container);
    await toLocal(container);
    await act(async () => {
      type(field(container, 'input[autocomplete="username"]'), 'ada');
      type(field(container, 'input[type="password"]'), 'nope');
      await Promise.resolve();
    });
    await click(container.querySelector<HTMLButtonElement>('button[type="submit"]') ?? undefined);
    expect(container.textContent).toContain('Wrong password');
    await click(button(container, /Sign in with OpenID/));
    await toLocal(container);
    expect(container.textContent).not.toContain('Wrong password');
  });

  it('starts the redirect to the authorization endpoint with the PKCE fields', async () => {
    const container = await mount(SSO);
    await openPanel(container);
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
      button(container, /Sign in with OpenID/)?.click();
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
    expect(button(container, /Select another login method/)).toBeUndefined();
    expect(button(container, /Sign in with OpenID/)).toBeUndefined();
    expect(container.textContent).not.toContain('Authentik');
    expect(container.textContent).not.toContain('OpenID');
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
