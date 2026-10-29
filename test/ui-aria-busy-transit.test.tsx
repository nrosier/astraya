// @vitest-environment jsdom
/**
 * #888 — the Transit result region carries `aria-busy` while the transit calculates and drops it once the
 * calculation has ended. The ephemeris provider is a stub whose first call stays pending, holding the
 * recalculation state open; rejecting it ends the calculation (the error state is "not busy" too).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ reject: undefined as ((reason: Error) => void) | undefined }));

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = {
    julianDayFromUtc: () =>
      new Promise<number>((_resolve, reject) => {
        gate.reject = reject;
      }),
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

describe('the transit result region (#888)', () => {
  it('is aria-busy while calculating and cleared once the calculation ends', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<TransitView personId="p1" />);
        await Promise.resolve();
      });
      const busy = (): string | null => container.querySelector('div[aria-busy]')?.getAttribute('aria-busy') ?? null;
      expect(busy()).toBe('true');
      expect(gate.reject).toBeDefined();

      await act(async () => {
        gate.reject?.(new Error('stopped'));
        await Promise.resolve();
      });
      expect(busy()).toBe('false');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
