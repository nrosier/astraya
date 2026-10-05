// @vitest-environment jsdom
/**
 * Click-to-isolate's pure DOM logic (#400, #412, #418, #448), independent of any chart's own
 * markup generator: a hand-built fragment carrying the same `data-*` attributes
 * `renderMultiWheelSvg` emits is enough to exercise `selectionKeyForTarget` and `applyIsolation`.
 */
import { describe, expect, it } from 'vitest';
import { applyIsolation, selectionKeyForTarget } from '../src/ui/wheel-interaction.js';

/** Narrows a `querySelector` result without a type-assertion cast or a `!`, since both are banned here. */
function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected a matching element');
  return value;
}

/** A two-ring bi-wheel: ring 0 has Sun/Moon with a Sun-Moon aspect, ring 1 has only a Sun, with a
 * cross-ring Sun(0)-Sun(1) aspect — close enough to a real synastry wheel to exercise every case. */
function biWheelFragment(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <svg>
      <g data-ring-legend="0">
        <line class="chart-multiwheel-legend-swatch chart-multiwheel-ring-0" />
        <text class="chart-multiwheel-legend-label">Ada</text>
      </g>
      <g data-ring-legend="1">
        <line class="chart-multiwheel-legend-swatch chart-multiwheel-ring-1" />
        <text class="chart-multiwheel-legend-label">Charles</text>
      </g>
      <g data-body="sun" data-ring="0" data-body-sign="aries"><text>Sun0</text></g>
      <g data-body="moon" data-ring="0" data-body-sign="taurus"><text>Moon0</text></g>
      <g data-body="sun" data-ring="1" data-body-sign="gemini"><text>Sun1</text></g>
      <g data-aspect-body-a="sun" data-aspect-body-b="moon" data-ring-a="0" data-ring-b="0"><line class="chart-aspect" /></g>
      <g data-aspect-body-a="sun" data-aspect-body-b="sun" data-ring-a="0" data-ring-b="1" class="chart-cross-aspect"><line class="chart-aspect chart-cross-aspect" /></g>
    </svg>
  `;
  return root;
}

describe('selectionKeyForTarget (#448)', () => {
  it('resolves a click on a ring legend entry to ring:<index>, from either the swatch or the label', () => {
    const root = biWheelFragment();
    const swatch = must(root.querySelector('[data-ring-legend="0"] .chart-multiwheel-legend-swatch'));
    const label = must(root.querySelector('[data-ring-legend="1"] .chart-multiwheel-legend-label'));
    expect(selectionKeyForTarget(swatch)).toBe('ring:0');
    expect(selectionKeyForTarget(label)).toBe('ring:1');
  });

  it('still resolves an ordinary body click to body:<id>, unaffected by the new ring case', () => {
    const root = biWheelFragment();
    const body = must(root.querySelector('[data-body="sun"][data-ring="0"]'));
    expect(selectionKeyForTarget(body)).toBe('body:sun@0');
  });
});

describe('applyIsolation with a ring selection (#448)', () => {
  it('keeps a ring’s own bodies, its own aspects and any cross-ring aspect touching it, dimming the rest', () => {
    const root = biWheelFragment();
    applyIsolation(root, 'ring:0');

    const sun0 = root.querySelector('[data-body="sun"][data-ring="0"]');
    const moon0 = root.querySelector('[data-body="moon"][data-ring="0"]');
    const sun1 = root.querySelector('[data-body="sun"][data-ring="1"]');
    expect(sun0?.classList.contains('chart-dimmed')).toBe(false);
    expect(moon0?.classList.contains('chart-dimmed')).toBe(false);
    // Ring 1's Sun isn't dimmed either: it's the far end of the cross-ring aspect ring 0's
    // selection keeps, the same "connected bodies stay lit too" rule a body/sign click already
    // applies — isolating a ring shows that person's tensions, including the ones with the
    // other person, not just their own chart in a vacuum.
    expect(sun1?.classList.contains('chart-dimmed')).toBe(false);

    const ownAspect = root.querySelector('[data-aspect-body-a="sun"][data-ring-a="0"][data-ring-b="0"]');
    const crossAspect = root.querySelector('[data-aspect-body-a="sun"][data-ring-a="0"][data-ring-b="1"]');
    expect(ownAspect?.classList.contains('chart-dimmed')).toBe(false);
    expect(crossAspect?.classList.contains('chart-dimmed')).toBe(false);
  });

  it('dims a ring that has no bodies at all under that selection (an out-of-range index)', () => {
    const root = biWheelFragment();
    applyIsolation(root, 'ring:2');
    for (const body of root.querySelectorAll('[data-body]')) {
      expect(body.classList.contains('chart-dimmed')).toBe(true);
    }
  });

  it('clears every dimming once the ring is clicked again (selection cleared)', () => {
    const root = biWheelFragment();
    applyIsolation(root, 'ring:0');
    applyIsolation(root, undefined);
    for (const body of root.querySelectorAll('[data-body]')) {
      expect(body.classList.contains('chart-dimmed')).toBe(false);
    }
  });
});
