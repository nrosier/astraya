// @vitest-environment jsdom
/**
 * The update prompt appears once, in the bottom banner (#1331). When a new service worker is waiting, the
 * `PwaStatus` banner (`.pwastatus-update`) shows the prompt and the sidebar footer shows none, so the prompt
 * text is present exactly once across the two regions. The waiting state is produced by the real
 * `registerServiceWorker()` against a stubbed `navigator.serviceWorker` whose registration has a waiting worker;
 * no ephemeris or store is mounted.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { registerServiceWorker } from '../src/pwa/register.js';
import { setLocale } from '../src/ui/locale.js';
import { PwaStatus } from '../src/ui/PwaStatus.js';
import { SidebarFooter } from '../src/ui/SidebarFooter.js';
import { pwaStatusMessages } from '../src/ui/PwaStatus.messages.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  if (originalDescriptor === undefined) {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  } else {
    Object.defineProperty(navigator, 'serviceWorker', originalDescriptor);
  }
  setLocale('en');
});

/** Stub `navigator.serviceWorker` so that registration resolves with a registration holding a waiting worker. */
function stubWaitingWorker(): void {
  const waiting = { state: 'installed', postMessage: () => undefined } as unknown as ServiceWorker;
  const registration = {
    waiting,
    installing: null,
    addEventListener: () => undefined,
  } as unknown as ServiceWorkerRegistration;
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: () => undefined,
      register: () => Promise.resolve(registration),
    },
  });
}

describe('update prompt (#1331)', () => {
  it('shows the prompt exactly once, in the bottom banner, when a new service worker is waiting', async () => {
    stubWaitingWorker();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted = { container, root };

    // Real registration path: `register()` resolves with the waiting registration and `watch()` sets the state.
    await act(async () => {
      registerServiceWorker();
      await Promise.resolve();
    });
    act(() => {
      root.render(
        <>
          <PwaStatus />
          <SidebarFooter />
        </>,
      );
    });

    const prompt = pwaStatusMessages.en.reloadToUpdate;
    const text = container.textContent;
    expect(text.split(prompt).length - 1).toBe(1);
    expect(container.querySelectorAll('button').length).toBe(1);

    const banner = container.querySelector('.pwastatus-update');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(prompt);
    expect(container.querySelector('.sidebar-footer')?.textContent).not.toContain(prompt);
    expect(container.querySelector('.sidebar-footer-update')).toBeNull();
    expect(banner?.closest('.sidebar-footer')).toBeNull();
  });
});
