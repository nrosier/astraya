// @vitest-environment jsdom
/**
 * The command palette dialog (#1654, task 1654-4). Each case renders the palette into jsdom and drives it
 * through its keyboard and pointer contract: it opens focused, arrows and Enter navigate, Escape returns
 * focus, an empty query shows the recents, and the en and nl strings come from the catalogue.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeHref } from '../src/ui/route.js';
import { recordRecent, togglePin } from '../src/ui/palette-recents.js';
import { CommandPalette } from '../src/ui/CommandPalette.js';
import { commandPaletteMessages } from '../src/ui/CommandPalette.messages.js';
import type * as localeModule from '../src/ui/locale.js';

const locale = vi.hoisted(() => ({ current: 'en' as 'en' | 'nl' }));

vi.mock('../src/ui/locale.js', async (importOriginal) => {
  const actual = await importOriginal<typeof localeModule>();
  return {
    ...actual,
    useLocale: (): [typeof locale.current, (next: typeof locale.current) => void] => [locale.current, () => undefined],
  };
});

/** An in-memory localStorage so no case leaks state into the next. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const SECTION_APPEARANCE = 'preferences:appearance';
const SECTION_DATA = 'preferences:data';

let container: HTMLDivElement;
let root: Root;
let returnButton: HTMLButtonElement;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  locale.current = 'en';
  // jsdom has no showModal; the palette falls back to the open attribute.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    }),
  });
  container = document.createElement('div');
  document.body.append(container);
  returnButton = document.createElement('button');
  returnButton.textContent = 'Open search';
  document.body.append(returnButton);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  returnButton.remove();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});

function render(open: boolean, onClose: () => void = () => undefined): void {
  const returnFocusTo = { current: returnButton };
  act(() => {
    root.render(<CommandPalette open={open} onClose={onClose} returnFocusTo={returnFocusTo} />);
  });
}

function input(): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (found === null) throw new Error('palette input not rendered');
  return found;
}

function options(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
}

function keyDown(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

function typeQuery(value: string): void {
  act(() => {
    // Sets the native value so React sees a change event, the way typing does.
    const field = input();
    const descriptor: PropertyDescriptor | undefined = Reflect.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    );
    const setter: unknown = Reflect.get(descriptor ?? {}, 'set');
    if (typeof setter !== 'function') throw new Error('no native value setter');
    Reflect.apply(setter, field, [value]);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('CommandPalette', () => {
  it('opens with the search field focused and a listbox wired to it', () => {
    render(true);
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-controls')).toBe(container.querySelector('[role="listbox"]')?.id ?? '');
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  });

  it('moves the selection with the arrow keys and opens the chosen entry with Enter', () => {
    const onClose = vi.fn();
    // Recents are most recent first: Data (recorded last) is row 0, Appearance is row 1.
    recordRecent(SECTION_APPEARANCE);
    recordRecent(SECTION_DATA);
    render(true, onClose);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');

    keyDown(input(), 'ArrowDown');
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1]?.id);

    // Wraps from the last row back to the first.
    keyDown(input(), 'ArrowDown');
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');

    keyDown(input(), 'ArrowUp');
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');

    keyDown(input(), 'Enter');
    expect(window.location.hash).toBe(routeHref({ kind: 'preferences', section: 'appearance' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the control that opened it', () => {
    const onClose = vi.fn();
    render(true, onClose);
    act(() => {
      container.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    render(false, onClose);
    expect(document.activeElement).toBe(returnButton);
  });

  it('shows pins first and then recents on an empty query, without a pinned entry twice', () => {
    recordRecent(SECTION_APPEARANCE);
    recordRecent(SECTION_DATA);
    togglePin(SECTION_DATA);
    render(true);
    const ids = options().map((option) => option.textContent);
    expect(ids).toHaveLength(2);
    expect(container.textContent).toContain(commandPaletteMessages.en.pinnedHeading);
    expect(container.textContent).toContain(commandPaletteMessages.en.recentHeading);
    // Pinned (data) comes first, then the recent that is not pinned (appearance).
    expect(options()[0]?.textContent).toContain('Data');
    expect(options()[1]?.textContent).toContain('Appearance');
  });

  it('shows the empty hint with no recents and the no-match message for a query that matches nothing', () => {
    render(true);
    expect(container.textContent).toContain(commandPaletteMessages.en.emptyHint);
    typeQuery('zzqqxx');
    expect(options()).toHaveLength(0);
    expect(container.textContent).toContain(commandPaletteMessages.en.noMatch('zzqqxx'));
  });

  it('gives the Dutch strings and Dutch titles when the locale is nl', () => {
    locale.current = 'nl';
    render(true);
    expect(input().getAttribute('placeholder')).toBe(commandPaletteMessages.nl.placeholder);
    expect(container.textContent).toContain(commandPaletteMessages.nl.emptyHint);
    typeQuery('voorkeur');
    expect(container.textContent).not.toContain(commandPaletteMessages.en.noMatch('voorkeur'));
  });

  it('gives each pin toggle an accessible name that names its entry', () => {
    recordRecent(SECTION_APPEARANCE);
    render(true);
    const pin = container.querySelector<HTMLButtonElement>('.command-palette-pin');
    // The entry's title is the menu label, "Appearance & Accessibility".
    expect(pin?.getAttribute('aria-label')).toBe(commandPaletteMessages.en.pin('Appearance & Accessibility'));
  });
});
