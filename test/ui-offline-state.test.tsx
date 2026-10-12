// @vitest-environment jsdom
/**
 * The offline result state (#513): a network-only action says it needs a connection and does not offer a click that
 * can only fail, then comes back when the browser reports it is online again.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BirthPlaceSearch } from '../src/ui/BirthPlaceSearch.js';
import { setLocale } from '../src/ui/locale.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline (#513)', () => {
  it('disables the place search with an honest note while offline, and re-enables it online', async () => {
    setLocale('en');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(<BirthPlaceSearch onPick={() => undefined} />);
      await Promise.resolve();
    });
    const input = container.querySelector('input');
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(container.querySelector('[data-kind="offline"]')?.textContent).toContain('You are offline');
    expect(container.querySelector('[data-kind="offline"]')?.textContent).toContain('enter the coordinates yourself');
    expect(input).not.toBeNull();
    expect(button?.disabled).toBe(true);

    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-kind="offline"]')).toBeNull();
  });
});
