// @vitest-environment jsdom
/**
 * The Life events card's `drawer=life-events` deep link (#1667): a birth record URL with the parameter opens the
 * management drawer on load, closing the drawer removes `drawer` from the URL and keeps the other parameters, and an
 * unreadable stored list opens nothing.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { lifeEventsDrawerMessages } from '../src/ui/LifeEventsDrawer.messages.js';
import { LifeEventsCard } from '../src/ui/LifeEventsCard.js';
import { StoreProvider } from '../src/ui/store-context.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = lifeEventsDrawerMessages.en;
const PERSON_HASH = '#/people/p-aaaaaaaaaaaaaaaa/birth-record';
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-life-events-card-${String(counter)}` });
  window.history.replaceState(null, '', PERSON_HASH);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
  window.history.replaceState(null, '', '#/');
});

async function mount(unreadable = false): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <LifeEventsCard personId="p-aaaaaaaaaaaaaaaa" personName="Ada" events={[]} unreadable={unreadable} />
      </StoreProvider>,
    );
    await Promise.resolve();
  });
}

function drawerOpen(): boolean {
  return document.querySelector<HTMLDialogElement>('.life-events-drawer')?.hasAttribute('open') ?? false;
}

describe('LifeEventsCard deep link (#1667)', () => {
  it('opens the drawer on load when the birth record carries drawer=life-events', async () => {
    window.history.replaceState(null, '', `${PERSON_HASH}?drawer=life-events`);
    await mount();
    expect(drawerOpen()).toBe(true);
  });

  it('removes drawer from the URL when the drawer is closed and keeps other parameters', async () => {
    window.history.replaceState(null, '', `${PERSON_HASH}?drawer=life-events&keep=1`);
    await mount();
    expect(drawerOpen()).toBe(true);
    const close = [...document.querySelectorAll<HTMLButtonElement>('.life-events-drawer button')].find(
      (button) => button.getAttribute('aria-label') === t.closeLabel || button.textContent.trim() === t.closeLabel,
    );
    if (close === undefined) throw new Error('test fixture bug: no close control on the Life events drawer');
    await act(async () => {
      close.click();
      await Promise.resolve();
    });
    expect(drawerOpen()).toBe(false);
    expect(window.location.hash).toBe(`${PERSON_HASH}?keep=1`);
  });

  it('opens nothing for an unreadable stored list', async () => {
    window.history.replaceState(null, '', `${PERSON_HASH}?drawer=life-events`);
    await mount(true);
    expect(drawerOpen()).toBe(false);
  });
});
