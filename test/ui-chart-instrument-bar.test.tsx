// @vitest-environment jsdom
/**
 * The instrument bar under the natal wheel (#1532): the Hard, Soft and Minor pills are toggle buttons that can all be on
 * at once, and the Natal + transit / Natal only toggle shows only while the chart has a transit ring (owner decisions,
 * 2026-11-13).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { AspectTone } from '../src/astrology/aspects.js';
import { ALL_ASPECT_TONES, ChartInstrumentBar } from '../src/ui/ChartInstrumentBar.js';
import { chartInstrumentBarMessages } from '../src/ui/ChartInstrumentBar.messages.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = undefined;
  host = undefined;
});

interface Calls {
  tones: ReadonlySet<AspectTone>[];
  natalOnly: boolean[];
}

function mount(props: {
  readonly tones: ReadonlySet<AspectTone>;
  readonly transitRing: boolean;
  readonly natalOnly?: boolean;
}): { readonly bar: HTMLElement; readonly calls: Calls } {
  const calls: Calls = { tones: [], natalOnly: [] };
  host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  act(() => {
    created.render(
      <ChartInstrumentBar
        tones={props.tones}
        onTonesChange={(next) => calls.tones.push(next)}
        transitRing={props.transitRing}
        natalOnly={props.natalOnly ?? false}
        onNatalOnlyChange={(next) => calls.natalOnly.push(next)}
      />,
    );
  });
  const bar = host.querySelector<HTMLElement>('.chart-instrument-bar');
  if (bar === null) throw new Error('no bar rendered');
  return { bar, calls };
}

const pills = (bar: HTMLElement): HTMLButtonElement[] => [
  ...bar.querySelectorAll<HTMLButtonElement>('.chart-tone-pill'),
];

describe('the wheel instrument bar (#1532)', () => {
  it('shows Hard, Soft and Minor pills in that order, each pressed while its tone is on', () => {
    const { bar } = mount({ tones: new Set(['hard', 'minor']), transitRing: false });
    expect(pills(bar).map((pill) => pill.textContent)).toEqual(['Hard', 'Soft', 'Minor']);
    expect(pills(bar).map((pill) => pill.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    expect(pills(bar).map((pill) => pill.className)).toEqual([
      'chart-tone-pill chart-tone-pill--hard',
      'chart-tone-pill chart-tone-pill--soft',
      'chart-tone-pill chart-tone-pill--minor',
    ]);
  });

  it('turns one tone off or on without touching the others, so several can be on at once', () => {
    const { bar, calls } = mount({ tones: new Set(ALL_ASPECT_TONES), transitRing: false });
    act(() => {
      pills(bar)[1]?.click();
    });
    expect([...(calls.tones[0] ?? [])].sort()).toEqual(['hard', 'minor']);
  });

  it('turns a tone back on', () => {
    const { bar, calls } = mount({ tones: new Set(['hard']), transitRing: false });
    act(() => {
      pills(bar)[2]?.click();
    });
    expect([...(calls.tones[0] ?? [])].sort()).toEqual(['hard', 'minor']);
  });

  it('has no ring toggle or divider without a transit ring', () => {
    const { bar } = mount({ tones: new Set(ALL_ASPECT_TONES), transitRing: false });
    expect(bar.querySelector('[role="radiogroup"]')).toBeNull();
    expect(bar.querySelector('.chart-instrument-bar-divider')).toBeNull();
  });

  it('offers Natal + transit and Natal only with a transit ring, and reports the choice', () => {
    const { bar, calls } = mount({ tones: new Set(ALL_ASPECT_TONES), transitRing: true });
    const group = bar.querySelector<HTMLElement>('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe(chartInstrumentBarMessages.en.ringsLabel);
    const radios = [...bar.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((radio) => radio.checked)).toEqual([true, false]);
    expect(bar.querySelector('.chart-instrument-bar-divider')).not.toBeNull();
    act(() => {
      radios[1]?.click();
    });
    expect(calls.natalOnly).toEqual([true]);
  });

  it('names both groups for assistive technology', () => {
    const { bar } = mount({ tones: new Set(ALL_ASPECT_TONES), transitRing: false });
    expect(bar.getAttribute('aria-label')).toBe(chartInstrumentBarMessages.en.label);
    expect(bar.querySelector('.chart-instrument-bar-tones')?.getAttribute('aria-label')).toBe(
      chartInstrumentBarMessages.en.tonesLabel,
    );
  });
});
