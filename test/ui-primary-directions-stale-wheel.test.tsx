// @vitest-environment jsdom
/**
 * #1302 — changing the significators on the primary-directions screen must never commit a frame that draws the old
 * directed wheel next to the new tables. The directed chart is recomputed in an effect one render after the
 * directions load, so without a guard the first render with the new tables still held the previous chart: the wheel
 * showed for one frame, then unmounted and pushed the tables down. Runs against the real ephemeris engine (no mocks
 * of the calculation); a React Profiler records the DOM after every commit.
 */
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

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
});

interface Frame {
  readonly wheel: boolean;
  readonly rows: string;
}

const tableRows = (container: HTMLElement): string =>
  Array.from(container.querySelectorAll('tbody tr'))
    .map((row) => row.textContent)
    .join('|');

const isBusy = (container: HTMLElement): boolean => container.querySelector('div[aria-busy="true"]') !== null;

async function untilSettled(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600; i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    if (!isBusy(container) && container.querySelector('.chart-wheel') !== null) return;
  }
}

describe('primary directions stale directed wheel (#1302)', () => {
  it('never commits the old wheel beside the new tables after a significator change', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted = { container, root };
    const frames: Frame[] = [];
    let recording = false;
    const onRender = (): void => {
      if (recording)
        frames.push({ wheel: container.querySelector('.chart-wheel') !== null, rows: tableRows(container) });
    };
    act(() => {
      root.render(
        <Profiler id="pd" onRender={onRender}>
          <PrimaryDirectionsView personId="p1" />
        </Profiler>,
      );
    });
    await untilSettled(container);
    const before = tableRows(container);
    expect(before).not.toBe('');
    expect(container.querySelector('.chart-wheel')).not.toBeNull();

    const box = container.querySelector<HTMLInputElement>('.timing-checks fieldset input[type="checkbox"]');
    if (box === null) throw new Error('test fixture bug: no significator checkbox');
    recording = true;
    act(() => {
      box.click();
    });
    await untilSettled(container);
    recording = false;

    const after = tableRows(container);
    expect(after).not.toBe(before);
    expect(container.querySelector('.chart-wheel')).not.toBeNull();
    // Frames showing the new tables (neither the old rows nor the empty loading frame). The wheel may only appear once
    // its chart is computed from the new data, so the flag goes false -> true and never true -> false -> true: a stale wheel
    // for one frame followed by an unmount is exactly the flash.
    const newFrames = frames.filter((frame) => frame.rows !== before && frame.rows !== '');
    expect(newFrames.length).toBeGreaterThan(0);
    const flags = newFrames.map((frame) => frame.wheel);
    expect(flags.at(-1)).toBe(true);
    expect(flags.indexOf(true)).toBe(flags.lastIndexOf(false) + 1);
  }, 90_000);
});
