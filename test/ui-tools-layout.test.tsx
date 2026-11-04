// @vitest-environment jsdom
/**
 * The Tools frame (#1139): a "Tools" h1, a Tabs bar with one tab per tool (roving tabindex, arrow/Home/End keys
 * that open the tool at its unchanged route), the open tool in the tab panel, and a labelled Select in a
 * navigation landmark for narrow screens.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ToolsLayout } from '../src/ui/ToolsLayout.js';
import { TOOLS } from '../src/ui/tools-nav.js';

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

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <ToolsLayout active="cycles">
        <h2>Planetary cycles</h2>
      </ToolsLayout>,
    );
  });
  return container;
}

function press(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('ToolsLayout (#1139)', () => {
  it('has a Tools h1, one tab per tool, and the open tool in the tab panel', () => {
    const box = mount();
    expect(box.querySelector('h1')?.textContent).toBe('Tools');
    const tabs = Array.from(box.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs).toHaveLength(TOOLS.length);
    expect(box.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual(tabs.map((_, index) => (index === 0 ? 0 : -1)));
    expect(box.querySelector('#tools-panel-cycles h2')?.textContent).toBe('Planetary cycles');
    expect(tabs[0]?.getAttribute('aria-controls')).toBe('tools-panel-cycles');
    expect(box.querySelector('nav[aria-label="Tools subtabs"]')).not.toBeNull();
  });

  it('arrow, Home and End keys open the tool at its unchanged route', () => {
    const box = mount();
    const strip = box.querySelector('[role="tablist"]');
    if (strip === null) throw new Error('fixture bug: no tablist');
    press(strip, 'ArrowRight');
    expect(window.location.hash).toBe(TOOLS[1]?.href);
    press(strip, 'End');
    expect(window.location.hash).toBe(TOOLS[TOOLS.length - 1]?.href);
    press(strip, 'ArrowLeft');
    expect(window.location.hash).toBe(TOOLS[TOOLS.length - 1]?.href);
  });
});
