// @vitest-environment jsdom
/**
 * `DegreeSymbolSetting.tsx` itself (#527): a named, explained section — the same label +
 * explanation + control shape as `RulershipSetting` — not a bare, unexplained checkbox.
 * The component is controlled (#802): it takes `show` and `onChange` from its parent and never
 * touches storage. `test/ui-degree-symbol-setting.test.tsx` covers the persisted preference;
 * `test/ui-report-view.test.tsx` covers the parent wiring.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { DEGREE_SYMBOL_KEY } from '../src/ui/degree-symbol-setting.js';
import { DegreeSymbolSetting } from '../src/ui/DegreeSymbolSetting.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  localStorage.clear();
  setLocale('en');
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

async function mount(show: boolean, onChange: (next: boolean) => void = vi.fn()): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DegreeSymbolSetting show={show} onChange={onChange} />);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

describe('DegreeSymbolSetting (#527)', () => {
  it('is named "Sabian symbols", explains what one is, and reflects the show prop', async () => {
    const container = await mount(true);
    expect(container.querySelector('.degree-symbol-setting-label')?.textContent).toBe('Sabian symbols');
    expect(container.querySelector('.hint')?.textContent).toContain('one exact zodiac degree');
    const checkbox = container.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('test fixture bug: no checkbox rendered');
    expect(checkbox.checked).toBe(true);
    expect(checkbox.closest('label')?.textContent).toContain('Show Sabian symbol notes');
  });

  it('is unchecked when show is false', async () => {
    const container = await mount(false);
    const checkbox = container.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('test fixture bug: no checkbox rendered');
    expect(checkbox.checked).toBe(false);
  });

  it('reports the next value through onChange and does not write storage itself', async () => {
    const onChange = vi.fn();
    const container = await mount(true, onChange);
    const checkbox = container.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('test fixture bug: no checkbox rendered');

    await act(async () => {
      checkbox.click();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(DEGREE_SYMBOL_KEY)).toBeNull();
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const container = await mount(true);
    expect(container.querySelector('.degree-symbol-setting-label')?.textContent).toBe('Sabian-symbolen');
    expect(container.querySelector('input[type="checkbox"]')?.closest('label')?.textContent).toContain(
      'Sabian-symboolnotities tonen',
    );
  });
});
