// @vitest-environment jsdom
/**
 * #1492: the Consultation view's solar-arc directions are computed in the person's own zodiac, not always the tropical.
 * Only the store and the ephemeris provider are faked; the solar-arc call is observed at the domain boundary.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { setLocale } from '../src/ui/locale.js';

const solarArcCalls: unknown[][] = [];
let personSettings: unknown;

vi.mock('../src/domain/solar-arc-directions.js', () => ({
  computeSolarArcDirections: (...args: unknown[]) => {
    solarArcCalls.push(args);
    return Promise.reject(new Error('stop after recording the call'));
  },
}));

vi.mock('../src/time/julian.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  julianDayFor: () => Promise.resolve(2440587.5),
}));

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => Promise.resolve(2451545) };
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
    get people() {
      return new Map([
        [
          'p1',
          {
            id: 'p1',
            displayName: 'Test',
            timeAccuracy: 'exact',
            moment,
            ...(personSettings === undefined ? {} : { calculationSettings: personSettings }),
          },
        ],
      ]);
    },
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

async function renderConsultation(): Promise<void> {
  setLocale('en');
  const { ConsultationView } = await import('../src/ui/ConsultationView.js');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<ConsultationView personId="p1" />);
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
}

describe('Consultation solar-arc zodiac (#1492)', () => {
  beforeEach(() => {
    solarArcCalls.length = 0;
    personSettings = undefined;
  });

  it('passes a sidereal zodiac for a sidereal person', async () => {
    personSettings = { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: 1 } };
    await renderConsultation();
    expect(solarArcCalls.length).toBeGreaterThan(0);
    expect(solarArcCalls[0]?.[3]).toMatchObject({ zodiac: { kind: 'sidereal', ayanamsa: 1 } });
  });

  it('passes the tropical zodiac for default settings', async () => {
    await renderConsultation();
    expect(solarArcCalls.length).toBeGreaterThan(0);
    expect(solarArcCalls[0]?.[3]).toMatchObject({ zodiac: { kind: 'tropical' } });
  });
});
