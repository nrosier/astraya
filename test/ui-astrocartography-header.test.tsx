// @vitest-environment jsdom
/**
 * #978 — the Astrocartography header: the PageHeader subtitle, the Map settings drawer trigger and the
 * Build PDF primary link sit in the shared PageHeader's action cluster, and no Map settings pill is left
 * in the page body. Renders the real view with the same store, ephemeris and calculation-settings mocks
 * `ui-page-header-screens.test.tsx` uses, so the header is what the reader sees.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => new Promise<number>(() => undefined) };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      [
        'p1',
        {
          displayName: 'Test',
          timeAccuracy: 'exact',
          moment: {
            civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
            coordinates: { latitude: 41.1833, longitude: -84.7333 },
            zoneOverride: 'America/New_York',
          },
        },
      ],
    ]),
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

vi.mock('../src/ui/person-calculation-settings.js', async () => {
  const { DEFAULT_EXTENDED_SETTINGS } = await import('../src/chart/extended-settings.js');
  const { DEFAULT_RULERSHIP_CHOICE } = await import('../src/astrology/rulership.js');
  return {
    usePersonCalculationSettings: () => ({
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      unreadable: false,
    }),
  };
});

const { AstrocartographyView } = await import('../src/ui/AstrocartographyView.js');

async function renderView(): Promise<{ container: HTMLElement; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AstrocartographyView personId="p1" />);
    await Promise.resolve();
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('Astrocartography header (#978)', () => {
  it('states the page purpose as the PageHeader subtitle', async () => {
    const { container, unmount } = await renderView();
    const subtitle = container.querySelector('.page-header > .page-header-subtitle');
    expect(subtitle?.textContent).toBe(
      'A world map of the lines where each body was rising, setting, culminating or at the lowest point at birth.',
    );
    unmount();
  });

  it('states the person’s calculation profile in the header basis line', async () => {
    const { container, unmount } = await renderView();
    const basis = container.querySelector('.page-header > .page-header-basis');
    expect(basis?.textContent).toBe('Calculation profile: Modern Western — Astraya default');
    unmount();
  });

  it('puts Map settings (secondary) and Build PDF (primary link) in the header action cluster', async () => {
    const { container, unmount } = await renderView();
    const row = container.querySelector('.page-header-row');
    const settings = row?.querySelector('button.quiet[aria-haspopup="dialog"]');
    expect(settings?.textContent).toBe('Map settings');
    const pdf = row?.querySelector('a.primitive-button-primary');
    expect(pdf?.textContent).toBe('Build PDF →');
    expect(pdf?.getAttribute('href')).toBe('#/documents/pdf?person=p1&section=astrocartography');
    unmount();
  });

  it('keeps the Map settings trigger inside the header only', async () => {
    const { container, unmount } = await renderView();
    const triggers = [...container.querySelectorAll('button[aria-haspopup="dialog"]')];
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.closest('.page-header')).not.toBeNull();
    unmount();
  });
});
