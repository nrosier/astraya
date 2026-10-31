// @vitest-environment jsdom
/**
 * Keyboard reachability of the sub-view tabs of every multi-view sidebar section (#882): Tab moves focus
 * onto the section's tab row, and the arrow keys move between its tabs and activate the one they land on.
 * Covers Transits & Forecast, Progressions & Directions, Relationship Charts and Tools.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRoute } from '../src/ui/route.js';
import { SectionNav } from '../src/ui/SectionNav.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  window.location.hash = '';
});

async function mount(href: string): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<SectionNav route={parseRoute(href)} />);
    await Promise.resolve();
  });
  return container;
}

function press(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

const SECTIONS: readonly { readonly name: string; readonly href: string }[] = [
  { name: 'Transits & Forecast', href: '#/people/p-abcdefghijklmnop/timing/transits' },
  { name: 'Progressions & Directions', href: '#/people/p-abcdefghijklmnop/timing/profections' },
  { name: 'Relationship Charts', href: '#/people/p-abcdefghijklmnop/relationships/synastry' },
  { name: 'Tools', href: '#/explore/cycles' },
];

describe('section sub-view tabs are keyboard reachable (#882)', () => {
  for (const section of SECTIONS) {
    it(`${section.name}: Tab reaches the tab row, and arrow keys move between and activate its tabs`, async () => {
      const box = await mount(section.href);
      const tabs = Array.from(box.querySelectorAll<HTMLAnchorElement>('nav a'));
      expect(tabs.length).toBeGreaterThan(1);

      // Every tab is in the sequential focus order, so a Tab press can land on the row.
      for (const tab of tabs) expect(tab.tabIndex).toBeGreaterThanOrEqual(0);
      const first = tabs[0];
      if (first === undefined) throw new Error('fixture bug: no tabs');
      act(() => {
        first.focus();
      });
      expect(document.activeElement).toBe(first);

      // ArrowRight walks forward through the tabs, activating each one it lands on.
      for (let index = 1; index < tabs.length; index += 1) {
        const target = tabs[index];
        if (target === undefined) throw new Error('fixture bug: missing tab');
        press(document.activeElement ?? first, 'ArrowRight');
        expect(document.activeElement).toBe(target);
        expect(window.location.hash).toBe(target.getAttribute('href'));
      }

      // ArrowRight wraps to the first tab, ArrowLeft steps back, and Home/End jump to the ends.
      press(document.activeElement ?? first, 'ArrowRight');
      expect(document.activeElement).toBe(first);
      expect(window.location.hash).toBe(first.getAttribute('href'));
      press(document.activeElement ?? first, 'ArrowLeft');
      expect(document.activeElement).toBe(tabs[tabs.length - 1]);
      press(document.activeElement ?? first, 'Home');
      expect(document.activeElement).toBe(first);
      press(document.activeElement ?? first, 'End');
      expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    });
  }
});
