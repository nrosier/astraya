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
import { writeLastPersonId } from '../src/ui/last-person.js';
import { setLocale } from '../src/ui/locale.js';
import { parseRoute, type Route } from '../src/ui/route.js';

// The Export menu asks for the calculation engine; none is needed to open and close menus.
vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

// The person's tabs read the open store (#914 tests); with no store, `fakeStore.current` stays undefined
// and the nav behaves as it does on a fresh device, so the other cases in this file are unaffected.
const fakeStore = vi.hoisted(() => ({
  current: undefined as { state: { people: ReadonlyMap<string, { displayName: string }> } } | undefined,
}));
vi.mock('../src/ui/store-context.js', () => ({
  useOptionalStore: () => fakeStore.current,
  useStoreState: () => {
    if (fakeStore.current === undefined) throw new Error('fixture bug: no fake store');
    return fakeStore.current.state;
  },
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

describe('the person sections on a route with no person (#914)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
  });

  const openStoreWithPerson = (personId: string): void => {
    fakeStore.current = { state: { people: new Map([[personId, { displayName: 'Test' }]]) } };
  };

  it('shows the last-viewed person sections on the Documents route', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    await mount(parseRoute('#/documents'));
    expect(linkNamed('Overview')?.getAttribute('href')).toBe('#/people/p-abcdefghijklmnop/overview');
    expect(linkNamed('PDF')?.getAttribute('aria-current')).toBe('page');
    // The person is the way back here, not the subject, so the "return to" heading shows (as on tool pages).
    expect(box().querySelector('nav#app-nav .app-nav-history')).not.toBeNull();
  });

  it('shows no person sections on the Documents route when no person was viewed', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    await mount(parseRoute('#/documents'));
    expect(linkNamed('Overview')).toBeUndefined();
    expect(box().querySelector('nav#app-nav .app-nav-history')).toBeNull();
  });

  it('shows no person sections on the People list even when a person was viewed', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    await mount(parseRoute('#/people'));
    expect(linkNamed('Overview')).toBeUndefined();
  });

  it('shows the person sections on the Documents route in English and in Dutch (#914)', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    const render = await mount(parseRoute('#/documents'));
    expect(navLinks()).toContain('Overview');
    expect(navLinks()).toContain('Birth record');
    expect(linkNamed('PDF')?.getAttribute('aria-current')).toBe('page');

    setLocale('nl');
    await render(parseRoute('#/documents'));
    expect(navLinks()).toContain('Overzicht');
    expect(navLinks()).toContain('Geboortegegevens');
    expect(navLinks()).toContain('Hulpmiddelen');
    expect(linkNamed('PDF')?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps the sidebar section list identical on a person page and on the Documents route (#914)', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    const render = await mount(parseRoute('#/people/p-abcdefghijklmnop/overview'));
    const onPerson = navLinks();
    expect(onPerson).toContain('Overview');

    await render(parseRoute('#/documents'));
    expect(navLinks()).toEqual(onPerson);

    await render(parseRoute('#/people/p-abcdefghijklmnop/birth-record'));
    expect(navLinks()).toEqual(onPerson);
  });
});
