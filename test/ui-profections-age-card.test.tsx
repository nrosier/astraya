// @vitest-environment jsdom
/**
 * The Profections age sits in its own titled card with the birth date (#1300): the card carries its title inside,
 * the age value, and the birth date written out in the reader's language, with no time of day.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => Promise.resolve(2460000) };
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
            civil: { year: 1970, month: 3, day: 10, hour: 17, minute: 30, second: 0 },
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

vi.mock('../src/domain/profections.js', () => {
  const period = { signIndex: 0, house: 1, signName: 'Aries', longitude: 10, ruler: 'mars' };
  return {
    computeProfections: () =>
      Promise.resolve({
        natalJd: 1,
        targetJd: 2,
        ascendant: 10,
        age: 34.52,
        year: { ...period, startJd: 1, endJd: 2 },
        month: { ...period, monthIndex: 0, startJd: 1, endJd: 2 },
      }),
  };
});

const { ProfectionsView } = await import('../src/ui/ProfectionsView.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    const { root, container } = mounted;
    act(() => {
      root.unmount();
    });
    container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function renderCard(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<ProfectionsView personId="p1" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const card = container.querySelector<HTMLElement>('section.timing-card.profection-age');
  if (card === null) throw new Error('age card not rendered');
  return card;
}

describe('the Profections age card (#1300)', () => {
  it('shows the title, the age and the birth date (no time) in one card', async () => {
    setLocale('en');
    const card = await renderCard();
    expect(card.querySelector('h2')?.textContent).toBe('Age');
    expect(card.querySelector('[data-testid="profection-age"]')?.textContent).toBe('34.52');
    expect(card.querySelector('[data-testid="profection-birth-date"]')?.textContent).toBe('March 10, 1970');
    expect(card.textContent).not.toMatch(/17:30|5:30/);
  });

  it('writes the birth date in Dutch', async () => {
    setLocale('nl');
    const card = await renderCard();
    expect(card.querySelector('h2')?.textContent).toBe('Leeftijd');
    expect(card.querySelector('[data-testid="profection-birth-date"]')?.textContent).toBe('10 maart 1970');
  });
});
