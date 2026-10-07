// @vitest-environment jsdom
/**
 * Regression test for SEC-01 (#462): the About page used to say "No AI service is
 * contacted while you use Astraya" unconditionally, which became false once the Tier 2
 * (#360) AI-customized interpretation path shipped — it does contact a configured AI
 * provider, through the server, when a signed-in user explicitly opts into it. This
 * guards against the privacy copy regressing to that absolute claim, in either locale.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { About } from '../src/ui/About.js';

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
    root.render(<About />);
  });
  mounted = { container, root };
  return container;
}

describe('About page privacy copy', () => {
  it('does not claim no AI service is ever contacted, in English', () => {
    setLocale('en');
    const container = mount();
    const text = container.textContent;
    // The old, unconditional claim this regresses against.
    expect(text).not.toMatch(/no ai service is contacted while you use astraya/i);
    // The actual, conditional claim must still be present: no contact by default,
    // but Tier 2 does send chart facts through the server when explicitly chosen.
    expect(text).toMatch(/no ai service is contacted for it/i);
    expect(text).toMatch(/ai-customized interpretation/i);
    expect(text).toMatch(/sent through this server/i);
  });

  it('does not claim no AI service is ever contacted, in Dutch', () => {
    setLocale('nl');
    const container = mount();
    const text = container.textContent;
    expect(text).not.toMatch(/geen ai-dienst benaderd terwijl je astraya gebruikt/i);
    expect(text).toMatch(/ai-aangepaste interpretatie/i);
    expect(text).toMatch(/via deze server/i);
  });
});
