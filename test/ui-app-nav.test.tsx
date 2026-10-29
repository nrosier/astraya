// @vitest-environment jsdom
/**
 * The header navigation (#421, #882), on a screen with no person (so no store is needed): the
 * Tools entry (one link, no sub-menu) and the Menu button the nav folds behind on a small screen, with Escape and page
 * changes closing them. Admin is reached from the account area on the top bar, not from here
 * (#443), so it is not this file's concern. The person's own tabs need an open store and are
 * covered end to end (`e2e/app-nav.spec.ts`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { parseRoute, type Route } from '../src/ui/route.js';

// The Export menu asks for the calculation engine; none is needed to open and close menus.
vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { AppNav } = await import('../src/ui/AppNav.js');
const { appNavMessages } = await import('../src/ui/AppNav.messages.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
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
const navLinks = (): string[] => Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => a.textContent);
const linkNamed = (name: string): HTMLAnchorElement | undefined =>
  Array.from(box().querySelectorAll('a')).find((a) => a.textContent === name);

describe('the sidebar sections (#882)', () => {
  it('has Tools as one link to the first tool, on every screen, with no sub-menu markup', async () => {
    await mount(parseRoute('#/people'));
    expect(box().querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(box().querySelector('.app-nav-group, .app-nav-menu, .app-nav-group-toggle')).toBeNull();
    expect(Array.from(box().querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Menu']);
    expect(linkNamed('Tools')?.getAttribute('href')).toBe('#/explore/cycles');
    expect(navLinks()).toEqual(['Tools', 'PDF']);
  });

  it('marks Tools as the current page on any tool, and not elsewhere', async () => {
    const render = await mount(parseRoute('#/explore/eclipses'));
    expect(linkNamed('Tools')?.getAttribute('aria-current')).toBe('page');
    expect(linkNamed('Tools')?.classList.contains('active')).toBe(true);
    await render(parseRoute('#/about'));
    expect(linkNamed('Tools')?.getAttribute('aria-current')).toBeNull();
  });

  it('closes the folded menu when Tools is chosen', async () => {
    await mount(parseRoute('#/people'));
    await click(button('Menu'));
    const tools = linkNamed('Tools');
    if (tools === undefined) throw new Error('fixture bug: no Tools link');
    tools.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await click(tools);
    expect(box().querySelector('#app-nav')?.classList.contains('open')).toBe(false);
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    await mount(parseRoute('#/people'));
    expect(navLinks()).toEqual(['Hulpmiddelen', 'PDF']);
    expect(box().querySelector('nav[aria-label="Hoofdmenu"]')).not.toBeNull();
  });

  it('labels the Documents entry PDF in English and Dutch, keeping the documents route', async () => {
    await mount(parseRoute('#/people'));
    expect(linkNamed('PDF')?.getAttribute('href')).toBe('#/documents');
    expect(appNavMessages.en.documents).toBe('PDF');
    expect(appNavMessages.nl.documents).toBe('PDF');
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
