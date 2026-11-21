// @vitest-environment jsdom
/**
 * The sidebar rail's header collapse toggle (#1747, #1851): toggling writes the device preference to
 * localStorage, aria-expanded and the accessible name flip with it, the control is a plain
 * `type="button"`, and the Dutch labels are present. It is icon only, carries a short styled tooltip
 * sibling in both states (never a `title`), which Escape dismisses (owner decisions, 2026-11-20).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { RailCollapseButton } from '../src/ui/RailCollapseButton.js';
import { railCollapseButtonMessages } from '../src/ui/RailCollapseButton.messages.js';
import { readRailCollapsed } from '../src/ui/workspace-rail-setting.js';

const KEY = 'astraya:workspaceRailCollapsed';

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  localStorage.removeItem(KEY);
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.removeItem(KEY);
  setLocale('en');
});

function mount(): HTMLButtonElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(<RailCollapseButton />);
  });
  const button = container.querySelector('button');
  if (button === null) throw new Error('RailCollapseButton rendered no button');
  return button;
}

describe('RailCollapseButton', () => {
  it('is a plain button type and starts expanded, icon only', () => {
    const button = mount();
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Collapse sidebar');
    expect(button.textContent).toBe('');
    expect(button.parentElement?.querySelector('[role="tooltip"]')?.textContent).toBe('Collapse');
  });

  it('renders the rest icon and the active icon in both states, and no title', () => {
    for (const collapsedValue of [false, true]) {
      localStorage.setItem(KEY, String(collapsedValue));
      const button = mount();
      expect(button.querySelectorAll('.rail-toggle-icon-rest svg')).toHaveLength(1);
      expect(button.querySelectorAll('.rail-toggle-icon-active svg')).toHaveLength(1);
      expect(button.hasAttribute('title')).toBe(false);
      expect(button.parentElement?.hasAttribute('title')).toBe(false);
      act(() => {
        mounted?.root.unmount();
      });
      mounted?.container.remove();
      mounted = undefined;
    }
  });

  it('toggling writes localStorage and flips aria-expanded and the label', () => {
    const button = mount();

    act(() => {
      button.click();
    });
    expect(localStorage.getItem(KEY)).toBe('true');
    expect(readRailCollapsed()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Expand sidebar');
    expect(button.textContent).toBe('');
    expect(button.parentElement?.querySelector('[role="tooltip"]')?.textContent).toBe('Expand');

    act(() => {
      button.click();
    });
    expect(localStorage.getItem(KEY)).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Collapse sidebar');
  });

  it('reads a collapsed preference from localStorage on mount', () => {
    localStorage.setItem(KEY, 'true');
    const button = mount();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Expand sidebar');
  });

  it('carries Dutch labels with parity between locales', () => {
    expect(railCollapseButtonMessages.nl.collapseTip).toBe('Samenvouwen');
    expect(railCollapseButtonMessages.nl.expandTip).toBe('Uitvouwen');
    expect(railCollapseButtonMessages.nl.collapseAria).toBe('Zijbalk samenvouwen');
    expect(railCollapseButtonMessages.nl.expandAria).toBe('Zijbalk uitvouwen');
    expect(Object.keys(railCollapseButtonMessages.nl).sort()).toEqual(
      Object.keys(railCollapseButtonMessages.en).sort(),
    );

    setLocale('nl');
    const button = mount();
    expect(button.getAttribute('aria-label')).toBe('Zijbalk samenvouwen');
    expect(button.parentElement?.querySelector('[role="tooltip"]')?.textContent).toBe('Samenvouwen');
  });

  it('expanded, carries a Collapse tooltip beside the button, not inside it', () => {
    const button = mount();
    const tooltip = button.parentElement?.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toBe('Collapse');
    expect(tooltip?.classList.contains('rail-nav-tooltip')).toBe(true);
    expect(button.contains(tooltip ?? null)).toBe(false);
  });

  it('collapsed, carries an Expand tooltip beside the button, not inside it', () => {
    localStorage.setItem(KEY, 'true');
    const button = mount();
    const wrapper = button.parentElement;
    expect(wrapper?.classList.contains('rail-nav-item')).toBe(true);
    const tooltip = wrapper?.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toBe('Expand');
    expect(tooltip?.classList.contains('rail-nav-tooltip')).toBe(true);
    expect(button.contains(tooltip ?? null)).toBe(false);
    expect(button.textContent).toBe('');
  });

  it('Escape dismisses the tooltip and blur brings it back', () => {
    localStorage.setItem(KEY, 'true');
    const button = mount();
    const wrapper = button.parentElement;
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(wrapper?.getAttribute('data-tooltip-dismissed')).toBe('true');
    act(() => {
      button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(wrapper?.hasAttribute('data-tooltip-dismissed')).toBe(false);
  });

  it('collapsed, shows the Dutch tooltip in Dutch', () => {
    localStorage.setItem(KEY, 'true');
    setLocale('nl');
    const button = mount();
    expect(button.parentElement?.querySelector('[role="tooltip"]')?.textContent).toBe('Uitvouwen');
  });
});
