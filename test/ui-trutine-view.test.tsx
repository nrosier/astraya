// @vitest-environment jsdom
/**
 * The Trutine of Hermes screen (#1407): a Julian-calendar birth gets the conception summary and the check line from
 * the real engine; a Gregorian birth is converted and calculated; one outside the engine's range gets the range message. The numbers are read back from the domain result,
 * not invented. Text is the English catalogue, with Dutch parity checked on the key set.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeTrutineConception } from '../src/domain/trutine.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { formatCivilDate, formatDecimalExact } from '../src/ui/format.js';
import { setLocale } from '../src/ui/locale.js';
import { trutineViewMessages } from '../src/ui/TrutineView.messages.js';
import { getEngine } from './engine-harness.js';

const julianMoment: BirthMomentInput = {
  civil: { year: 1850, month: 6, day: 15, hour: 12, minute: 0, second: 0 },
  coordinates: { latitude: 51.5074, longitude: -0.1278 },
  offsetOverrideMinutes: 0,
  calendar: 'julian',
};
const gregorianMoment: BirthMomentInput = {
  ...julianMoment,
  civil: { ...julianMoment.civil, day: 27 },
  calendar: 'gregorian',
};
const earlyGregorianMoment: BirthMomentInput = {
  ...gregorianMoment,
  civil: { ...julianMoment.civil, year: 1750 },
};

const holder = vi.hoisted(() => ({ moment: undefined as unknown, engine: undefined as unknown }));

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: holder.engine, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    get people() {
      return new Map([['p1', { id: 'p1', displayName: 'Test', timeAccuracy: 'exact', moment: holder.moment }]]);
    },
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

let mounted: { container: HTMLElement; unmount: () => void } | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted?.container.remove();
  mounted = undefined;
  setLocale('en');
});

async function mountView(moment: BirthMomentInput): Promise<HTMLElement> {
  setLocale('en');
  holder.moment = moment;
  holder.engine = await getEngine();
  const { TrutineView } = await import('../src/ui/TrutineView.js');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
  await act(async () => {
    root.render(<TrutineView personId="p1" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // The engine calls settle over several turns; wait for the summary or give up.
  for (let i = 0; i < 100 && container.querySelector('.metric-cards') === null; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
  return container;
}

describe('TrutineView (#1407)', () => {
  it('shows the conception date, the gestation, the column and the check from the domain result', async () => {
    const expected = await computeTrutineConception(julianMoment, await getEngine());
    const container = await mountView(julianMoment);
    const text = container.querySelector('.metric-cards')?.textContent ?? '';
    expect(text).toContain(formatCivilDate(expected.conception, 'en'));
    expect(text).toContain(`${String(expected.gestationDays)} days`);
    expect(text).toContain(expected.column === 'under' ? 'Moon under the earth' : 'Moon above the earth');
    const check = container.querySelector('[data-kind="success"], [data-kind="partial"]');
    expect(check?.getAttribute('data-kind')).toBe(expected.check.passed ? 'success' : 'partial');
    expect(check?.textContent).toContain(`${formatDecimalExact(expected.check.distance, 1, 'en')}°`);
    expect(container.querySelector('.page-header-basis')?.textContent).toContain('Trutine of Hermes (Lilly');
  }, 60_000);

  it('calculates a Gregorian birth within the range and shows both conception dates', async () => {
    const expected = await computeTrutineConception(gregorianMoment, await getEngine());
    const container = await mountView(gregorianMoment);
    const text = container.querySelector('.metric-cards')?.textContent ?? '';
    expect(text).toContain(formatCivilDate(expected.conception, 'en'));
    expect(text).toContain('Conception (Gregorian date)');
    expect(expected.conceptionGregorian).toBeDefined();
  }, 60_000);

  it('shows 29 February 1900 on the Julian card, not 1 March, for a conception on 13 March 1900 Gregorian', async () => {
    // Born 1 December 1900 Gregorian, 20:00 UT at London: gestation 263 days, conception 29 February 1900 Julian
    // (= 13 March 1900 Gregorian). 1900 is a Julian leap year but not a Gregorian one.
    const leapDay: BirthMomentInput = {
      ...gregorianMoment,
      civil: { year: 1900, month: 12, day: 1, hour: 20, minute: 0, second: 0 },
    };
    const expected = await computeTrutineConception(leapDay, await getEngine());
    expect(expected.conception).toEqual({ year: 1900, month: 2, day: 29 });
    expect(expected.conceptionGregorian).toEqual({ year: 1900, month: 3, day: 13 });
    const container = await mountView(leapDay);
    const text = container.querySelector('.metric-cards')?.textContent ?? '';
    expect(text).toContain('February 29, 1900');
    expect(text).toContain('March 13, 1900');
    expect(text).not.toContain('March 1, 1900');
  }, 60_000);

  it('shows the outside-the-ephemeris-range message, and no chart, for a birth before 1800', async () => {
    const container = await mountView(earlyGregorianMoment);
    for (let i = 0; i < 100 && !(container.textContent ?? '').includes('outside the ephemeris range'); i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    expect(container.textContent).toContain('outside the ephemeris range');
    expect(container.querySelector('.metric-cards')).toBeNull();
  }, 60_000);

  it('has the same message keys in English and Dutch', () => {
    expect(Object.keys(trutineViewMessages.nl).sort()).toEqual(Object.keys(trutineViewMessages.en).sort());
  });
});
