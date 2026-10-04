// @vitest-environment jsdom
/**
 * The header navigation's menus (#421), on a screen with no person (so no store is needed): the
 * Tools dropdown, the Menu button the nav folds behind on a small screen, Escape and page changes
 * closing them, and Admin appearing for an admin only. The person's own tabs need an open store and
 * are covered end to end (`e2e/app-nav.spec.ts`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { parseRoute, type Route } from '../src/ui/route.js';

let admin = false;
const USER = { id: 'u', username: 'root', role: 'admin', isAdmin: true, isSuperAdmin: false };
vi.mock('../src/ui/session-context.js', () => ({
  useSessionUserOrUndefined: () => (admin ? USER : undefined),
}));

// The Export menu asks for the calculation engine; none is needed to open and close menus.
vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { AppNav } = await import('../src/ui/AppNav.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  admin = false;
  setLocale('en');
});

async function mount(route: Route): Promise<(next: Route) => Promise<void>> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next: Route): Promise<void> => {
    await act(async () => {
      root.render(<AppNav route={next} />);
      await Promise.resolve();
    });
  };
  mounted = { container, root };
  await render(route);
  return render;
}

const box = (): HTMLElement => {
  if (mounted === undefined) throw new Error('fixture bug: not mounted');
  return mounted.container;
};
const button = (name: string): HTMLButtonElement => {
  const found = Array.from(box().querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === name || b.textContent === name,
  );
  if (found === undefined) throw new Error(`fixture bug: no button "${name}"`);
  return found;
};
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}
const toolLinks = (): string[] => Array.from(box().querySelectorAll('.app-nav-menu a')).map((a) => a.textContent);

describe('the Tools menu', () => {
  it('is on every screen, closed until opened, and lists the five tools as links', async () => {
    await mount(parseRoute('#/people'));
    expect(box().querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(toolLinks()).toEqual([]);
    expect(button('Tools').getAttribute('aria-expanded')).toBe('false');
    await click(button('Tools'));
    expect(button('Tools').getAttribute('aria-expanded')).toBe('true');
    expect(toolLinks()).toEqual([
      'Planetary cycles',
      'Eclipses',
      'Horary chart',
      'Electional search',
      'Birth-time rectification',
    ]);
    const hrefs = Array.from(box().querySelectorAll('.app-nav-menu a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/cycles', '#/eclipses', '#/horary', '#/electional', '#/rectification']);
  });

  it('closes on Escape, on a click elsewhere, on choosing a tool, and when the page changes', async () => {
    const render = await mount(parseRoute('#/people'));
    await click(button('Tools'));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(toolLinks()).toEqual([]);

    await click(button('Tools'));
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await Promise.resolve();
    });
    expect(toolLinks()).toEqual([]);

    await click(button('Tools'));
    const first = box().querySelector<HTMLElement>('.app-nav-menu a');
    if (first === null) throw new Error('fixture bug: no tool link');
    first.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await click(first);
    expect(toolLinks()).toEqual([]);

    await click(button('Tools'));
    await render(parseRoute('#/cycles'));
    expect(toolLinks()).toEqual([]);
  });

  it('marks the open tool as the current page and highlights the menu that holds it', async () => {
    await mount(parseRoute('#/eclipses'));
    expect(box().querySelector('.app-nav-group')?.classList.contains('active')).toBe(true);
    await click(button('Tools'));
    const current = box().querySelector('.app-nav-menu a[aria-current="page"]');
    expect(current?.textContent).toBe('Eclipses');
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    await mount(parseRoute('#/people'));
    await click(button('Hulpmiddelen'));
    expect(toolLinks()).toContain('Verduisteringen');
    expect(box().querySelector('nav[aria-label="Hoofdmenu"]')).not.toBeNull();
  });
});

describe('the Menu button for a small screen', () => {
  it('opens and closes the nav, naming its state, and Escape closes it', async () => {
    await mount(parseRoute('#/people'));
    const nav = box().querySelector('#app-nav');
    expect(nav?.classList.contains('open')).toBe(false);
    expect(button('Menu').getAttribute('aria-controls')).toBe('app-nav');
    await click(button('Menu'));
    expect(nav?.classList.contains('open')).toBe(true);
    expect(button('Close menu').getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(nav?.classList.contains('open')).toBe(false);
  });

  it('closes when the page changes', async () => {
    const render = await mount(parseRoute('#/people'));
    await click(button('Menu'));
    await render(parseRoute('#/about'));
    expect(box().querySelector('#app-nav')?.classList.contains('open')).toBe(false);
  });
});

describe('Admin in the navigation', () => {
  it('is shown to an admin, highlighted on an admin screen, and absent for everyone else', async () => {
    await mount(parseRoute('#/people'));
    expect(box().querySelector('.app-nav-admin')).toBeNull();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;

    admin = true;
    await mount(parseRoute('#/admin/usage'));
    const link = box().querySelector('.app-nav-admin');
    expect(link?.getAttribute('href')).toBe('#/admin');
    expect(link?.classList.contains('active')).toBe(true);
    expect(link?.getAttribute('aria-current')).toBe('page');
  });
});
