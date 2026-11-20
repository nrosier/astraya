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

describe('sidebar footer separator spacing (#1850)', () => {
  it('gives the bullet a --space-1 margin on each side, from the real app.css rule', () => {
    const css = readFileSync(resolve(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8');
    const rootBlock = /:root\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    const rule = /\.sidebar-footer-sep\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).not.toBe('');
    const style = document.createElement('style');
    style.textContent = `${rootBlock} ${rule}`;
    document.head.append(style);
    try {
      const container = mount(<SidebarFooter />);
      const sep = container.querySelector<HTMLElement>('.sidebar-footer-meta > span');
      if (sep === null) {
        throw new Error('separator span not rendered');
      }
      const computed = getComputedStyle(sep);
      // jsdom resolves --space-1 (0.25rem) to px against its 16px root size.
      expect(computed.marginInlineStart).toBe('4px');
      expect(computed.marginInlineEnd).toBe('4px');
    } finally {
      style.remove();
    }
  });

  it('keeps the separator hidden from assistive tech and the link names unchanged', () => {
    const container = mount(<SidebarFooter />);
    const sep = container.querySelector('.sidebar-footer-meta > span');
    expect(sep?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('a[href="#/about"]')?.textContent).toBe('About & Licence');
  });
});

describe('main content has no page footer', () => {
  it('App.tsx renders no <footer> element; the footer lives in the sidebar header', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/<footer[\s>]/);
    expect(app).toMatch(/<SidebarFooter \/>/);
  });
});
