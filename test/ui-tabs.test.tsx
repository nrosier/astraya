// @vitest-environment jsdom
/**
 * The shared same-page tabs (#650): the WAI-ARIA tab roles, one tab stop, arrow/Home/End selection that also moves
 * focus, and a panel that is labelled by its tab.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs, tabPanelProps } from '../src/ui/primitives/Tabs.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Key = 'one' | 'two' | 'three';
const ITEMS = [
  { key: 'one', label: 'One' },
  { key: 'two', label: 'Two' },
  { key: 'three', label: 'Three' },
] as const;

function Demo(): React.JSX.Element {
  const [active, setActive] = useState<Key>('one');
  return (
    <>
      <Tabs idBase="demo" label="Demo tabs" items={ITEMS} active={active} onSelect={setActive} />
      <div {...tabPanelProps('demo', active)}>{active} panel</div>
    </>
  );
}

let root: Root | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Demo />);
  });
  return container;
}

const tab = (container: HTMLElement, name: string): HTMLButtonElement => {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent === name,
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
};

function press(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('Tabs', () => {
  it('exposes a named tablist whose selected tab is the only tab stop', () => {
    const container = mount();
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Demo tabs');
    expect(tab(container, 'One').getAttribute('aria-selected')).toBe('true');
    expect(tab(container, 'One').tabIndex).toBe(0);
    expect(tab(container, 'Two').tabIndex).toBe(-1);
    expect(tab(container, 'Two').getAttribute('aria-selected')).toBe('false');
  });

  it('labels the panel by its tab, and each tab names its panel', () => {
    const container = mount();
    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab(container, 'One').id);
    expect(tab(container, 'One').getAttribute('aria-controls')).toBe(panel?.id);
  });

  it('moves selection and focus with the arrow keys, wrapping at both ends', () => {
    const container = mount();
    tab(container, 'One').focus();
    press(tab(container, 'One'), 'ArrowRight');
    expect(tab(container, 'Two').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(container, 'Two'));
    press(tab(container, 'Two'), 'ArrowLeft');
    press(tab(container, 'One'), 'ArrowLeft');
    expect(tab(container, 'Three').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(container, 'Three'));
    press(tab(container, 'Three'), 'ArrowRight');
    expect(tab(container, 'One').getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the first and last tab with Home and End, and swaps the panel', () => {
    const container = mount();
    press(tab(container, 'One'), 'End');
    expect(tab(container, 'Three').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe('three panel');
    press(tab(container, 'Three'), 'Home');
    expect(tab(container, 'One').getAttribute('aria-selected')).toBe('true');
  });

  it('selects on click and ignores other keys', () => {
    const container = mount();
    act(() => {
      tab(container, 'Two').click();
    });
    expect(tab(container, 'Two').getAttribute('aria-selected')).toBe('true');
    press(tab(container, 'Two'), 'a');
    expect(tab(container, 'Two').getAttribute('aria-selected')).toBe('true');
  });
});
