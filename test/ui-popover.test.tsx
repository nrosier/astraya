// @vitest-environment jsdom
/**
 * The shared Popover primitive (#1770): the trigger carries aria-expanded and aria-controls, the panel mounts only
 * while open, Escape closes it and returns focus to the trigger, and an outside pointer press closes it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Popover } from '../src/ui/primitives/Popover.js';

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <>
        <button type="button">Outside</button>
        <Popover label="Filter by category" trigger="F">
          <span>Panel body</span>
        </Popover>
      </>,
    );
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function trigger(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('.primitive-popover-trigger');
  if (found === null) throw new Error('no trigger');
  return found;
}
function panel(): HTMLElement | null {
  return container.querySelector<HTMLElement>('.primitive-popover-panel');
}
function press(element: Element): void {
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
}

describe('Popover (#1770)', () => {
  it('names the trigger and links it to the panel it controls', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Filter by category');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-controls')).toBeTruthy();
  });

  it('mounts the panel only while open', () => {
    expect(panel()).toBeNull();
    act(() => {
      trigger().click();
    });
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.id).toBe(trigger().getAttribute('aria-controls'));
    expect(panel()?.textContent).toBe('Panel body');
    act(() => {
      trigger().click();
    });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('Escape closes it and returns focus to the trigger', () => {
    act(() => {
      trigger().click();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('an outside pointer press closes it', () => {
    act(() => {
      trigger().click();
    });
    const outside = container.querySelector('button:not(.primitive-popover-trigger)');
    if (outside === null) throw new Error('no outside button');
    press(outside);
    expect(panel()).toBeNull();
  });

  it('focus moving outside the popover closes it', () => {
    act(() => {
      trigger().click();
    });
    const outside = container.querySelector<HTMLButtonElement>('button:not(.primitive-popover-trigger)');
    if (outside === null) throw new Error('no outside button');
    // Tab-out: focus leaves the trigger for an element outside the popover. React's onBlur fires from focusout.
    act(() => {
      trigger().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    });
    expect(panel()).toBeNull();
  });

  it('a press inside the panel keeps it open', () => {
    act(() => {
      trigger().click();
    });
    const body = panel()?.querySelector('span');
    if (body === null || body === undefined) throw new Error('no panel body');
    press(body);
    expect(panel()).not.toBeNull();
  });
});
