// @vitest-environment jsdom
/**
 * The sidebar profile tile and its popover (#964): the tile is the one ARIA popup trigger for the
 * account area, and the popover holds Preferences, Admin Panel (admins only), the segmented
 * language and theme controls (which apply immediately and keep the popover open), and Sign out.
 * Escape and an outside press close it, Escape returning focus to the tile.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/sync/auth-client.js';
import { setLocale } from '../src/ui/locale.js';
import { ProfileTile } from '../src/ui/ProfileTile.js';

// The sync dot needs a session provider and a server (see ui-syncbadge.test.tsx); here only its place in the tile matters.
vi.mock('../src/ui/SyncBadge.js', () => ({
  SyncBadge: ({ initial }: { initial?: string }) => (
    <div className="syncbadge">
      <button type="button" className="syncbadge-trigger" aria-label="stub">
        {initial}
      </button>
    </div>
  ),
}));

const ADMIN: AuthUser = {
  id: 'u-admin',
  username: 'nick',
  role: 'admin',
  isAdmin: true,
  isSuperAdmin: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  disabledAt: null,
};
const PLAIN_USER: AuthUser = { ...ADMIN, id: 'u-plain', username: 'mara', role: 'user', isAdmin: false };

let mounted: { container: HTMLElement; root: Root } | undefined;

function mount(props: {
  user: AuthUser | undefined;
  onSignIn?: () => void;
  onSignOut?: () => Promise<void>;
}): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <ProfileTile
        user={props.user}
        onSignIn={props.onSignIn ?? vi.fn()}
        onSignOut={props.onSignOut ?? vi.fn(() => Promise.resolve())}
        onSignedOut={vi.fn()}
      />,
    );
  });
  return container;
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

function trigger(container: HTMLElement): HTMLButtonElement {
  return required(
    container.querySelector<HTMLButtonElement>('.profile-tile, .profile-tile-menu'),
    'profile tile trigger',
  );
}

function openMenu(container: HTMLElement): void {
  act(() => {
    trigger(container).click();
  });
}

function popover(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.profile-popover');
}

beforeEach(() => {
  setLocale('en');
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  setLocale('en');
});

describe('profile tile trigger (ARIA)', () => {
  it('is a popup trigger that reports whether its popover is open', () => {
    const container = mount({ user: ADMIN });
    expect(trigger(container).getAttribute('aria-haspopup')).toBe('true');
    expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
    openMenu(container);
    expect(trigger(container).getAttribute('aria-expanded')).toBe('true');
    expect(popover(container)).not.toBeNull();
  });

  it('shows the display name and an admin role badge in the tile, and hands the avatar initial to the sync button', () => {
    const container = mount({ user: ADMIN });
    const text = trigger(container).textContent;
    expect(text).not.toContain('N');
    expect(container.querySelector('.syncbadge-trigger')?.textContent).toBe('N');
    expect(text).toContain('nick');
    expect(text).toContain('Admin');
    expect(container.querySelector('.profile-tile-kebab')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows one Sign in button for a guest, with a separate menu trigger and no role badge', () => {
    const container = mount({ user: undefined });
    const signIn = required(container.querySelector<HTMLButtonElement>('.profile-tile-guest'), 'guest Sign in');
    expect(signIn.textContent).toBe('Sign in');
    expect(signIn.getAttribute('aria-haspopup')).toBeNull();
    expect(container.textContent).not.toContain('Admin');
    const menu = required(container.querySelector<HTMLButtonElement>('.profile-tile-menu'), 'guest menu trigger');
    expect(menu.getAttribute('aria-haspopup')).toBe('true');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('profile popover', () => {
  it('closes on Escape and returns focus to the tile', () => {
    const container = mount({ user: PLAIN_USER });
    openMenu(container);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(popover(container)).toBeNull();
    expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger(container));
  });

  it('closes on a press outside the panel', () => {
    const container = mount({ user: PLAIN_USER });
    openMenu(container);
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(popover(container)).toBeNull();
  });

  it('stays open on a press inside the panel', () => {
    const container = mount({ user: PLAIN_USER });
    openMenu(container);
    act(() => {
      popover(container)?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(popover(container)).not.toBeNull();
  });

  it('links to Preferences for every user', () => {
    const container = mount({ user: PLAIN_USER });
    openMenu(container);
    const prefs = required(
      popover(container)?.querySelector<HTMLAnchorElement>('a[href="#/preferences"]'),
      'Preferences link',
    );
    expect(prefs.textContent).toBe('Preferences');
  });

  it('shows Admin Panel only to administrative roles', () => {
    const plain = mount({ user: PLAIN_USER });
    openMenu(plain);
    expect(popover(plain)?.querySelector('a[href="#/admin"]')).toBeNull();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;

    const admin = mount({ user: ADMIN });
    openMenu(admin);
    const link = required(popover(admin)?.querySelector<HTMLAnchorElement>('a[href="#/admin"]'), 'Admin Panel link');
    expect(link.textContent).toBe('Admin Panel');
  });

  it('offers the identity header with the display name, the role and a separator', () => {
    const container = mount({ user: ADMIN });
    openMenu(container);
    const header = required(
      popover(container)?.querySelector<HTMLElement>('.profile-popover-identity'),
      'identity header',
    );
    expect(header.textContent).toContain('nick');
    expect(header.textContent).toContain('Admin');
    // The separator that closes the identity block is a sibling of it, not inside it.
    expect(popover(container)?.querySelector('.profile-popover-separator')).not.toBeNull();
  });

  it('calls signOut from the Sign out action', async () => {
    const onSignOut = vi.fn(() => Promise.resolve());
    const container = mount({ user: PLAIN_USER, onSignOut });
    openMenu(container);
    const signOut = required(
      Array.from(popover(container)?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Sign out'),
      'Sign out button',
    );
    await act(async () => {
      signOut.click();
      await Promise.resolve();
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('opens the sign-in dialog from the guest Sign in button', () => {
    const onSignIn = vi.fn();
    const container = mount({ user: undefined, onSignIn });
    act(() => {
      required(container.querySelector<HTMLButtonElement>('.profile-tile-guest'), 'guest Sign in').click();
    });
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(popover(container)).toBeNull();
  });

  it('gives a guest Preferences from the menu trigger', () => {
    const container = mount({ user: undefined });
    act(() => {
      required(container.querySelector<HTMLButtonElement>('.profile-tile-menu'), 'guest menu trigger').click();
    });
    expect(popover(container)?.querySelector('a[href="#/preferences"]')).not.toBeNull();
  });
});

describe('the popover holds no language or theme control (#1183)', () => {
  it('has no theme or language radiogroup, and shows only identity, Preferences, Admin Panel and the account action', () => {
    const container = mount({ user: ADMIN });
    openMenu(container);
    const popover = container.querySelector('.profile-popover');
    if (popover === null) throw new Error('fixture bug: no popover');
    expect(popover.querySelector('[role="radiogroup"], [role="radio"], input[type="radio"]')).toBeNull();
    expect(popover.querySelector('.profile-popover-identity')).not.toBeNull();
    expect(Array.from(popover.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['Preferences', 'Admin Panel']);
    expect(Array.from(popover.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Sign out']);
  });

  it('carries the sync dot as a sibling of the tile button, never inside it', () => {
    const container = mount({ user: ADMIN });
    const dot = container.querySelector('.syncbadge-trigger');
    expect(dot).not.toBeNull();
    expect(dot?.closest('.profile-tile')).toBeNull();
  });
});

describe('footer pills are removed in favour of the profile tile (#964)', () => {
  it('App.tsx no longer mounts the footer language or theme toggle or the Preferences pill', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/<LanguageToggle\b/);
    expect(app).not.toMatch(/<ThemeToggle\b/);
    expect(app).not.toMatch(/className=\{parsed\.kind === 'preferences' \? 'corner-pill/);
  });

  it('AccountPanel mounts the profile tile and renders no standalone Admin or Sign out pill', () => {
    const panel = readFileSync(resolve(import.meta.dirname, '..', 'src', 'ui', 'AccountPanel.tsx'), 'utf8');
    expect(panel).toMatch(/<ProfileTile\b/);
    expect(panel).not.toMatch(/manageUsersLink/);
    expect(panel).not.toMatch(/className="corner-pill quiet"/);
  });
});
