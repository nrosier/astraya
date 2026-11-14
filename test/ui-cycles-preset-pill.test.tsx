// @vitest-environment jsdom
/**
 * The cycle-search preset is a PillSelect (#1545), not a native select: the card lists the same options
 * the select offered, in the same order, and choosing one sets the same preset the select's change did
 * (the bodies, and the preset shown on the pill). Runs against the real ephemeris engine.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { bodyDisplayName } from '../src/ui/astro-names.messages.js';
import { CYCLE_BODY_KEYS, CYCLE_PRESETS } from '../src/ui/cycles.js';
import { cyclesViewMessages } from '../src/ui/CyclesView.messages.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

vi.mock('../src/ui/store-context.js', () => {
  const state = { people: new Map(), birthNotes: new Map(), consultationNotes: new Map() };
  return {
    useStoreState: () => state,
    useStore: () => ({ mutate: () => Promise.resolve() }),
    useOptionalStore: () => undefined,
  };
});

const { CyclesView } = await import('../src/ui/CyclesView.js');

const t = cyclesViewMessages.en;
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

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(<CyclesView />);
  });
  return container;
}

function pillOf(container: HTMLElement): HTMLButtonElement {
  const pill = container.querySelector<HTMLButtonElement>('button.primitive-pill-select-pill');
  if (pill === null) throw new Error('no preset pill');
  return pill;
}

describe('the cycle-search preset pill (#1545)', () => {
  it('pins the preset keys and the en labels the pill shows, as literal strings', () => {
    expect(CYCLE_PRESETS.map((preset) => preset.key)).toEqual([
      'jupiter-saturn',
      'saturn-uranus',
      'saturn-neptune',
      'saturn-pluto',
      'venus-pentagram',
    ]);
    const container = mount();
    act(() => {
      pillOf(container).click();
    });
    const labels = Array.from(container.querySelectorAll('[role="radio"]')).map((radio) => radio.textContent);
    expect(labels).toEqual([
      'Custom',
      'Jupiter–Saturn conjunctions (the great conjunction, ~20 years)',
      'Saturn–Uranus conjunctions (~45 years)',
      'Saturn–Neptune conjunctions (~36 years)',
      'Saturn–Pluto conjunctions (~33 years)',
      'Venus–Sun inferior conjunctions (the pentagram, 8 years)',
    ]);
  });

  it('offers Custom and every preset, in order, as radios in one radiogroup named Cycle', () => {
    const container = mount();
    const pill = pillOf(container);
    expect(container.querySelector('.primitive-pill-select-label')?.textContent).toBe(t.presetLabel);
    act(() => {
      pill.click();
    });
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-labelledby')).toBe(pill.getAttribute('aria-labelledby')?.split(' ')[0]);
    const radios = Array.from(container.querySelectorAll('[role="radio"]')).map((radio) => radio.textContent);
    expect(radios).toEqual([t.presetCustom, ...CYCLE_PRESETS.map((preset) => t.presets[preset.key])]);
  });

  it('choosing Venus-Sun sets the preset and its bodies, as the select did', async () => {
    const container = mount();
    expect(pillOf(container).textContent).toContain(t.presets['jupiter-saturn']);
    act(() => {
      pillOf(container).click();
    });
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (radio) => radio.textContent === t.presets['venus-pentagram'],
    );
    expect(option).toBeDefined();
    await act(async () => {
      option?.click();
      await Promise.resolve();
    });
    expect(pillOf(container).textContent).toContain(t.presets['venus-pentagram']);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const pills = Array.from(container.querySelectorAll('button.primitive-pill-select-pill')).map(
      (pill) => pill.textContent,
    );
    expect(pills[1]).toContain(bodyName('venus'));
    expect(pills[2]).toContain(bodyName('sun'));
  });
});

function bodyName(key: string): string {
  return bodyDisplayName(key, 'en');
}

describe('the first and second body pills (#1545)', () => {
  function bodyPill(container: HTMLElement, index: number): HTMLButtonElement {
    const pill = container.querySelectorAll<HTMLButtonElement>('button.primitive-pill-select-pill')[index];
    if (pill === undefined) throw new Error(`no pill ${String(index)}`);
    return pill;
  }

  it('labels both pills and lists every body, in the order the selects did', () => {
    const container = mount();
    const labels = Array.from(container.querySelectorAll('.primitive-pill-select-label')).map((l) => l.textContent);
    expect(labels).toEqual([t.presetLabel, t.bodyALabel, t.bodyBLabel]);
    expect(container.querySelectorAll('.tool-form select').length).toBe(1);
    for (const index of [1, 2]) {
      act(() => {
        bodyPill(container, index).click();
      });
      const radios = Array.from(container.querySelectorAll('[role="radio"]')).map((radio) => radio.textContent);
      expect(radios).toEqual(CYCLE_BODY_KEYS.map((key) => bodyName(key)));
      act(() => {
        bodyPill(container, index).click();
      });
    }
  });

  it('choosing a body sets that pill, closes the card and moves the preset to Custom', async () => {
    const container = mount();
    act(() => {
      bodyPill(container, 1).click();
    });
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (radio) => radio.textContent === bodyName('mars'),
    );
    await act(async () => {
      option?.click();
      await Promise.resolve();
    });
    expect(bodyPill(container, 1).textContent).toContain(bodyName('mars'));
    expect(bodyPill(container, 2).textContent).not.toContain(bodyName('mars'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(bodyPill(container, 0).textContent).toContain(t.presetCustom);
  });
});
