// @vitest-environment jsdom
/**
 * The Back link (#652): it goes through history only when this tab already visited a page inside the app, and
 * otherwise falls back to the screen's own parent. `nav-history` is what tells the two apart, so both are tested
 * together here against jsdom's real history.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackLink } from '../src/ui/BackLink.js';
import { canGoBack, replaceRoute, trackNavigation } from '../src/ui/nav-history.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let stop: (() => void) | undefined;

function go(hash: string): void {
  act(() => {
    window.history.pushState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function mount(fallback: string): HTMLAnchorElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<BackLink fallback={fallback} />);
  });
  const link = container.querySelector('a');
  if (link === null) throw new Error('no link');
  return link;
}

beforeEach(() => {
  // A fresh tab: the entry the test starts on is where the app was entered.
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
    act(() => {
      window.history.back();
    });
  });
});

describe('BackLink', () => {
  it('always has the fallback as its href, so it works without scripts and in a new tab', () => {
    const link = mount('#/people');
    expect(link.getAttribute('href')).toBe('#/people');
    expect(link.textContent).toContain('Back');
  });

  it('on the entry page does not touch history: the click follows the fallback', () => {
    const back = vi.spyOn(window.history, 'back');
    const link = mount('#/people');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      link.dispatchEvent(event);
    });
    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('after navigating inside the app goes back through history instead of the fallback', () => {
    go('#/people/a/charts/natal/wheel');
    go('#/documents');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const link = mount('#/people');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      link.dispatchEvent(event);
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a modified click (new tab) to the browser even inside the app', () => {
    go('#/people/a/charts/natal/wheel');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const link = mount('#/people');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    act(() => {
      link.dispatchEvent(event);
    });
    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
