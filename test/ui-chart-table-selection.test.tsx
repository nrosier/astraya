// @vitest-environment jsdom
/**
 * The Positions and Aspects tables share the wheel's selection (#418): a button on a row selects it
 * on the wheel, the row the wheel has selected is marked, and a bar on the table says what is
 * selected and takes you to the chart. Against a real computed chart.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { setLocale } from '../src/ui/locale.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { getEngine } from './engine-harness.js';

let data: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  data = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    await getEngine(),
  );
}, 60_000);

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mount(showHouses = true): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ChartDataView load={{ kind: 'ready', data }} displayName="Test" showHouses={showHouses} />);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

async function open(container: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(`#chart-tab-${key}`)?.click();
    await Promise.resolve();
  });
}
async function press(button: Element | null | undefined): Promise<void> {
  if (button === null || button === undefined) throw new Error('fixture bug: no such button');
  await act(async () => {
    (button as HTMLButtonElement).click();
    await Promise.resolve();
  });
}
const showButton = (container: HTMLElement, name: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const dimmed = (container: HTMLElement): number => container.querySelectorAll('.chart-wheel .chart-dimmed').length;

describe('a table row selects on the wheel (#418)', () => {
  it('a Positions row’s button isolates that body on the wheel, marks the row, and says so on the table', async () => {
    const container = await mount();
    expect(dimmed(container)).toBe(0);
    await open(container, 'positions');
    const sun = showButton(container, 'Show Sun on the chart');
    expect(sun?.getAttribute('aria-pressed')).toBe('false');
    await press(sun);

    // The wheel (still mounted, hidden) has dimmed everything but the Sun and what it touches.
    expect(dimmed(container)).toBeGreaterThan(0);
    expect(showButton(container, 'Show Sun on the chart')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('tr.data-table-row-selected')?.textContent).toContain('Sun');
    expect(container.querySelector('.chart-selection-bar')?.textContent).toContain('Selected on the chart:');

    // Pressing it again clears the selection everywhere.
    await press(showButton(container, 'Show Sun on the chart'));
    expect(dimmed(container)).toBe(0);
    expect(container.querySelector('tr.data-table-row-selected')).toBeNull();
    expect(container.querySelector('.chart-selection-bar')).toBeNull();
  });

  it('"Go to the chart" shows the selection on the wheel, with its panel; "Clear" removes it', async () => {
    const container = await mount();
    await open(container, 'positions');
    await press(showButton(container, 'Show Moon on the chart'));
    const goTo = Array.from(container.querySelectorAll('.chart-selection-bar button')).find(
      (button) => button.textContent === 'Go to the chart',
    );
    await press(goTo);
    expect(container.querySelector('#chart-tabpanel-chart')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('.chart-isolation-panel')).not.toBeNull();

    await open(container, 'positions');
    const clear = Array.from(container.querySelectorAll('.chart-selection-bar button')).find(
      (button) => button.textContent === 'Clear',
    );
    await press(clear);
    expect(dimmed(container)).toBe(0);
  });

  it('an Aspects row’s button isolates that aspect line and its two bodies, and marks the row', async () => {
    const container = await mount();
    await open(container, 'aspects');
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('#chart-tabpanel-aspects button[aria-label^="Show "]'),
    );
    expect(buttons.length).toBeGreaterThan(0);
    await press(buttons[0]);
    expect(dimmed(container)).toBeGreaterThan(0);
    expect(container.querySelectorAll('tr.data-table-row-selected')).toHaveLength(1);
    expect(container.querySelector('.chart-selection-bar')).not.toBeNull();
  });

  it('a click on the wheel marks the matching table row, in the other direction', async () => {
    const container = await mount();
    const sunOnWheel = container.querySelector<SVGElement>('.chart-wheel [data-body="sun"]');
    if (sunOnWheel === null) throw new Error('fixture bug: no Sun on the wheel');
    await act(async () => {
      sunOnWheel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await open(container, 'positions');
    expect(container.querySelector('tr.data-table-row-selected')?.textContent).toContain('Sun');
    expect(showButton(container, 'Show Sun on the chart')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('has no buttons on rows with no symbol on the wheel (the Ascendant), nor without a wheel at all', async () => {
    const container = await mount();
    await open(container, 'positions');
    const rows = Array.from(container.querySelectorAll('#chart-tabpanel-positions tbody tr'));
    const ascendant = rows.find((row) => row.textContent.includes('Ascendant'));
    if (ascendant !== undefined) expect(ascendant.querySelector('button')).toBeNull();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;

    const noWheel = await mount(false);
    await open(noWheel, 'positions');
    expect(noWheel.querySelectorAll('#chart-tabpanel-positions tbody button')).toHaveLength(0);
  });

  it('says it in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const container = await mount();
    await open(container, 'positions');
    await press(showButton(container, 'Toon Zon op de horoscoop'));
    expect(container.querySelector('.chart-selection-bar')?.textContent).toContain('Geselecteerd op de horoscoop:');
  });
});
