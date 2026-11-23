// @vitest-environment jsdom
/**
 * #1868 (B) — the Preferences theme row is the shared segmented ChoiceGroup: a radio group with System, Light and
 * Dark in en and nl, and choosing one stores it (`astraya.theme`) and applies it (`data-theme` on the root).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => new Promise<number>(() => undefined) };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    consultationNotes: new Map(),
    savedQueries: new Map(),
    chartSearches: new Map(),
    people: new Map(),
  };
  return { useStoreState: () => state, useStore: () => ({ writable: true }), useOptionalStore: () => undefined };
});

const { PreferencesView } = await import('../src/ui/PreferencesView.js');
const { preferencesViewMessages } = await import('../src/ui/PreferencesView.messages.js');
const { setLocale } = await import('../src/ui/locale.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PreferencesView section={undefined} />);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.removeItem('astraya.theme');
  delete document.documentElement.dataset.theme;
  setLocale('en');
});

describe('Preferences theme row (#1868 B)', () => {
  it.each(['en', 'nl'] as const)('is a radio group with System, Light and Dark in %s', async (locale) => {
    setLocale(locale);
    const t = preferencesViewMessages[locale];
    const container = await mount();
    const group = container.querySelector(`[role="radiogroup"][aria-label="${t.themeTitle}"]`);
    expect(group).not.toBeNull();
    const labels = [...(group?.querySelectorAll('input[type="radio"]') ?? [])].map((input) =>
      (input.closest('label')?.textContent ?? '').trim(),
    );
    expect(labels).toEqual([t.themeOptions.system, t.themeOptions.light, t.themeOptions.dark]);
  });

  it('stores and applies the chosen theme', async () => {
    const container = await mount();
    const t = preferencesViewMessages.en;
    const group = container.querySelector(`[role="radiogroup"][aria-label="${t.themeTitle}"]`);
    const radios = [...(group?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])];
    expect(radios[0]?.checked).toBe(true);
    await act(async () => {
      radios[2]?.click();
      await Promise.resolve();
    });
    expect(localStorage.getItem('astraya.theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await act(async () => {
      radios[0]?.click();
      await Promise.resolve();
    });
    expect(localStorage.getItem('astraya.theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
