// @vitest-environment jsdom
/**
 * The Back link (#652, #1225): one shared link that names the page the reader came from, goes back through history, and
 * is not there at all when this tab entered the app on the current page. `nav-history` records the page behind each
 * position, so both are tested together here against jsdom's real history.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackLink } from '../src/ui/BackLink.js';
import { canGoBack, pageNameFromTitle, previousPage, replaceRoute, trackNavigation } from '../src/ui/nav-history.js';
import { routeShowsBackLink, parseRoute } from '../src/ui/route.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let stop: (() => void) | undefined;

/** Navigates as a link does: the page being left still has its title when the hash changes. */
function go(hash: string, leavingTitle?: string): void {
  if (leavingTitle !== undefined) document.title = leavingTitle;
  act(() => {
    window.history.pushState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function mount(): HTMLAnchorElement | null {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<BackLink />);
  });
  return container.querySelector('a');
}

beforeEach(() => {
  // A fresh tab: the entry the test starts on is where the app was entered.
  window.sessionStorage.clear();
  document.title = 'Documents – Astraya';
  window.history.replaceState(null, '', '#/documents');
  stop = trackNavigation();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  stop?.();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('nav-history', () => {
  it('has nowhere to go back to on the entry page, and has after one in-app navigation', () => {
    expect(canGoBack()).toBe(false);
    expect(previousPage()).toBeUndefined();
    go('#/people/a/charts/natal/wheel');
    expect(canGoBack()).toBe(true);
  });

  it('does not count an in-place view change as a page', () => {
    act(() => {
      replaceRoute('#/documents?view=2');
    });
    expect(canGoBack()).toBe(false);
    go('#/people/a/charts/natal/wheel');
    act(() => {
      replaceRoute('#/people/a/charts/natal/aspects');
    });
    // one real navigation happened; the view switch after it added nothing
    expect(canGoBack()).toBe(true);
    expect(previousPage()?.href).toBe('#/documents?view=2');
    act(() => {
      window.history.back();
    });
  });

  it('records the page left, by its tab title without the app name', () => {
    go('#/people/a/consultation', 'Consultation – Astraya');
    expect(previousPage()).toEqual({ href: '#/documents', name: 'Consultation' });
    go('#/people/a/charts/natal/wheel', 'Consultation · Ada – Astraya');
    expect(previousPage()).toEqual({ href: '#/people/a/consultation', name: 'Consultation · Ada' });
  });

  it('keeps the record across a reload of the tab, and has no page for a position it never saw', () => {
    go('#/people/a/consultation', 'Documents – Astraya');
    stop?.();
    stop = trackNavigation();
    expect(previousPage()?.name).toBe('Documents');
    window.sessionStorage.clear();
    stop();
    stop = trackNavigation();
    expect(canGoBack()).toBe(true);
    expect(previousPage()).toBeUndefined();
  });

  it('reads a page name from a title, and none from the bare app name', () => {
    expect(pageNameFromTitle('Natal · Ada – Astraya')).toBe('Natal · Ada');
    expect(pageNameFromTitle('Astraya')).toBeUndefined();
    expect(pageNameFromTitle('')).toBeUndefined();
  });
});

describe('BackLink', () => {
  it('renders nothing on the page this tab entered the app on', () => {
    expect(mount()).toBeNull();
  });

  it('says ← and the name of the page the reader came from, and links to it', () => {
    go('#/people/a/consultation', 'Consultation – Astraya');
    const link = mount();
    expect(link?.textContent).toBe('← Consultation');
    expect(link?.getAttribute('href')).toBe('#/documents');
  });

  it('says Back when the page behind set no title', () => {
    go('#/people/a/consultation', 'Astraya');
    expect(mount()?.textContent).toBe('← Back');
  });

  it('goes back through history on a plain click', () => {
    go('#/people/a/consultation', 'Documents – Astraya');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const link = mount();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      link?.dispatchEvent(event);
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a modified click (new tab) to the browser', () => {
    go('#/people/a/charts/natal/wheel', 'Documents – Astraya');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const link = mount();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    act(() => {
      link?.dispatchEvent(event);
    });
    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('where the shell shows the Back link (#1225)', () => {
  it('shows it on every screen except the places of their own', () => {
    for (const kind of ['home', 'people', 'documents', 'preferences'] as const) {
      expect(routeShowsBackLink({ kind })).toBe(false);
    }
    for (const kind of ['about', 'changelog', 'admin', 'cycles', 'eclipses', 'electional'] as const) {
      expect(routeShowsBackLink({ kind })).toBe(true);
    }
    expect(routeShowsBackLink({ kind: 'consultation', personId: 'a' })).toBe(true);
    expect(routeShowsBackLink(parseRoute('#/about'))).toBe(true);
    expect(routeShowsBackLink(parseRoute('#/people'))).toBe(false);
  });
});

describe('one shared place (#1225)', () => {
  it('is rendered by the app shell alone, not by any screen, and takes no label', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'ui');
    const users = readdirSync(dir)
      .filter((file) => file.endsWith('.tsx') && file !== 'BackLink.tsx')
      .filter((file) => readFileSync(join(dir, file), 'utf8').includes('<BackLink'));
    expect(users).toEqual(['App.tsx']);
    expect(readFileSync(join(dir, 'BackLink.tsx'), 'utf8')).not.toMatch(/readonly (label|fallback)/);
  });
});
