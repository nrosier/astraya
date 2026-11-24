// @vitest-environment jsdom
/**
 * #1935: the Progressions view reads the person's zodiac, as the timing timeline does, and shows the user-defined
 * ayanamsa note under the MC method for a user-defined ayanamsa only. The real Swiss Ephemeris engine runs; only the
 * store and the provider context are stand-ins, and computeSecondaryProgression records the options it is given.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as SecondaryProgressionModule from '../src/domain/secondary-progression.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { timingTimelineViewMessages } from '../src/ui/TimingTimelineView.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { getEngine } from './engine-harness.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const engine = vi.hoisted(() => ({ provider: undefined as unknown }));
const stored = vi.hoisted(() => ({ person: undefined as unknown }));
const calls = vi.hoisted(() => ({ options: [] as unknown[] }));

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine.provider, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => ({
  useStoreState: () => ({ deleted: { people: new Map() }, people: new Map([['p1', stored.person]]) }),
  useStore: () => ({}),
  useOptionalStore: () => undefined,
}));

vi.mock('../src/domain/secondary-progression.js', async (importOriginal) => {
  const original = await importOriginal<typeof SecondaryProgressionModule>();
  return {
    ...original,
    computeSecondaryProgression: (...args: Parameters<typeof original.computeSecondaryProgression>) => {
      calls.options.push(args[3]);
      return original.computeSecondaryProgression(...args);
    },
  };
});

const MOMENT = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const USER: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  zodiac: { kind: 'sidereal', ayanamsa: 255, user: { referenceDate: '2000-01-01', degrees: 24 } },
};
const LAHIRI: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: 1 } };

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  engine.provider = await getEngine();
}, 60_000);

afterEach(() => {
  if (mounted !== undefined) {
    const { root, container } = mounted;
    act(() => {
      root.unmount();
    });
    container.remove();
    mounted = undefined;
  }
  calls.options.length = 0;
});

async function renderWith(settings: ExtendedSettings): Promise<HTMLElement> {
  setLocale('en');
  window.history.replaceState(null, '', '#/people/p1/timing/progressions?date=2026-11-10');
  stored.person = {
    id: 'p1',
    displayName: 'Test',
    timeAccuracy: 'exact',
    moment: MOMENT,
    calculationSettings: settings,
  };
  const { ProgressionsView } = await import('../src/ui/ProgressionsView.js');
  const container = document.createElement('div');
  document.body.append(container);
  mounted = { container, root: createRoot(container) };
  await act(async () => {
    mounted?.root.render(<ProgressionsView personId="p1" />);
    await Promise.resolve();
  });
  await vi.waitFor(
    () => {
      expect(container.textContent).toContain('MC method:');
    },
    { timeout: 60_000, interval: 200 },
  );
  return container;
}

describe('the Progressions view uses the person zodiac (#1935)', () => {
  const note = timingTimelineViewMessages.en.progressedAnglesRigidNote;

  it('passes the zodiac to the calculation and shows the note for a user-defined ayanamsa', async () => {
    const container = await renderWith(USER);
    expect(calls.options[0]).toMatchObject({ mcMethod: 'naibod', zodiac: USER.zodiac });
    expect(container.textContent).toContain(note);
  }, 120_000);

  it('passes a built-in sidereal zodiac and shows no note', async () => {
    const container = await renderWith(LAHIRI);
    expect(calls.options[0]).toMatchObject({ mcMethod: 'naibod', zodiac: LAHIRI.zodiac });
    expect(container.textContent).not.toContain(note);
  }, 120_000);
});
