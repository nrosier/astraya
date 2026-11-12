// @vitest-environment jsdom
/**
 * #1400 / #1440: the Transits tab explainer. It sits under the date and animation bar as a Disclosure that is
 * collapsed by default, and opening it shows the owner's text (review 2026-11-12). The bi-wheel sentence takes
 * the person's own name, and the en and nl catalogues keep the same keys.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateAnimationBarMessages } from '../src/ui/DateAnimationBar.messages.js';
import { biWheelSelectionPanelMessages } from '../src/ui/BiWheelSelectionPanel.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { transitViewMessages } from '../src/ui/TransitView.messages.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = {
    // Never settles: the screen stays in its loading state, which is where the explainer must already be present.
    julianDayFromUtc: () => new Promise<number>(() => undefined),
  };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
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

const { TransitView } = await import('../src/ui/TransitView.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    const { container, root } = mounted;
    act(() => {
      root.unmount();
    });
    container.remove();
    mounted = undefined;
  }
});

async function mount(locale: 'en' | 'nl'): Promise<HTMLElement> {
  setLocale(locale);
  window.history.replaceState(null, '', '#/people/p1/timing/transits?date=2026-11-13');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TransitView personId="p1" />);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

const trigger = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('.primitive-disclosure-trigger');
  if (found === null) throw new Error('the Transits explainer has no disclosure trigger');
  return found;
};

const panel = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('.primitive-disclosure-panel');
  if (found === null) throw new Error('the Transits explainer has no panel');
  return found;
};

describe('Transits explainer (#1400, #1440)', () => {
  it('is a collapsed disclosure directly under the date and animation bar', async () => {
    const container = await mount('en');
    const bar = container.querySelector('.date-animation-bar-wrap');
    expect(bar).not.toBeNull();
    expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
    expect(panel(container).hidden).toBe(true);
    expect(panel(container).childElementCount).toBe(0);
    // Below the bar: the trigger follows the bar in document order.
    const after = bar?.compareDocumentPosition(trigger(container));
    expect(after !== undefined && (after & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    // The owner's text is not on screen until the disclosure opens.
    expect(container.textContent).not.toContain(dateAnimationBarMessages.en.hint);
    expect(container.textContent).not.toContain('A bi-wheel:');
  });

  it('expands to the owner text, naming the person from their own record', async () => {
    const container = await mount('en');
    await act(async () => {
      trigger(container).click();
      await Promise.resolve();
    });
    expect(trigger(container).getAttribute('aria-expanded')).toBe('true');
    const text = panel(container).textContent;
    expect(text).toContain(dateAnimationBarMessages.en.hint);
    expect(text).toContain(transitViewMessages.en.hint('Test'));
    expect(text).toContain(biWheelSelectionPanelMessages.en.hint);
    expect(text).not.toContain('Nick Rosier');
  });

  it('shows the Dutch explainer in nl, with the same keys as en', async () => {
    const container = await mount('nl');
    await act(async () => {
      trigger(container).click();
      await Promise.resolve();
    });
    const text = panel(container).textContent;
    expect(text).toContain(dateAnimationBarMessages.nl.hint);
    expect(text).toContain(transitViewMessages.nl.hint('Test'));
    expect(text).toContain(biWheelSelectionPanelMessages.nl.hint);
  });

  it('keeps the en and nl catalogues in key parity', () => {
    expect(Object.keys(transitViewMessages.nl).sort()).toEqual(Object.keys(transitViewMessages.en).sort());
    expect(Object.keys(dateAnimationBarMessages.nl).sort()).toEqual(Object.keys(dateAnimationBarMessages.en).sort());
  });
});
