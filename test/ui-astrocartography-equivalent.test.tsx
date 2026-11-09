// @vitest-environment jsdom
/**
 * #1371 — the Astrocartography screen's text equivalent of its map. Renders the real view on the real Swiss
 * Ephemeris. Only the Map settings drawer is replaced by a stub that hands its `onApply` to the test, so the test can
 * apply settings the way Apply does without driving the drawer's own form (covered by its own tests). Checks that:
 *   - the map stays aria-hidden and the table sits outside it, in normal document flow, reachable by keyboard;
 *   - every MC line the map draws has a row, and the rows follow the applied line-type and body filters;
 *   - applying a relocation place adds its row, and clearing it removes the row.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { MapSettings } from '../src/ui/map-settings.js';
import type * as MapSettingsDialogModule from '../src/ui/MapSettingsDialog.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
let apply: ((next: MapSettings) => void) | undefined;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

vi.mock('../src/ui/MapSettingsDialog.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MapSettingsDialogModule>();
  return {
    ...actual,
    MapSettingsDialog: ({ onApply }: { readonly onApply: (next: MapSettings) => void }) => {
      apply = onApply;
      return null;
    },
  };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      [
        'p1',
        {
          displayName: 'Test',
          timeAccuracy: 'exact',
          moment: {
            civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
            coordinates: { latitude: 41.1833, longitude: -84.7333 },
            offsetOverrideMinutes: 0,
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

const { AstrocartographyView } = await import('../src/ui/AstrocartographyView.js');
const { DEFAULT_MAP_SETTINGS } = await import('../src/ui/map-settings.js');
const { TRADITIONAL_ACG_BODY_IDS } = await import('../src/domain/astrocartography.js');
const { SE } = await import('../src/ephemeris/generated-constants.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted === undefined) return;
  const { container, root } = mounted;
  act(() => {
    root.unmount();
  });
  container.remove();
  mounted = undefined;
  apply = undefined;
});

async function settle(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 600; i++) {
    const map = container.querySelector('div.acg-map');
    if (map !== null && map.getAttribute('aria-busy') === 'false' && container.querySelector('tbody') !== null) return;
    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
  }
  throw new Error('the map never settled');
}

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<AstrocartographyView personId="p1" />);
    await Promise.resolve();
  });
  await settle(container);
  return container;
}

async function applySettings(container: HTMLElement, next: MapSettings): Promise<void> {
  const onApply = apply;
  if (onApply === undefined) throw new Error('Map settings stub was not rendered');
  act(() => {
    onApply(next);
  });
  // The map is marked updating first, then settles on the new data.
  await act(async () => {
    await Promise.resolve();
  });
  await settle(container);
}

function table(container: HTMLElement): HTMLTableElement {
  const heading = [...container.querySelectorAll('h2')].find((h) => h.textContent === 'What the map shows');
  const found = heading?.closest('section')?.querySelector('table');
  if (found === null || found === undefined) throw new Error('no text-equivalent table');
  return found;
}

function rows(container: HTMLElement): readonly (readonly string[])[] {
  return [...table(container).querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td, th')].map((cell) => cell.textContent),
  );
}

describe('the Astrocartography text equivalent (#1371)', () => {
  it('keeps the drawn map hidden and puts a named table outside it, in normal tab order', async () => {
    const container = await mount();
    const map = container.querySelector('div.acg-map');
    expect(map?.getAttribute('aria-hidden')).toBe('true');
    const found = table(container);
    expect(found.closest('[aria-hidden="true"]')).toBeNull();
    expect(found.getAttribute('aria-labelledby')).not.toBeNull();
    expect([...found.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Body',
      'Line or marker',
      'Where',
    ]);
    // The scroll frame is focusable for keyboard scrolling, and nothing in the table takes itself out of tab order.
    expect(found.closest('[role="region"]')?.getAttribute('tabindex')).toBe('0');
    expect(found.querySelector('[tabindex="-1"]')).toBeNull();
  });

  it('has one row per line the map draws, plus the birthplace', async () => {
    const container = await mount();
    const listed = rows(container);
    const drawnMc = container.querySelectorAll('div.acg-map line[class^="acg-line-mc "]').length;
    expect(drawnMc).toBe(TRADITIONAL_ACG_BODY_IDS.length);
    expect(listed.filter((row) => row[1] === 'MC (Midheaven)')).toHaveLength(drawnMc);
    expect(listed).toHaveLength(TRADITIONAL_ACG_BODY_IDS.length * 4 + 1);
    expect(listed.at(-1)).toEqual(['—', 'Birthplace', '41.18°N, 84.73°W']);
  });

  it('drops rows for a line type or body turned off in Map settings', async () => {
    const container = await mount();
    await applySettings(container, { ...DEFAULT_MAP_SETTINGS, lineTypes: ['IC', 'AC', 'DC'] });
    expect(container.querySelectorAll('div.acg-map line[class^="acg-line-mc "]')).toHaveLength(0);
    expect(rows(container).some((row) => row[1] === 'MC (Midheaven)')).toBe(false);
    expect(rows(container)).toHaveLength(TRADITIONAL_ACG_BODY_IDS.length * 3 + 1);

    await applySettings(container, {
      ...DEFAULT_MAP_SETTINGS,
      bodies: TRADITIONAL_ACG_BODY_IDS.filter((body) => body !== SE.SE_SUN),
    });
    expect(rows(container).some((row) => row[0] === 'Sun')).toBe(false);
    expect(rows(container)).toHaveLength((TRADITIONAL_ACG_BODY_IDS.length - 1) * 4 + 1);
  });

  it('adds the relocation place while a relocation is applied, and removes it when cleared', async () => {
    const container = await mount();
    expect(rows(container).some((row) => row[1] === 'Relocation place')).toBe(false);
    await applySettings(container, { ...DEFAULT_MAP_SETTINGS, relocationLat: '48.85', relocationLon: '2.35' });
    expect(rows(container).at(-1)).toEqual(['—', 'Relocation place', '48.85°N, 2.35°E']);
    await applySettings(container, DEFAULT_MAP_SETTINGS);
    expect(rows(container).some((row) => row[1] === 'Relocation place')).toBe(false);
  });
});
