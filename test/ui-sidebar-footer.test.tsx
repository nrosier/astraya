// @vitest-environment jsdom
/**
 * The sidebar footer (ui-sidebar-footer): the version and About & Licence links live at the foot
 * of the sidebar, the update prompt is not shown there (the bottom banner owns it, #1331), and the
 * main content no longer renders a page `<footer>`. The main-content check reads `App.tsx` directly, since mounting the whole
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

  it('renders no update block: the update prompt lives only in the bottom banner (#1331)', () => {
    const container = mount(<SidebarFooter />);
    expect(container.querySelector('.sidebar-footer-update')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('.sidebar-footer')?.textContent).not.toContain('New version available');
    expect(container.querySelector('.sidebar-footer button')).toBeNull();
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
