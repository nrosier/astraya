// @vitest-environment jsdom
/**
 * Keyboard reachability of the sub-view tabs of every multi-view person section (#882, #1175): the tab bar has one
 * tab in the tab order, and the arrow keys, Home and End open the sub-view they land on at its unchanged route.
 * Covers Transits & Forecast, Progressions & Directions and Relationship Charts; Tools is checked in
 * ui-tools-layout.test.tsx (#1139).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRoute } from '../src/ui/route.js';
import { PersonSectionLayout } from '../src/ui/SectionLayout.js';
import { sectionTabsFor } from '../src/ui/SectionNav.js';

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
    root.render(
      <PersonSectionLayout route={parseRoute(href)}>
        <main />
      </PersonSectionLayout>,
    );
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
];

describe('section sub-view tabs are keyboard reachable (#882, #1175)', () => {
  for (const section of SECTIONS) {
    it(`${section.name}: one tab in tab order, and arrow, Home and End keys open the sub-views`, async () => {
      const box = await mount(section.href);
      const found = sectionTabsFor(parseRoute(section.href));
      if (found === null) throw new Error('fixture bug: not a section route');
      const tabs = found.tabs;
      const openIndex = tabs.findIndex((tab) => tab.key === found.activeKey);
      const strip = box.querySelector('[role="tablist"]');
      if (strip === null) throw new Error('fixture bug: no tablist');
      expect(box.querySelectorAll('[role="tab"]')).toHaveLength(tabs.length);
      expect(
        Array.from(box.querySelectorAll<HTMLElement>('[role="tab"]')).filter((tab) => tab.tabIndex === 0),
      ).toHaveLength(1);

      press(strip, 'End');
      expect(window.location.hash).toBe(tabs[tabs.length - 1]?.href);
      press(strip, 'Home');
      expect(window.location.hash).toBe(tabs[0]?.href);
      // The open sub-view is what an arrow key moves from, so Home then ArrowRight lands on the second tab only
      // when the open one is the first; here the open tab decides.
      press(strip, 'ArrowRight');
      expect(window.location.hash).toBe(tabs[(openIndex + 1) % tabs.length]?.href);
    });
  }
});
