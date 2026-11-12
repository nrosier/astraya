// @vitest-environment jsdom
/**
 * The Solar Arc view calculates with the person's own settings (#1492, owner decision "Use person's settings"):
 * a sidereal person gets a sidereal solar-arc computation, and the basis line names that zodiac.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { setLocale } from '../src/ui/locale.js';

const computeSpy = vi.hoisted(() => vi.fn());

vi.mock('../src/domain/solar-arc-directions.js', () => ({
  computeSolarArcDirections: (...args: unknown[]) => {
    computeSpy(...args);
    return new Promise<never>(() => undefined);
  },
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
  const calculationSettings = {
    ...defaults,
    zodiac: { kind: 'sidereal', ayanamsa: 'lahiri' },
    houseSystem: 'W',
  };
  const state = {
    deleted: { people: new Map() },
    people: new Map([['p1', { id: 'p1', displayName: 'Test', timeAccuracy: 'exact', moment, calculationSettings }]]),
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

describe('Solar Arc view uses the person settings (#1492)', () => {
  it('computes in the person zodiac and names it in the basis line', async () => {
    setLocale('en');
    expect(DEFAULT_EXTENDED_SETTINGS.zodiac.kind).toBe('tropical');
    const { SolarArcView } = await import('../src/ui/SolarArcView.js');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<SolarArcView personId="p1" />);
        await Promise.resolve();
      });
      expect(computeSpy).toHaveBeenCalled();
      const options = computeSpy.mock.calls[0]?.[3] as { zodiac?: { kind: string }; houseSystem?: string } | undefined;
      expect(options?.zodiac?.kind).toBe('sidereal');
      expect(options?.houseSystem).toBe('W');
      expect(container.textContent).toContain('Sidereal');
      expect(container.textContent).not.toContain('Tropical');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
