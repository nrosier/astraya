// @vitest-environment jsdom
/**
 * The shared Disclosure primitive (#506/#508, used by #511): a button that exposes its expanded state
 * and controls a panel, says what opens and what pressing it does, hides its chevron from assistive
 * technology, mounts its content only while open, and never moves focus when it opens.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Disclosure } from '../src/ui/primitives/Disclosure.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

function mount(node: React.ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted = { container, root };
  return container;
}

const sample = (
  <Disclosure title="More meanings" summary="3 more" showLabel="Show all meanings" hideLabel="Hide meanings">
    <p>Hidden detail</p>
  </Disclosure>
);

describe('Disclosure', () => {
  it('starts closed: names its action and summary, exposes aria-expanded, mounts no content', () => {
    const container = mount(sample);
    const trigger = container.querySelector('button');
    expect(trigger?.textContent).toContain('More meanings');
    expect(trigger?.textContent).toContain('3 more');
    expect(trigger?.textContent).toContain('Show all meanings');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Hidden detail');
  });

  it('opens and closes in place, swapping its action wording, tying the trigger to its panel', () => {
    const container = mount(sample);
    const trigger = container.querySelector('button');
    if (trigger === null) throw new Error('no trigger');
    const panelId = trigger.getAttribute('aria-controls');
    expect(panelId).not.toBeNull();

    act(() => {
      trigger.click();
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.textContent).toContain('Hide meanings');
    const panel = container.querySelector(`[id="${panelId ?? ''}"]`);
    expect(panel?.hasAttribute('hidden')).toBe(false);
    expect(panel?.textContent).toContain('Hidden detail');

    act(() => {
      trigger.click();
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Hidden detail');
  });

  it('hides its chevron from assistive technology and does not move focus when it opens', () => {
    const container = mount(sample);
    expect(container.querySelector('.primitive-disclosure-chevron')?.getAttribute('aria-hidden')).toBe('true');
    const trigger = container.querySelector('button');
    if (trigger === null) throw new Error('no trigger');
    trigger.focus();
    act(() => {
      trigger.click();
    });
    expect(document.activeElement).toBe(trigger);
  });
});
