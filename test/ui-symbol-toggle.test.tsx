// @vitest-environment jsdom
/** The header's text-only toggle (#419) sets the same device preference as the Symbols setting. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { getSymbolClass, setSymbolClass } from '../src/chart/symbol-class.js';
import { setLocale } from '../src/ui/locale.js';
import { SymbolToggle } from '../src/ui/SymbolToggle.js';

afterEach(() => {
  localStorage.clear();
  setSymbolClass('drawn');
  setLocale('en');
});

async function mount(): Promise<{ button: HTMLButtonElement; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SymbolToggle />);
    await Promise.resolve();
  });
  const button = container.querySelector('button');
  if (button === null) throw new Error('fixture bug: no button');
  return {
    button,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('SymbolToggle', () => {
  it('switches between drawn and text-only symbols, naming its state', async () => {
    const { button, unmount } = await mount();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Text-only symbols');
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(getSymbolClass()).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('astraya:symbolClass')).toBe('text');
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(getSymbolClass()).toBe('drawn');
    unmount();
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const { button, unmount } = await mount();
    expect(button.getAttribute('aria-label')).toBe('Symbolen als tekst');
    unmount();
  });
});
