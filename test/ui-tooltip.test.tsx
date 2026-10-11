// @vitest-environment jsdom
/**
 * The shared Tooltip (#456, #508): one popup that hover, click and keyboard focus all reveal, with the same text.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '../src/ui/primitives/Tooltip.js';

const DEFINITION = 'Ruler (domicile): the planet is in the sign it rules';

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <Tooltip text={DEFINITION} label="About Ruler">
        ?
      </Tooltip>,
    );
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

const trigger = (): HTMLButtonElement => {
  const button = container.querySelector('button');
  if (button === null) throw new Error('test fixture bug: no trigger');
  return button;
};
const popup = (): HTMLElement | null => container.querySelector('[role="tooltip"]');

describe('Tooltip', () => {
  it('is a real button named by its label, closed to begin with', () => {
    expect(trigger().getAttribute('aria-label')).toBe('About Ruler');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(popup()).toBeNull();
  });

  it('shows the same text on keyboard focus, and closes when focus leaves', () => {
    act(() => {
      trigger().focus();
    });
    expect(popup()?.textContent).toBe(DEFINITION);
    expect(trigger().getAttribute('aria-controls')).toBe(popup()?.id);
    act(() => {
      trigger().blur();
    });
    expect(popup()).toBeNull();
  });

  it('shows the same text on hover after a short delay, and hides it when the pointer leaves', () => {
    const wrapper = container.querySelector('.primitive-tooltip');
    act(() => {
      wrapper?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      wrapper?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    // React's `onPointerEnter` is driven by `pointerover`; the delay keeps a passing cursor from flashing it.
    expect(popup()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(popup()?.textContent).toBe(DEFINITION);
    act(() => {
      wrapper?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(popup()).toBeNull();
  });

  it('shows the same text when clicked, keeps it open when the pointer leaves, and closes on Escape or an outside press', () => {
    act(() => {
      trigger().click();
    });
    expect(popup()?.textContent).toBe(DEFINITION);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const wrapper = container.querySelector('.primitive-tooltip');
    act(() => {
      wrapper?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(popup()?.textContent).toBe(DEFINITION);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(popup()).toBeNull();

    act(() => {
      trigger().click();
    });
    expect(popup()).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(popup()).toBeNull();
  });
});
