// @vitest-environment jsdom
/**
 * #1795 — the Primary Directions key selector offers the true solar arc in RA key as its third option, labelled in en
 * and nl with the approved timing-basis wording, and choosing it computes the directions with that key (the domain
 * layer builds the solar-arc clock). Runs against the real ephemeris engine; `generatePrimaryDirections` is spied on
 * (passed through) only to observe the key the page hands it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as PrimaryDirectionsModule from '../src/domain/primary-directions.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { setLocale } from '../src/ui/locale.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

const generated = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock('../src/domain/primary-directions.js', async (importOriginal) => {
  const original = await importOriginal<typeof PrimaryDirectionsModule>();
  return {
    ...original,
    generatePrimaryDirections: (...args: Parameters<typeof original.generatePrimaryDirections>) => {
      generated.keys.push(String(args[2]));
      return original.generatePrimaryDirections(...args);
    },
  };
});

vi.mock('../src/ui/store-context.js', () => {
  const moment = {
    civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    coordinates: { latitude: 41.1833, longitude: -84.7333 },
    offsetOverrideMinutes: 0,
  };
  const person = {
    id: 'p1',
    displayName: 'Test',
    timeAccuracy: 'exact',
    moment,
    placeLabel: 'Fort Wayne, IN',
    notes: '',
    missing: [],
    customPoints: [],
  };
  const state = { people: new Map([[person.id, person]]), birthNotes: new Map(), consultationNotes: new Map() };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { PrimaryDirectionsView } = await import('../src/ui/PrimaryDirectionsView.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
  generated.keys.length = 0;
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(<PrimaryDirectionsView personId="p1" />);
  });
  return container;
}

async function untilSettled(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600; i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    if (container.querySelector('div[aria-busy="true"]') === null && container.querySelector('.chart-wheel') !== null)
      return;
  }
}

it('gives only the Time key group the multi-row track class, so Direction and Placidus method are unchanged (#2029)', async () => {
  setLocale('en');
  const container = mount();
  await untilSettled(container);
  const groups = Array.from(container.querySelectorAll('.timing-controls [role="radiogroup"]'));
  expect(groups.length).toBeGreaterThanOrEqual(3);
  expect(groups[0]?.classList.contains('timing-key-choice')).toBe(true);
  for (const other of groups.slice(1)) {
    expect(other.classList.contains('timing-key-choice')).toBe(false);
  }
}, 90_000);

function keyGroup(container: HTMLElement): Element {
  const group = container.querySelector('.timing-controls [role="radiogroup"]');
  if (group === null) throw new Error('test fixture bug: no key radiogroup');
  return group;
}

describe('primary directions key selector (#1795)', () => {
  it.each([
    ['en', 'True solar arc in RA key'],
    ['nl', 'Ware zonneboog in RK-sleutel'],
  ] as const)(
    'offers three keys and the third is the true solar arc in %s',
    async (locale, label) => {
      setLocale(locale);
      const container = mount();
      await untilSettled(container);
      const labels = Array.from(keyGroup(container).querySelectorAll('label')).map((node) => node.textContent.trim());
      expect(labels).toHaveLength(3);
      expect(labels[2]).toBe(label);
    },
    90_000,
  );

  it('passes TRUE_SOLAR_ARC to the calculation when the third key is chosen', async () => {
    const container = mount();
    await untilSettled(container);
    expect(generated.keys.at(-1)).toBe('naibod');
    const radio = keyGroup(container).querySelectorAll<HTMLInputElement>('input[type="radio"]')[2];
    if (radio === undefined) throw new Error('test fixture bug: no third key radio');
    act(() => {
      radio.click();
    });
    await untilSettled(container);
    expect(generated.keys.at(-1)).toBe('true-solar-arc');
    expect(container.querySelector('.chart-wheel')).not.toBeNull();
  }, 90_000);
});
