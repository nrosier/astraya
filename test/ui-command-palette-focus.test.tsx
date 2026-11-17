// @vitest-environment jsdom
/**
 * Focus return from the command palette to its header trigger (#1654, fix for task 1654-6). Opening the
 * palette from the trigger and closing it with Escape must leave focus on the trigger, not on BODY. The
 * palette stays mounted after its first open, hidden while closed, so `StagedDialog`'s focus return runs
 * while the trigger is still in the page.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { PageActionsProvider, usePageActionsRef } from '../src/ui/page-actions-slot.js';
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

/** The action group a `PageHeader` publishes: the desktop trigger portals into it (#1654). */
function PageHeaderActions(): React.JSX.Element {
  const actionsRef = usePageActionsRef();
  return <div ref={actionsRef} className="page-header-actions" />;
}

function render(route: Route = home): void {
  act(() => {
    root.render(
      <PageActionsProvider>
        <div className="page-header-row">
          <PageHeaderActions />
        </div>
        <AppNav route={route} />
      </PageActionsProvider>,
    );
  });
}

const trigger = (): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>('button.app-nav-search');
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

/** A modal dialog reports Escape as its `cancel` event, which is what the browser sends for the key. */
function pressEscape(): void {
  act(() => {
    container.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
  });
}

function pressKey(target: EventTarget, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

beforeEach(() => {
  stubDialog();
  setLocale('en');
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

describe('the command palette focus return (#1654)', () => {
  it('returns focus to the header trigger when Escape closes the palette it opened', async () => {
    render();
    act(() => {
      trigger().click();
    });
    await expectOpen(true);

    pressEscape();
    await expectOpen(false);

    // The dialog stays mounted and only loses `open`, so StagedDialog's focus return runs while the trigger is in the page.
    expect(container.querySelector('dialog')).not.toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('returns focus to the trigger after a Ctrl+K open and an Escape close', async () => {
    render();
    pressKey(window, { key: 'k', ctrlKey: true });
    await expectOpen(true);

    pressEscape();
    await expectOpen(false);

    // The dialog stays mounted and only loses `open`, so StagedDialog's focus return runs while the trigger is in the page.
    expect(container.querySelector('dialog')).not.toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
