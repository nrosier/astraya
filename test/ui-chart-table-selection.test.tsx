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
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { setLocale } from '../src/ui/locale.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
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

async function mount(
  showHouses = true,
  extendedSettings: ExtendedSettings = DEFAULT_EXTENDED_SETTINGS,
): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChartDataView
        rulership="modern"
        load={{ kind: 'ready', data }}
        displayName="Test"
        showHouses={showHouses}
        extendedSettings={extendedSettings}
        buildViewHref={() => '#'}
      />,
    );
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

/** `'positions'`/`'aspects'`/`'chart'` are this file's own names for Placements/Aspects/Wheel (#511). */
const LABEL_KEY = {
  positions: 'placementsViewLabel',
  aspects: 'aspectsViewLabel',
  chart: 'wheelViewLabel',
} as const satisfies Record<string, keyof typeof chartViewMessages.en>;
async function open(container: HTMLElement, key: keyof typeof LABEL_KEY): Promise<void> {
  const labelKey = LABEL_KEY[key];
  // Matches either locale's label, so this helper works whichever language a test has set.
  const labels: readonly string[] = [chartViewMessages.en[labelKey], chartViewMessages.nl[labelKey]];
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLAnchorElement>('.chart-view-link'))
      .find((link) => labels.some((label) => link.textContent === label))
      ?.click();
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
    expect(container.querySelector('#chart-view-wheel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('.selection-inspector-facts')).not.toBeNull();

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
      container.querySelectorAll<HTMLButtonElement>('#chart-view-aspects button[aria-label^="Show "]'),
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
    const rows = Array.from(container.querySelectorAll('#chart-view-placements tbody tr'));
    const ascendant = rows.find((row) => row.textContent.includes('Ascendant'));
    // No body button on the Ascendant (nothing to select as a body), though its sign can still be shown.
    if (ascendant !== undefined) {
      expect(Array.from(ascendant.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Show sign']);
    }
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    mounted = undefined;

    const noWheel = await mount(false);
    await open(noWheel, 'positions');
    expect(noWheel.querySelectorAll('#chart-view-placements tbody button')).toHaveLength(0);
  });

  it('says it in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const container = await mount();
    await open(container, 'positions');
    await press(showButton(container, 'Toon Zon op de horoscoop'));
    expect(container.querySelector('.chart-selection-bar')?.textContent).toContain('Geselecteerd op de horoscoop:');
  });

  it('a Houses row’s button selects that house’s cusp: wheel, inspector heading, marked row, and back (#511)', async () => {
    const container = await mount();
    await open(container, 'positions');
    const button = showButton(container, 'Show House 5 on the chart');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    await press(button);

    expect(dimmed(container)).toBeGreaterThan(0);
    expect(container.querySelector('.chart-wheel [data-house="5"]')?.classList.contains('chart-dimmed')).toBe(false);
    expect(container.querySelector('.chart-wheel [data-house="6"]')?.classList.contains('chart-dimmed')).toBe(true);
    expect(container.querySelector('tr.data-table-row-selected')?.textContent).toContain('5');
    expect(showButton(container, 'Show House 5 on the chart')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.chart-selection-bar')?.textContent).toMatch(/on the cusp of house 5/);

    // The inspector says the same, with the sign's meaning for that cusp.
    const goTo = Array.from(container.querySelectorAll('.chart-selection-bar button')).find(
      (b) => b.textContent === 'Go to the chart',
    );
    await press(goTo);
    expect(container.querySelector('.selection-inspector-facts strong')?.textContent).toMatch(/on the cusp of house 5/);

    // Pressing the same button again clears it everywhere.
    await open(container, 'positions');
    await press(showButton(container, 'Show House 5 on the chart'));
    expect(dimmed(container)).toBe(0);
    expect(container.querySelector('.chart-selection-bar')).toBeNull();
  });

  it('a click on a house number on the wheel selects the same house the table marks', async () => {
    const container = await mount();
    const house = container.querySelector<SVGElement>('.chart-wheel [data-house="3"]');
    if (house === null) throw new Error('fixture bug: no house 3 on the wheel');
    await act(async () => {
      house.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('.selection-inspector-facts strong')?.textContent).toMatch(/house 3/);
    await open(container, 'positions');
    expect(showButton(container, 'Show House 3 on the chart')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('a “Show sign” button selects that sign on the wheel, the inspector and every button for it, and toggles off (#511)', async () => {
    const container = await mount();
    await open(container, 'positions');
    const button = showButton(container, 'Show Capricorn on the chart');
    expect(button?.textContent).toBe('Show sign');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    await press(button);

    expect(container.querySelector('.chart-wheel [data-sign="capricorn"]')?.classList.contains('chart-dimmed')).toBe(
      false,
    );
    expect(container.querySelector('.chart-wheel [data-sign="libra"]')?.classList.contains('chart-dimmed')).toBe(true);
    expect(container.querySelector('.chart-selection-bar')?.textContent).toContain('Capricorn');
    for (const other of container.querySelectorAll('button[aria-label="Show Capricorn on the chart"]')) {
      expect(other.getAttribute('aria-pressed')).toBe('true');
    }

    const goTo = Array.from(container.querySelectorAll('.chart-selection-bar button')).find(
      (b) => b.textContent === 'Go to the chart',
    );
    await press(goTo);
    expect(container.querySelector('.selection-inspector-facts strong')?.textContent).toBe('Capricorn');
    // The same meaning the wheel click gives: the planets standing in the sign.
    expect(container.querySelector('.selection-inspector-facts')?.textContent).toContain('Sun');

    await open(container, 'positions');
    await press(showButton(container, 'Show Capricorn on the chart'));
    expect(dimmed(container)).toBe(0);
  });

  it('a Derived points row selects that point, with its position and meaning in the inspector, and toggles off (#511)', async () => {
    // Spirit has its own visibility entry now (#542, unified into objectPolicies by #585) — it
    // used to be shown unconditionally.
    const container = await mount(true, {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        partOfSpirit: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.partOfSpirit, visible: true },
      },
    });
    await open(container, 'positions');
    const button = showButton(container, 'Show Part of Spirit on the chart');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    await press(button);

    // Not drawn on the wheel, so nothing on it dims — but the row, bar and inspector all say so.
    expect(dimmed(container)).toBe(0);
    expect(container.querySelector('tr.data-table-row-selected')?.textContent).toContain('Part of Spirit');
    expect(container.querySelector('.chart-selection-bar')?.textContent).toContain('Part of Spirit');

    const goTo = Array.from(container.querySelectorAll('.chart-selection-bar button')).find(
      (b) => b.textContent === 'Go to the chart',
    );
    await press(goTo);
    const facts = container.querySelector('.selection-inspector-facts');
    expect(facts?.querySelector('.chart-isolation-head strong')?.textContent).toBe('Part of Spirit');
    // Where it falls is the badges under the heading: sign, degree and minute, then the house (#801).
    const badges = [...(facts?.querySelectorAll('.primitive-badge') ?? [])].map((badge) => badge.textContent);
    expect(badges[0]).toMatch(/°\d\d'$/);
    expect(badges[1]).toMatch(/^House \d+$/);
    // Its meaning section is there (the text itself comes from the corpus, or the mechanical sentence).
    expect(facts?.querySelector('.chart-isolation-interpretation')).not.toBeNull();

    await open(container, 'positions');
    await press(showButton(container, 'Show Part of Spirit on the chart'));
    expect(container.querySelector('.chart-selection-bar')).toBeNull();
  });
});
