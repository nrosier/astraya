// @vitest-environment jsdom
/**
 * Regression test for I18N-01 (#464): the Changelog screen's chrome ("Back", "Changelog", "You
 * are running", "Full commit history") used to be hardcoded English instead of coming from a
 * co-located message catalogue, so switching the app to Dutch left this one screen untranslated.
 * The release-note body itself (`CHANGELOG.md`) is deliberately not covered by this — it stays
 * in its own language regardless of locale.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { Changelog } from '../src/ui/Changelog.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Changelog />);
  });
  mounted = { container, root };
  return container;
}

describe('Changelog screen chrome', () => {
  it('is in English by default', () => {
    setLocale('en');
    const container = mount();
    expect(container.querySelector('h1')?.textContent).toBe('Changelog');
    expect(container.querySelector('.back')?.textContent).toContain('Back');
    expect(container.querySelector('.tagline')?.textContent).toContain('You are running');
    expect(container.querySelector('footer a')?.textContent).toBe('Full commit history');
  });

  it('follows the locale into Dutch', () => {
    setLocale('nl');
    const container = mount();
    expect(container.querySelector('h1')?.textContent).toBe('Changelog');
    expect(container.querySelector('.back')?.textContent).toContain('Terug');
    expect(container.querySelector('.tagline')?.textContent).toContain('Je gebruikt');
    expect(container.querySelector('footer a')?.textContent).toBe('Volledige commitgeschiedenis');
  });
});
