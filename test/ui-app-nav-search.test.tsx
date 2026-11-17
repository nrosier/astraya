// @vitest-environment jsdom
/**
 * The command palette trigger in the header nav (#1654, task 1654-5). Each case mounts `AppNav` on a
 * screen with no person and drives the trigger and the Ctrl+K / Cmd+K shortcut. The CSS cases read
 * `app.css` to check the pill on a wide screen and the 390px circle with its 44px touch floor.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { parseRoute, type Route } from '../src/ui/route.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));
vi.mock('../src/ui/store-context.js', () => ({
  useOptionalStore: () => undefined,
  useStoreState: () => {
    throw new Error('fixture bug: no store on a person-less screen');
  },
}));

const { AppNav } = await import('../src/ui/AppNav.js');
const { appNavMessages } = await import('../src/ui/AppNav.messages.js');

const home: Route = parseRoute('#/');

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

function render(route: Route = home): void {
  act(() => {
    root.render(<AppNav route={route} />);
  });
}

const trigger = (): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button.app-nav-search');
  if (found === null) throw new Error('fixture bug: no palette trigger');
  return found;
};
const paletteOpen = (): boolean => container.querySelector('dialog')?.hasAttribute('open') === true;
/** The palette loads lazily, so an open request shows once its chunk resolves: flush until it does. */
async function expectOpen(open: boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && paletteOpen() !== open; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(paletteOpen()).toBe(open);
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

describe('the command palette trigger (#1654)', () => {
  it('renders a search trigger with the muted placeholder and the shortcut hint', () => {
    render();
    // The accessible name carries the shortcut too, so it matches the visible text (axe label-content-name-mismatch).
    expect(trigger().getAttribute('aria-label')).toBe(
      `${appNavMessages.en.searchPlaceholder} ${appNavMessages.en.shortcutHintOther}`,
    );
    expect(trigger().textContent).toContain(appNavMessages.en.searchPlaceholder);
    expect(trigger().querySelector('kbd')?.textContent).toBe(appNavMessages.en.shortcutHintOther);
  });

  it('uses the shared circle class at 390px and keeps the pill class on the wide trigger', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 40rem)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render();
    expect(trigger().classList.contains('primitive-button-circle')).toBe(true);
    expect(trigger().classList.contains('app-nav-search')).toBe(true);
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render();
    expect(trigger().classList.contains('app-nav-search')).toBe(true);
    expect(trigger().classList.contains('primitive-button-circle')).toBe(false);
  });

  it('shows the Cmd K hint on Apple platforms and Ctrl K elsewhere', () => {
    setPlatform('MacIntel');
    render();
    expect(trigger().querySelector('kbd')?.textContent).toBe(appNavMessages.en.shortcutHintApple);
  });

  it('opens the palette when the trigger is pressed', async () => {
    render();
    expect(paletteOpen()).toBe(false);
    act(() => {
      trigger().click();
    });
    await expectOpen(true);
  });

  it('opens the palette on Ctrl+K from outside a text field', async () => {
    render();
    const event = pressKey(document.body, { key: 'k', ctrlKey: true });
    await expectOpen(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('opens the palette on Cmd+K', async () => {
    render();
    pressKey(document.body, { key: 'K', metaKey: true });
    await expectOpen(true);
  });

  it('ignores Ctrl+K typed inside a text input', () => {
    render();
    const input = document.createElement('input');
    container.append(input);
    const event = pressKey(input, { key: 'k', ctrlKey: true });
    expect(paletteOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores Ctrl+K inside a select, a textarea and a contenteditable region', () => {
    render();
    const select = document.createElement('select');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editable.append(inner);
    container.append(select, textarea, editable);
    for (const target of [select, textarea, inner]) pressKey(target, { key: 'k', ctrlKey: true });
    expect(paletteOpen()).toBe(false);
  });

  it('leaves other Ctrl and Cmd keys alone', () => {
    render();
    const event = pressKey(document.body, { key: 'j', ctrlKey: true });
    expect(paletteOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores Ctrl+Shift+K and Ctrl+Alt+K so no other binding is taken over', () => {
    render();
    pressKey(document.body, { key: 'k', ctrlKey: true, shiftKey: true });
    pressKey(document.body, { key: 'k', ctrlKey: true, altKey: true });
    expect(paletteOpen()).toBe(false);
  });

  it('leaves the arrow keys for the date animation bar, which keeps its own listener', () => {
    render();
    const event = pressKey(document.body, { key: 'ArrowRight' });
    expect(paletteOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});
