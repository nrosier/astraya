// @vitest-environment jsdom
/**
 * The composite screen's method control (owner decision, #1406 D2): the near-arc midpoint is the default, and the
 * Davison relationship chart is offered beside it, with the basis line following the chosen method.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => new Promise<number>(() => undefined) };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', () => {
  const moment = {
    civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    coordinates: { latitude: 41.1833, longitude: -84.7333 },
    zoneOverride: 'America/New_York',
  };
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      ['p1', { id: 'p1', displayName: 'Test', timeAccuracy: 'exact', moment }],
      ['p2', { id: 'p2', displayName: 'Partner', timeAccuracy: 'exact', moment }],
    ]),
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

describe('composite method control (#1406 D2)', () => {
  it('offers midpoint and Davison, with midpoint as the default', async () => {
    setLocale('en');
    const { CompositeView } = await import('../src/ui/CompositeView.js');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<CompositeView personId="p1" />);
        await Promise.resolve();
      });
      const group = container.querySelector('[role="radiogroup"]');
      expect(group?.textContent).toContain('Davison (relationship chart)');
      expect(group?.textContent).toContain('Midpoint (near-arc)');
      const checked = container.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      expect(checked?.closest('label')?.textContent ?? checked?.parentElement?.textContent).toContain(
        'Midpoint (near-arc)',
      );
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
