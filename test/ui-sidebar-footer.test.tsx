// @vitest-environment jsdom
/**
 * The sidebar footer (ui-sidebar-footer): the version and About & Licence links live at the foot
 * of the sidebar, the update banner is hidden by default, and the main content no longer renders
 * a page `<footer>`. The main-content check reads `App.tsx` directly, since mounting the whole
 * shell needs the ephemeris worker and the open store.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/version.js';
import { setLocale } from '../src/ui/locale.js';
import { SidebarFooter } from '../src/ui/SidebarFooter.js';

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

function mount(element: React.JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(element);
  });
  return container;
}

describe('sidebar footer', () => {
  it('shows the real version string and links to the About & Licence page', () => {
    const container = mount(<SidebarFooter />);
    const footer = container.querySelector('.sidebar-footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain(APP_VERSION);
    const about = footer?.querySelector('a[href="#/about"]');
    expect(about?.textContent).toBe('About & Licence');
    expect(footer?.querySelector('a[href="#/changelog"]')?.textContent).toBe(`Version ${APP_VERSION}`);
  });

  it('keeps the update banner hidden by default', () => {
    const container = mount(<SidebarFooter />);
    const banner = container.querySelector<HTMLElement>('.sidebar-footer-update');
    expect(banner).not.toBeNull();
    expect(banner?.hidden).toBe(true);
  });

  it('shows the banner with a Reload button only when an update is reported', () => {
    const container = mount(<SidebarFooter updateAvailable />);
    const banner = container.querySelector<HTMLElement>('.sidebar-footer-update');
    expect(banner?.hidden).toBe(false);
    expect(banner?.textContent).toContain('New version available');
    expect(banner?.querySelector('button')?.textContent).toBe('Reload');
  });

  it('localises the footer text to Dutch', () => {
    setLocale('nl');
    const container = mount(<SidebarFooter />);
    expect(container.querySelector('a[href="#/about"]')?.textContent).toBe('Over & licentie');
  });
});

describe('main content has no page footer', () => {
  it('App.tsx renders no <footer> element; the footer lives in the sidebar header', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/<footer[\s>]/);
    expect(app).toMatch(/<SidebarFooter \/>/);
  });
});
