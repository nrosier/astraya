// @vitest-environment jsdom
/**
 * The command palette's keyboard legend and its Ctrl/Cmd+K toggle (#1769, Step 3). The legend names the keys in
 * en and nl, with ⌘K on Apple platforms and Ctrl+K elsewhere, and is hidden from assistive technology. Ctrl+K
 * typed in the palette's own search field closes it and returns focus to the trigger.
 */
import { act, createRef, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { commandPaletteMessages } from '../src/ui/CommandPalette.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));
vi.mock('../src/ui/store-context.js', () => ({
  useOptionalStore: () => undefined,
  useStoreState: () => {
    throw new Error('fixture bug: no store on a person-less screen');
  },
}));

const { CommandPalette } = await import('../src/ui/CommandPalette.js');

let container: HTMLElement;
let root: Root;

/** A jsdom stand-in for `showModal`, which the palette's dialog needs and jsdom does not have. */
function stubDialog(): void {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    }),
  });
}

function setPlatform(platform: string): void {
  Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
}

const legend = (): HTMLElement | null => document.querySelector<HTMLElement>('.command-palette-legend');
const searchInput = (): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (found === null) throw new Error('fixture bug: no palette search field');
  return found;
};
const paletteOpen = (): boolean => document.querySelector('dialog')?.hasAttribute('open') === true;

function render(open: boolean, onClose: () => void, returnFocusTo: RefObject<HTMLElement | null>): void {
  act(() => {
    root.render(<CommandPalette open={open} onClose={onClose} returnFocusTo={returnFocusTo} />);
  });
}

function pressKey(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  stubDialog();
  setLocale('en');
  setPlatform('Linux x86_64');
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe('the command palette legend (#1769)', () => {
  it('names the keys in English with Ctrl+K off Apple', () => {
    render(true, () => undefined, createRef<HTMLElement>());
    expect(legend()?.textContent).toBe('↑↓ navigate · ↵ open · Esc close · Ctrl+K toggle');
  });

  it('names ⌘K on Apple platforms', () => {
    setPlatform('MacIntel');
    render(true, () => undefined, createRef<HTMLElement>());
    expect(legend()?.textContent).toBe('↑↓ navigate · ↵ open · Esc close · ⌘K toggle');
  });

  it('names the same keys in Dutch', () => {
    setLocale('nl');
    render(true, () => undefined, createRef<HTMLElement>());
    expect(legend()?.textContent).toBe('↑↓ navigeren · ↵ openen · Esc sluiten · Ctrl+K openen/sluiten');
    setLocale('en');
  });

  it('is hidden from assistive technology', () => {
    render(true, () => undefined, createRef<HTMLElement>());
    expect(legend()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the en and nl legend strings in parity', () => {
    expect(commandPaletteMessages.nl.legend('⌘K')).toBe('↑↓ navigeren · ↵ openen · Esc sluiten · ⌘K openen/sluiten');
    expect(commandPaletteMessages.en.shortcutOther).toBe('Ctrl+K');
    expect(commandPaletteMessages.nl.shortcutOther).toBe('Ctrl+K');
    expect(commandPaletteMessages.en.shortcutApple).toBe('⌘K');
    expect(commandPaletteMessages.nl.shortcutApple).toBe('⌘K');
  });
});

describe('the Ctrl/Cmd+K toggle in the search field (#1769)', () => {
  it('closes the palette and returns focus to the trigger on Ctrl+K typed in the search field', () => {
    const onClose = vi.fn();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const returnFocusTo = { current: trigger };
    render(true, onClose, returnFocusTo);
    const event = pressKey(searchInput(), { key: 'k', ctrlKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    trigger.remove();
  });

  it('closes the palette on Cmd+K typed in the search field', () => {
    const onClose = vi.fn();
    render(true, onClose, createRef<HTMLElement>());
    pressKey(searchInput(), { key: 'K', metaKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Ctrl+Shift+K and Ctrl+Alt+K in the search field', () => {
    const onClose = vi.fn();
    render(true, onClose, createRef<HTMLElement>());
    pressKey(searchInput(), { key: 'k', ctrlKey: true, shiftKey: true });
    pressKey(searchInput(), { key: 'k', ctrlKey: true, altKey: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the palette open when the shortcut is not pressed', () => {
    const onClose = vi.fn();
    render(true, onClose, createRef<HTMLElement>());
    pressKey(searchInput(), { key: 'j', ctrlKey: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(paletteOpen()).toBe(true);
  });
});
