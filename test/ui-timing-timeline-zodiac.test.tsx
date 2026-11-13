// @vitest-environment jsdom
/**
 * #1492: the timing timeline calculates with the person's own calculation settings, not the engine defaults.
 * The real Swiss Ephemeris engine runs (test/engine-harness.ts); only the store and the provider context are
 * stand-ins. Primary directions stay tropical and Placidus by design, so that track is not compared.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, orbsOf, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { solarArcToTimelineEvents } from '../src/domain/timing-timeline.js';
import { computeSolarArcDirections } from '../src/domain/solar-arc-directions.js';
import { civilFromJulianDay } from '../src/time/julian.js';
import { timelineSubjectLabel } from '../src/ui/timing-timeline-labels.js';
import { setLocale } from '../src/ui/locale.js';
import { getEngine } from './engine-harness.js';

interface FakePerson {
  id: string;
  displayName: string;
  timeAccuracy: string;
  moment: unknown;
  calculationSettings?: ExtendedSettings;
  calculationSettingsUnreadable?: boolean;
}

const engine = vi.hoisted(() => ({ provider: undefined as unknown }));
const stored = vi.hoisted(() => ({ person: undefined as unknown }));

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine.provider, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => ({
  useStoreState: () => ({
    deleted: { people: new Map() },
    people: new Map([['p1', stored.person]]),
  }),
  useStore: () => ({}),
  useOptionalStore: () => undefined,
}));

// A natal Sun early in the zodiac (Gemini): the solar-arc search (#47) finds exact dates for it. A late-zodiac Sun yields none.
const MOMENT = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const LAHIRI = 1;
const SIDEREAL: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal', ayanamsa: LAHIRI } };

function setPerson(extra: Partial<FakePerson>): void {
  stored.person = { id: 'p1', displayName: 'Test', timeAccuracy: 'exact', moment: MOMENT, ...extra };
}

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
  vi.useRealTimers();
});

async function render(): Promise<HTMLElement> {
  setLocale('en');
  // Pin "today" so every run reads the same centre date.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  const { TimingTimelineView } = await import('../src/ui/TimingTimelineView.js');
  const container = document.createElement('div');
  document.body.append(container);
  mounted = { container, root: createRoot(container) };
  await act(async () => {
    mounted?.root.render(<TimingTimelineView personId="p1" />);
    await Promise.resolve();
  });
  return container;
}

async function settled(container: HTMLElement): Promise<void> {
  await vi.waitFor(
    () => {
      expect(container.querySelector('[aria-busy="false"]')).not.toBeNull();
      expect(container.querySelector('tr[data-row-key]')).not.toBeNull();
    },
    { timeout: 100_000, interval: 200 },
  );
}

/** The table rows of one technique, as `event start end` text, in table order. */
function rowsOf(container: HTMLElement, technique: string): string[] {
  return [...container.querySelectorAll('tr[data-row-key]')]
    .map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent).join(' | '))
    .filter((text) => text.startsWith(`${technique} |`));
}

const TRACKS = ['Profections', 'Solar arc directions', 'Transits'] as const;

async function renderedTracks(): Promise<Record<(typeof TRACKS)[number], string[]>> {
  const container = await render();
  await settled(container);
  return Object.fromEntries(TRACKS.map((track) => [track, rowsOf(container, track)])) as Record<
    (typeof TRACKS)[number],
    string[]
  >;
}

/** `event | start` for each solar-arc event the engine gives for the zodiac, as the timeline table renders them. */
async function expectedSolarArcRows(settings: ExtendedSettings): Promise<Set<string>> {
  const provider = await getEngine();
  const targetJd = await provider.julianDayFromUtc(2026, 11, 12, 12, 0, 0);
  const { orbConfig } = orbsOf(settings);
  const directions = await computeSolarArcDirections(MOMENT, targetJd, provider, {
    houseSystem: settings.houseSystem,
    zodiac: settings.zodiac,
    orbConfig,
  });
  return new Set(
    solarArcToTimelineEvents(directions).map((event) => {
      const { year, month, day } = civilFromJulianDay(event.startJd);
      const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return `${timelineSubjectLabel(event.subject, 'en')} | ${start}`;
    }),
  );
}

describe('the timing timeline uses the person settings (#1492)', () => {
  it('shows different profection, solar-arc and transit events for a sidereal person', async () => {
    setPerson({});
    const tropical = await renderedTracks();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;
    setPerson({ calculationSettings: SIDEREAL });
    const sidereal = await renderedTracks();
    for (const track of TRACKS) {
      expect(tropical[track].length, `${track} has events`).toBeGreaterThan(0);
      expect(sidereal[track], `${track} differs in the sidereal zodiac`).not.toEqual(tropical[track]);
    }
    // The differing events are the sidereal ones: each solar-arc row is a contact computeSolarArcDirections gives for the sidereal zodiac.
    const expectedSidereal = await expectedSolarArcRows(SIDEREAL);
    const expectedTropical = await expectedSolarArcRows(DEFAULT_EXTENDED_SETTINGS);
    const keyOf = (row: string): string => row.split(' | ').slice(1, 3).join(' | ');
    const siderealKeys = sidereal['Solar arc directions'].map(keyOf);
    for (const key of siderealKeys) {
      expect(expectedSidereal.has(key), `timeline solar-arc event "${key}" is a sidereal direction`).toBe(true);
    }
    expect(
      siderealKeys.some((key) => !expectedTropical.has(key)),
      'at least one timeline solar-arc event exists only in the sidereal zodiac',
    ).toBe(true);
  }, 240_000);

  it('recalculates when the person changes zodiac', async () => {
    setPerson({});
    const container = await render();
    await settled(container);
    const before = rowsOf(container, 'Profections');
    setPerson({ calculationSettings: SIDEREAL });
    const { TimingTimelineView } = await import('../src/ui/TimingTimelineView.js');
    await act(async () => {
      mounted?.root.render(<TimingTimelineView personId="p1" />);
      await Promise.resolve();
    });
    await vi.waitFor(
      () => {
        expect(rowsOf(container, 'Profections')).not.toEqual(before);
      },
      { timeout: 100_000, interval: 200 },
    );
  }, 240_000);

  it('keeps the tropical events for a person on default settings', async () => {
    setPerson({});
    const defaults = await renderedTracks();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;
    setPerson({ calculationSettings: DEFAULT_EXTENDED_SETTINGS });
    const explicit = await renderedTracks();
    expect(explicit).toEqual(defaults);
  }, 240_000);

  it('shows the notice, and no timeline, when the saved settings are unreadable', async () => {
    setPerson({ calculationSettingsUnreadable: true });
    const container = await render();
    expect(container.textContent).toContain("Test's saved chart settings");
    expect(container.querySelector('tr[data-row-key]')).toBeNull();
  });
});
