// @vitest-environment jsdom
/**
 * #1440: a playback step must move the transiting glyphs and cross-ring lines by attribute and leave the wheel's static
 * parts (the svg, zodiac ring, house spokes, natal ring) as the same DOM nodes. The baseline is the old
 * `dangerouslySetInnerHTML` injection, which replaces every node on each new markup string.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { HousePositions } from '../src/ephemeris/types.js';
import { renderMultiWheelSvg, type WheelRingInput } from '../src/chart/multi-wheel.js';
import { PatchedWheel } from '../src/ui/wheel-morph.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOUSES: HousePositions = {
  cusps: [0, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  ascendant: 0,
  midheaven: 270,
  armc: 0,
  vertex: 0,
  equatorialAscendant: 0,
  coAscendantKoch: 0,
  coAscendantMunkasey: 0,
  polarAscendant: 0,
  system: 'A',
};
const TRANSIT_HOUSES: HousePositions = { ...HOUSES, ascendant: 50, midheaven: 320 };

const natal: WheelRingInput = {
  label: 'Natal',
  houses: HOUSES,
  bodies: [
    { body: 0, key: 'sun', longitude: 10 },
    { body: 1, key: 'moon', longitude: 190 },
  ],
};

/** The wheel at playback step `step`: only the transiting bodies' longitudes move. */
function markupAt(step: number): string {
  const transit: WheelRingInput = {
    label: 'Transit',
    houses: TRANSIT_HOUSES,
    bodies: [
      { body: 0, key: 'sun', longitude: 100 + step * 1.3 },
      { body: 2, key: 'mars', longitude: 280 + step * 0.7 },
    ],
  };
  return renderMultiWheelSvg([natal, transit]);
}

let root: Root | undefined;
let container: HTMLElement;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
});

interface Run {
  readonly firstNodes: readonly Element[];
  readonly lastNodes: readonly Element[];
  readonly removed: number;
  /** Elements present after the first draw that are no longer in the document after the last step. */
  readonly replaced: number;
  readonly firstSvg: Element | null;
  readonly lastSvg: Element | null;
}

function play(render: (markup: string) => React.JSX.Element, steps = 10): Run {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(render(markupAt(0)));
  });
  const firstNodes = [...container.querySelectorAll('*')];
  const firstSvg = container.querySelector('svg');
  let removed = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) removed += record.removedNodes.length;
  });
  observer.observe(container, { childList: true, subtree: true });
  for (let step = 1; step <= steps; step++) {
    act(() => {
      root?.render(render(markupAt(step)));
    });
    removed += observer.takeRecords().reduce((sum, record) => sum + record.removedNodes.length, 0);
  }
  observer.disconnect();
  const lastNodes = [...container.querySelectorAll('*')];
  return {
    firstNodes,
    lastNodes,
    replaced: firstNodes.filter((element) => !lastNodes.includes(element)).length,
    removed,
    firstSvg,
    lastSvg: container.querySelector('svg'),
  };
}

const isStatic = (element: Element): boolean =>
  element.closest('[data-ring="1"], [data-aspect-body-a], [data-ring-legend]') === null &&
  !element.matches('[data-ring="1"], [data-aspect-body-a]');

describe('wheel playback does not rebuild the static parts (#1440)', () => {
  it('baseline: dangerouslySetInnerHTML replaces every node on every step', () => {
    const run = play((markup) => <div dangerouslySetInnerHTML={{ __html: markup }} />);
    console.info(
      `BEFORE (dangerouslySetInnerHTML): ${String(run.replaced)} of ${String(run.firstNodes.length)} elements replaced, ${String(run.removed)} nodes removed over 10 steps`,
    );
    expect(run.lastSvg).not.toBe(run.firstSvg);
    expect(run.replaced).toBeGreaterThanOrEqual(run.firstNodes.length - 1);
  });

  it('patched: the svg and every static element keep their node, and the moving parts change by attribute', () => {
    const run = play((markup) => <PatchedWheel markup={markup} />);
    console.info(
      `AFTER (PatchedWheel): ${String(run.replaced)} of ${String(run.firstNodes.length)} elements replaced, ${String(run.removed)} nodes removed over 10 steps`,
    );
    expect(run.lastSvg).toBe(run.firstSvg);

    const staticFirst = run.firstNodes.filter(isStatic);
    expect(staticFirst.length).toBeGreaterThan(50);
    for (const element of staticFirst) expect(run.lastNodes).toContain(element);

    // The transiting glyph group is the same node and carries the last step's longitude.
    const sunGroups = container.querySelectorAll('[data-body="sun"][data-ring="1"]');
    expect(sunGroups.length).toBeGreaterThan(0);
    const firstSun = run.firstNodes.filter((e) => e.matches('[data-body="sun"][data-ring="1"]'));
    for (const element of firstSun) expect(run.lastNodes).toContain(element);
    expect(sunGroups[0]?.getAttribute('data-body-longitude')).toBe((100 + 10 * 1.3).toFixed(4));
    expect(run.removed).toBe(0);
    expect(run.replaced).toBe(0);
  });

  it('produces exactly the markup a fresh injection would', () => {
    const run = play((markup) => <PatchedWheel markup={markup} />);
    expect(run.lastSvg).not.toBeNull();
    const fresh = document.createElement('div');
    fresh.innerHTML = markupAt(10);
    expect(container.firstElementChild?.innerHTML).toBe(fresh.innerHTML);
  });
});
