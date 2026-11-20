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
import { PageActionsProvider, usePageActionsRef } from '../src/ui/page-actions-slot.js';
import { WorkspaceUtilityProvider, useWorkspaceUtilityRef } from '../src/ui/workspace-utility-slot.js';
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

/**
 * Renders `AppNav` under a page header's action group, the way `App.tsx` mounts it (#1654): the desktop trigger
 * portals into that group, so it is searched for in the document, not inside the nav's container.
 */
/** The action group a `PageHeader` publishes, so the desktop trigger has a page header to portal into. */
function PageHeaderActions(): React.JSX.Element {
  const actionsRef = usePageActionsRef();
  return <div ref={actionsRef} className="page-header-actions" />;
}

/** The workspace utility row the shell publishes above every page header (#1769). */
function WorkspaceUtilityRow(): React.JSX.Element {
  const utilityRef = useWorkspaceUtilityRef();
  return <div ref={utilityRef} className="workspace-utility" />;
}

function render(route: Route = home): void {
  act(() => {
    root.render(
      <PageActionsProvider>
        <WorkspaceUtilityProvider>
          <WorkspaceUtilityRow />
          <div className="page-header-row">
            <PageHeaderActions />
          </div>
          <AppNav route={route} />
        </WorkspaceUtilityProvider>
      </PageActionsProvider>,
    );
  });
}

const trigger = (): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>('button.app-nav-search');
  if (found === null) throw new Error('fixture bug: no palette trigger');
  return found;
};
const paletteOpen = (): boolean => document.querySelector('dialog')?.hasAttribute('open') === true;
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

beforeEach(async () => {
  stubDialog();
  act(() => {
    setLocale('en');
  });
  setPlatform('Linux x86_64');
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  // AppNav lazy-loads CommandPalette, so the first open in this file would wait on a cold dynamic import
  // and outlast expectOpen's 50 ticks. Importing it here caches the chunk before any test opens the palette.
  await import('../src/ui/CommandPalette.js');
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe('the command palette trigger (#1654)', () => {
  it('renders an icon-only circle named "Search features, charts, tabs", described by its tooltip', () => {
    render();
    expect(trigger().getAttribute('aria-label')).toBe(appNavMessages.en.searchLabel);
    expect(trigger().textContent).toBe('');
    expect(trigger().querySelector('kbd')).toBeNull();
    const tipId = trigger().getAttribute('aria-describedby') ?? '';
    const tip = document.getElementById(tipId);
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(tip?.textContent).toBe(`Search (${appNavMessages.en.shortcutHintOther})`);
  });

  it('uses the same icon-only circle class at 390px and on the wide trigger (#1769)', () => {
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
    expect(trigger().classList.contains('primitive-button-circle')).toBe(true);
  });

  it('names the shortcut in the tooltip: Cmd K on Apple platforms, Ctrl+K elsewhere, in en and nl (#1769)', () => {
    const tipText = (): string | null | undefined => {
      const tipId = trigger().getAttribute('aria-describedby') ?? '';
      return document.getElementById(tipId)?.textContent;
    };
    setPlatform('MacIntel');
    render();
    expect(tipText()).toBe('Search (⌘K)');
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    setPlatform('Linux x86_64');
    act(() => {
      setLocale('nl');
    });
    render();
    expect(tipText()).toBe('Zoeken (Ctrl+K)');
    expect(trigger().getAttribute('aria-label')).toBe(appNavMessages.nl.searchLabel);
    act(() => {
      setLocale('en');
    });
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

  it('renders the desktop trigger in the workspace utility row, not in the page header action group or the sidebar (#1769)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render();
    const utilityRow = document.querySelector('.workspace-utility');
    if (utilityRow === null) throw new Error('fixture bug: no workspace utility row');
    // The trigger sits in the workspace's top-right utility row above the page header, not in the header's action group.
    expect(utilityRow.contains(trigger())).toBe(true);
    expect(trigger().closest('.page-header-actions')).toBeNull();
    // The sidebar holds no search control: no trigger inside the nav wrapper or the nav.
    expect(document.querySelector('.app-nav-wrap .app-nav-search')).toBeNull();
    expect(document.querySelector('nav.app-nav .app-nav-search')).toBeNull();
  });

  it('leaves the arrow keys for the date animation bar, which keeps its own listener', () => {
    render();
    const event = pressKey(document.body, { key: 'ArrowRight' });
    expect(paletteOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});
