// @vitest-environment jsdom
/**
 * The PillSelect primitive (#1545): one checked option, a choice commits once and returns focus
 * to the pill, Escape and an outside press close the card, aria-expanded tracks the card, and
 * opening a second pill closes the first.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PillSelect } from '../src/ui/primitives/PillSelect.js';

const OPTIONS = [
  { value: 'natal', label: 'Natal' },
  { value: 'transit', label: 'Transit' },
  { value: 'synastry', label: 'Synastry' },
];

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    const mounted = root;
    act(() => {
      mounted.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

function mount(element: React.JSX.Element): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  container = host;
  root = createRoot(host);
  const mounted = root;
  act(() => {
    mounted.render(element);
  });
  return host;
}

function pill(host: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')).find((button) =>
    button.textContent.includes(label),
  );
  if (found === undefined) throw new Error(`no pill showing ${label}`);
  return found;
}

function radios(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

function radio(host: HTMLElement, label: string): HTMLButtonElement {
  const found = radios(host).find((button) => button.textContent === label);
  if (found === undefined) throw new Error(`no radio ${label}`);
  return found;
}

function click(element: HTMLElement): void {
  act(() => {
    element.click();
  });
}

describe('PillSelect (#1545)', () => {
  it('shows the current option and marks exactly one radio checked', () => {
    const host = mount(
      <PillSelect label="Chart type" value="transit" options={OPTIONS} onChange={() => undefined} idPrefix="t" />,
    );
    expect(pill(host, 'Transit')).toBeTruthy();
    click(pill(host, 'Transit'));
    const checked = radios(host).filter((button) => button.getAttribute('aria-checked') === 'true');
    expect(checked.map((button) => button.textContent)).toEqual(['Transit']);
  });

  it('calls onChange once, closes the card and focuses the pill when an option is chosen', () => {
    const onChange = vi.fn<(value: string) => void>();
    const host = mount(
      <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={onChange} idPrefix="c" />,
    );
    click(pill(host, 'Natal'));
    click(radio(host, 'Synastry'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('synastry');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(pill(host, 'Natal'));
  });

  it('closes without calling onChange when the current option is chosen again', () => {
    const onChange = vi.fn<(value: string) => void>();
    const host = mount(
      <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={onChange} idPrefix="s" />,
    );
    click(pill(host, 'Natal'));
    click(radio(host, 'Natal'));
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('toggles aria-expanded as the card opens and closes', () => {
    const host = mount(
      <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={() => undefined} idPrefix="e" />,
    );
    expect(pill(host, 'Natal').getAttribute('aria-expanded')).toBe('false');
    click(pill(host, 'Natal'));
    expect(pill(host, 'Natal').getAttribute('aria-expanded')).toBe('true');
    click(pill(host, 'Natal'));
    expect(pill(host, 'Natal').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and returns focus to the pill', () => {
    const host = mount(
      <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={() => undefined} idPrefix="x" />,
    );
    click(pill(host, 'Natal'));
    expect(document.activeElement).toBe(radio(host, 'Natal'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(pill(host, 'Natal'));
  });

  it('closes when the page is pressed outside the control', () => {
    const host = mount(
      <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={() => undefined} idPrefix="o" />,
    );
    click(pill(host, 'Natal'));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('moves focus between radios with arrow keys without calling onChange', () => {
    const onChange = vi.fn<(value: string) => void>();
    const host = mount(
      <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={onChange} idPrefix="a" />,
    );
    click(pill(host, 'Natal'));
    act(() => {
      radio(host, 'Natal').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(radio(host, 'Transit'));
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('closes the first pill when a second one is opened', () => {
    const host = mount(
      <>
        <PillSelect label="Chart type" value="natal" options={OPTIONS} onChange={() => undefined} idPrefix="p1" />
        <PillSelect label="Preset" value="transit" options={OPTIONS} onChange={() => undefined} idPrefix="p2" />
      </>,
    );
    click(pill(host, 'Natal'));
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    click(pill(host, 'Transit'));
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(pill(host, 'Natal').getAttribute('aria-expanded')).toBe('false');
    expect(pill(host, 'Transit').getAttribute('aria-expanded')).toBe('true');
  });
});
