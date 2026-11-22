// @vitest-environment jsdom
/**
 * Radio's word term (#1867): a glossary popup on one word inside the radio's own label. The word is
 * a non-interactive span, so clicking it selects the radio; the popup is aria-hidden and wired by
 * aria-describedby, so the radio's accessible name stays exactly the label text.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Radio } from '../src/ui/primitives/Radio.js';

const LABEL = 'Retrograde only (e.g. Venus’s inferior conjunctions)';
const DEFINITION = 'Retrograde: a planet appears to move backwards through the zodiac';

let container: HTMLElement;
let root: Root;

function Fixture(): React.JSX.Element {
  const [value, setValue] = useState<'any' | 'retro'>('any');
  return (
    <div role="radiogroup" aria-label="Motion">
      <Radio
        label="Any"
        name="motion"
        checked={value === 'any'}
        onChange={() => {
          setValue('any');
        }}
      />
      <Radio
        label={LABEL}
        name="motion"
        checked={value === 'retro'}
        onChange={() => {
          setValue('retro');
        }}
        term={{ word: 'Retrograde', definition: DEFINITION }}
      />
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(<Fixture />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

const labels = (): HTMLLabelElement[] => [...container.querySelectorAll('label')];
const termLabel = (): HTMLLabelElement => {
  const label = labels()[1];
  if (label === undefined) throw new Error('test fixture bug: no term label');
  return label;
};
const termInput = (): HTMLInputElement => {
  const input = termLabel().querySelector('input');
  if (input === null) throw new Error('test fixture bug: no term radio');
  return input;
};
const word = (): HTMLElement => {
  const span = termLabel().querySelector<HTMLElement>('.glossary-term .primitive-tooltip-trigger');
  if (span === null) throw new Error('test fixture bug: no word span');
  return span;
};
const popup = (): HTMLElement => {
  const element = termLabel().querySelector<HTMLElement>('[role="tooltip"]');
  if (element === null) throw new Error('test fixture bug: no popup');
  return element;
};

/** The label's text as an accessible-name computation sees it: aria-hidden subtrees dropped, trimmed. */
function nameText(label: HTMLLabelElement): string {
  const clone = label.cloneNode(true);
  if (!(clone instanceof HTMLElement)) throw new Error('test fixture bug: label clone');
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (clone.textContent ?? '').trim();
}

describe('Radio with a word term', () => {
  it('keeps the accessible name exactly the label text', () => {
    expect(nameText(termLabel())).toBe(LABEL);
    expect(popup().getAttribute('aria-hidden')).toBe('true');
  });

  it('puts the popup on the word itself, as a span', () => {
    expect(word().tagName).toBe('SPAN');
    expect(word().textContent).toBe('Retrograde');
    expect(popup().closest('.glossary-term')).toBe(word().parentElement);
  });

  it('opens the popup beside its word (#1867)', () => {
    expect(popup().getAttribute('data-placement')).toBe('beside');
  });

  it('has no interactive element inside the label', () => {
    expect(termLabel().querySelectorAll('button, a, select, textarea, [tabindex], [role="button"]')).toHaveLength(0);
    expect(termLabel().querySelectorAll('input')).toHaveLength(1);
  });

  it('selects the radio when the word is clicked', () => {
    expect(termInput().checked).toBe(false);
    act(() => {
      word().click();
    });
    expect(termInput().checked).toBe(true);
  });

  it('does not select the radio when the open popup text is clicked', () => {
    act(() => {
      termInput().focus();
    });
    expect(popup().hidden).toBe(false);
    expect(termInput().checked).toBe(false);
    act(() => {
      popup().click();
    });
    expect(termInput().checked).toBe(false);
  });

  it('links the definition through aria-describedby', () => {
    const id = termInput().getAttribute('aria-describedby');
    expect(id).not.toBeNull();
    expect(id === null ? null : document.getElementById(id)?.textContent).toBe(DEFINITION);
  });

  it('shows the popup on keyboard focus, hides it on Escape and on blur', () => {
    expect(popup().hidden).toBe(true);
    act(() => {
      termInput().focus();
    });
    expect(popup().hidden).toBe(false);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(popup().hidden).toBe(true);
    expect(document.activeElement).toBe(termInput());

    act(() => {
      termInput().blur();
      termInput().focus();
    });
    expect(popup().hidden).toBe(false);
    act(() => {
      termInput().blur();
    });
    expect(popup().hidden).toBe(true);
  });

  it('opens on hover after the shared delay, and closes when the pointer leaves', () => {
    const wrapper = word().parentElement;
    act(() => {
      wrapper?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    expect(popup().hidden).toBe(true);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(popup().hidden).toBe(false);
    act(() => {
      wrapper?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(popup().hidden).toBe(true);
  });

  it('pins the popup when the word is clicked, until an outside press', () => {
    act(() => {
      word().click();
    });
    expect(popup().hidden).toBe(false);
    const wrapper = word().parentElement;
    act(() => {
      wrapper?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(popup().hidden).toBe(false);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(popup().hidden).toBe(true);
  });

  it('renders a plain label, with no popup, when there is no term or the word is missing', () => {
    const plain = labels()[0];
    expect(plain?.querySelector('[role="tooltip"]')).toBeNull();
    expect(plain?.querySelector('input')?.hasAttribute('aria-describedby')).toBe(false);
    act(() => {
      root.render(
        <Radio
          label={LABEL}
          name="other"
          checked={false}
          onChange={() => undefined}
          term={{ word: 'Direct', definition: DEFINITION }}
        />,
      );
    });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(container.querySelector('label')?.textContent?.trim()).toBe(LABEL);
  });
});
