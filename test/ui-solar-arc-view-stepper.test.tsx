// @vitest-environment jsdom
/**
 * #1400: the Solar Arc screen carries the same date stepper as Transits and Progressions (the shared DateAnimationBar in
 * date mode). Stepping changes the as-of date the directions are calculated for, and the date is written to the URL.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateAnimationBarMessages } from '../src/ui/DateAnimationBar.messages.js';
import { setLocale } from '../src/ui/locale.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/domain/solar-arc-directions.js', () => ({
  computeSolarArcDirections: () => new Promise<never>(() => undefined),
}));

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => Promise.resolve(2451545) };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', async () => {
  const { DEFAULT_EXTENDED_SETTINGS: defaults } = await import('../src/chart/extended-settings.js');
  const moment = {
    civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    coordinates: { latitude: 41.1833, longitude: -84.7333 },
    zoneOverride: 'America/New_York',
  };
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      ['p1', { id: 'p1', displayName: 'Test', timeAccuracy: 'exact', moment, calculationSettings: defaults }],
    ]),
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

const t = dateAnimationBarMessages.en;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('Solar Arc date stepper (#1400)', () => {
  it('renders the stepper, steps the date and writes it to the URL', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    setLocale('en');
    window.history.replaceState(null, '', '#/people/p1/timing/solar-arc?date=2026-11-10');
    const { SolarArcView } = await import('../src/ui/SolarArcView.js');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<SolarArcView personId="p1" />);
      await Promise.resolve();
    });
    const group = container.querySelector(`[role="group"][aria-label="${t.groupLabel}"]`);
    expect(group).not.toBeNull();
    const dateInput = (): HTMLInputElement => {
      const found = group?.querySelector('input[type="date"]');
      if (!(found instanceof HTMLInputElement)) throw new Error('no date input');
      return found;
    };
    expect(dateInput().value).toBe('2026-11-10');
    const forward = [...container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === t.stepForward(t.intervalNames.day),
    );
    expect(forward).toBeDefined();
    // Solar arc does not animate: no play button, as on Progressions.
    expect(container.querySelector(`button[aria-label="${t.play}"]`)).toBeNull();
    act(() => {
      forward?.click();
    });
    expect(dateInput().value).toBe('2026-11-11');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(window.location.hash).toContain('date=2026-11-11');
    act(() => {
      root.unmount();
    });
  });
});
