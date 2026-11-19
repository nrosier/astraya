// @vitest-environment jsdom
/**
 * The sidebar rail's footer collapse button (#1747): toggling writes the device preference to
 * localStorage, aria-expanded and the accessible name flip with it, the control is a plain
 * `type="button"`, and the Dutch labels are present.
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
  it('is a plain button type and starts expanded with the Collapse label', () => {
    const button = mount();
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Collapse sidebar');
    expect(button.textContent).toBe('Collapse');
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
    expect(railCollapseButtonMessages.nl.collapseLabel).toBe('Samenvouwen');
    expect(railCollapseButtonMessages.nl.collapseAria).toBe('Zijbalk samenvouwen');
    expect(railCollapseButtonMessages.nl.expandAria).toBe('Zijbalk uitvouwen');
    expect(Object.keys(railCollapseButtonMessages.nl).sort()).toEqual(
      Object.keys(railCollapseButtonMessages.en).sort(),
    );

    setLocale('nl');
    const button = mount();
    expect(button.getAttribute('aria-label')).toBe('Zijbalk samenvouwen');
    expect(button.textContent).toBe('Samenvouwen');
  });
});
